// =====================================================================
// sync.js — Client sync layer
// =====================================================================
// Keeps the on-device cache (localStorage + IndexedDB) in agreement with
// the cloud (Supabase, reached through the Cloudflare Worker).
//
// This file is the WRITE path: push new/updated books + characters up,
// delete them when removed, and compress images to JPEG before upload.
// (Reads / offline cache / migration come in later chunks.)
//
// All cloud calls are best-effort: if the network or Worker is down they
// reject, the caller logs it, and the local save still stands. A proper
// offline retry queue comes later.
// =====================================================================

const JPEG_QUALITY = 0.82;

// ---- Image helpers ----

// Re-encode an image blob as JPEG (smaller). Returns the original blob
// unchanged if it's already JPEG. Used for story images (no transparency).
async function compressToJpeg(blob, quality = JPEG_QUALITY) {
  if (!blob || blob.type === 'image/jpeg') return blob;
  try {
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    // Flatten any transparency onto white (story images are full-bleed anyway)
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0);
    if (bitmap.close) bitmap.close();
    const jpeg = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    return jpeg || blob;
  } catch (e) {
    console.warn('JPEG compression failed; keeping original', e);
    return blob;
  }
}

// ---- Cover thumbnails (egress saver) ----
// The Library shelf renders covers tiny, so we keep a small JPEG thumbnail in
// the SAME bucket under a derived id (<coverId>_t) and show that instead of the
// full cover. ~10-15x less data per shelf load for books not cached on-device.
// No DB/Worker changes: the id is derived, and /img/sign just skips a thumb
// that doesn't exist yet (old books fall back to the full cover).
function coverThumbId(coverImageId) { return coverImageId ? coverImageId + '_t' : null; }

// Downscale an image blob to a small JPEG (longest side = maxDim).
async function downscaleToThumb(blob, maxDim = 256, quality = 0.7) {
  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bitmap, 0, 0, w, h);
  if (bitmap.close) bitmap.close();
  return (await new Promise((res) => canvas.toBlob(res, 'image/jpeg', quality))) || blob;
}

// Make + upload a cover thumbnail from the full-cover blob. Best-effort.
async function uploadCoverThumb(coverImageId, fullBlob) {
  if (!coverImageId || !fullBlob) return false;
  try {
    const thumb = await downscaleToThumb(fullBlob);
    await uploadImageBlob(coverThumbId(coverImageId), thumb);
    return true;
  } catch (e) { console.warn('Cover thumb upload failed', coverImageId, e); return false; }
}

// Backfill: if a story's cover blob is on this device but its cloud thumbnail
// isn't made yet, make + upload one (once). Runs when a book is opened.
async function ensureCoverThumbUploaded(story) {
  const cid = story && story.cover && story.cover.image_id;
  if (!cid || story.cover.thumb_uploaded || !getStoredPassword()) return;
  try {
    const cb = await getImageBlob(cid);
    if (!cb) return;
    if (await uploadCoverThumb(cid, cb)) {
      story.cover.thumb_uploaded = true;
      try { saveStoryToStorage(story); } catch (e) { /* quota — ignore */ }
    }
  } catch (e) { /* best-effort */ }
}

// Blob -> base64 string (no data: prefix)
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = () => reject(new Error('Could not read blob'));
    reader.readAsDataURL(blob);
  });
}

// Upload one IndexedDB image blob to the cloud bucket (preserves its type)
async function uploadImageBlob(imageId, blob) {
  const b64 = await blobToBase64(blob);
  return imgUploadToCloud(imageId, b64, blob.type || 'image/jpeg', getStoredPassword());
}

// ---- Row builders (full object in `data`, plus searchable columns) ----
function storyToRow(story) {
  const characterNames = (story.selected_characters || [])
    .map(c => c.name).filter(Boolean).join(' ');
  const fd = story.formData || {};
  const pageText = (story.pages || []).map(p => p.text || '').join(' ');
  const searchText = [story.title, story.summary, characterNames, fd.theme, pageText]
    .filter(Boolean).join(' ').toLowerCase();
  return {
    id: story.id,
    title: story.title || '',
    created_by: story.created_by || '',
    genre: fd.genre || '',
    age_range: fd.ageRange || '',
    art_style: story.art_style || (fd.artStyle && fd.artStyle !== 'surprise-me' ? fd.artStyle : ''),
    theme: fd.theme || '',
    summary: story.summary || '',
    character_names: characterNames,
    search_text: searchText,
    rating: story.rating || 0,
    cover_image_id: (story.cover && story.cover.image_id) || null,
    // Send the REAL creation date so the column matches reality (not the
    // upload time). Self-heals migrated rows on their next sync.
    created_at: story.createdAt || null,
    last_read_at: story.last_read_at || null,
    data: story,
  };
}

function characterToRow(char) {
  return {
    id: char.id,
    name: char.name || '',
    tagline: char.tagline || '',
    created_at: char.created_at || null,
    last_used_at: char.last_used_at || null,
    data: char,
  };
}

// ---- Push: stories ----
// Uploads any not-yet-uploaded story images (compressing to JPEG), then
// upserts the story row. Marks slots as uploaded so re-syncs are cheap.
async function syncPushStory(story) {
  const pw = getStoredPassword();
  if (!pw || !story || !story.id) return;

  const slots = [story.cover, ...(story.pages || [])];
  let flagsChanged = false;
  for (const slot of slots) {
    if (!slot || !slot.image_id || slot.image_status !== 'ready' || slot.image_uploaded) continue;
    try {
      let blob = await getImageBlob(slot.image_id);
      if (!blob) continue;
      blob = await compressToJpeg(blob);
      await uploadImageBlob(slot.image_id, blob);
      slot.image_uploaded = true;
      flagsChanged = true;
      // The cover also gets a small thumbnail for the Library shelf.
      if (slot === story.cover && await uploadCoverThumb(slot.image_id, blob)) story.cover.thumb_uploaded = true;
    } catch (e) {
      console.warn('Story image upload failed:', slot.image_id, e);
    }
  }

  await dbUpsertStory(storyToRow(story), pw);

  // Persist the image_uploaded flags so we don't re-upload next time
  if (flagsChanged) {
    try { saveStoryToStorage(story); } catch (e) { /* quota etc — ignore here */ }
  }
}

// ---- Push: characters ----
// Character images are few and small; just upload them (idempotent upsert),
// preserving type so transparent PNG thumbnails stay transparent.
async function syncPushCharacter(char) {
  const pw = getStoredPassword();
  if (!pw || !char || !char.id) return;

  for (const imgId of [char.thumbnail_id, char.photo_id]) {
    if (!imgId) continue;
    try {
      const blob = await getImageBlob(imgId);
      if (blob) await uploadImageBlob(imgId, blob);
    } catch (e) {
      console.warn('Character image upload failed:', imgId, e);
    }
  }

  await dbUpsertCharacter(characterToRow(char), pw);
}

// ---- Delete ----
async function syncDeleteStory(story) {
  const pw = getStoredPassword();
  if (!pw || !story) return;
  const imgIds = [story.cover && story.cover.image_id, ...((story.pages || []).map(p => p.image_id))].filter(Boolean);
  try { if (imgIds.length) await imgDeleteCloud(imgIds, pw); } catch (e) { console.warn(e); }
  await dbDeleteStory(story.id, pw);
}

async function syncDeleteCharacter(char) {
  const pw = getStoredPassword();
  if (!pw || !char) return;
  const imgIds = [char.thumbnail_id, char.photo_id].filter(Boolean);
  try { if (imgIds.length) await imgDeleteCloud(imgIds, pw); } catch (e) { console.warn(e); }
  await dbDeleteCharacter(char.id, pw);
}

// ---- One-time migration ----
// Push everything on this device that ISN'T already in the cloud. Re-running
// is cheap: items already backed up are detected by id and skipped.
async function syncMigrateAll(onProgress) {
  const pw = getStoredPassword();
  if (!pw) throw new Error('No app password set — open the app first.');

  const chars = getStoredCharacters();
  const stories = getStoredStories();
  const summary = {
    charsOk: 0, charsFail: 0, charsSkipped: 0, charsTotal: chars.length,
    storiesOk: 0, storiesFail: 0, storiesSkipped: 0, storiesTotal: stories.length,
  };

  // Find what's already in the cloud so we can skip it
  const existingCharIds = new Set();
  const existingStoryIds = new Set();
  try { (await dbListCharacters(pw)).rows.forEach(r => existingCharIds.add(r.id)); } catch (e) { /* offline → push all */ }
  try { (await dbListStories({ limit: 1000 }, pw)).rows.forEach(r => existingStoryIds.add(r.id)); } catch (e) {}

  for (let i = 0; i < chars.length; i++) {
    if (onProgress) onProgress(`Characters… ${i + 1}/${chars.length}`);
    if (existingCharIds.has(chars[i].id)) { summary.charsSkipped++; continue; }
    try { await syncPushCharacter(chars[i]); summary.charsOk++; }
    catch (e) { console.warn('Migrate character failed:', chars[i] && chars[i].id, e); summary.charsFail++; }
  }

  for (let i = 0; i < stories.length; i++) {
    if (onProgress) onProgress(`Books… ${i + 1}/${stories.length}`);
    if (existingStoryIds.has(stories[i].id)) { summary.storiesSkipped++; continue; }
    try { await syncPushStory(stories[i]); summary.storiesOk++; }
    catch (e) { console.warn('Migrate story failed:', stories[i] && stories[i].id, e); summary.storiesFail++; }
  }

  return summary;
}

// =====================================================================
// READ PATH (cloud → device)
// =====================================================================

// Pull characters from the cloud and make them the local set. Keeps any
// local-only (not-yet-synced) characters and pushes them up. Cloud wins on
// shared ids (good enough for family use; offline-edit conflicts are rare).
async function pullCharacters() {
  const pw = getStoredPassword();
  if (!pw) return getStoredCharacters();
  let rows;
  try { rows = (await dbListCharacters(pw)).rows || []; }
  catch (e) { console.warn('pullCharacters failed; keeping local', e); return getStoredCharacters(); }

  const cloudChars = rows.map(r => r.data).filter(Boolean);
  const cloudIds = new Set(cloudChars.map(c => c.id));
  const localOnly = getStoredCharacters().filter(c => !cloudIds.has(c.id));
  const merged = [...cloudChars, ...localOnly];
  saveAllCharacters(merged);
  // Best-effort: push any local-only characters up
  localOnly.forEach(c => syncPushCharacter(c).catch(() => {}));
  return merged;
}

// Fetch the lightweight book list (metadata + cover id) for the Library.
async function fetchLibraryIndex(opts) {
  const pw = getStoredPassword();
  if (!pw) return { rows: [] };
  return dbListStories(opts || {}, pw);
}

// Fetch one full story object from the cloud (or null).
async function fetchFullStory(id) {
  const pw = getStoredPassword();
  if (!pw) return null;
  const res = await dbGetStory(id, pw);
  return (res && res.row && res.row.data) || null;
}

// Make sure every image a story needs is present in the on-device cache.
// Missing ones are fetched via a short-lived signed URL and stored locally
// (so they then work offline and the signed URL expiring doesn't matter).
async function ensureStoryImagesLocal(story) {
  const ids = [story.cover && story.cover.image_id, ...((story.pages || []).map(p => p.image_id))].filter(Boolean);
  const missing = [];
  for (const id of ids) {
    try { if (!(await getImageBlob(id))) missing.push(id); } catch (e) { missing.push(id); }
  }

  if (missing.length) {
    const pw = getStoredPassword();
    let urls = {};
    try { urls = (await imgSignUrls(missing, pw)).urls || {}; }
    catch (e) { console.warn('Could not sign image URLs', e); return; }

    for (const id of missing) {
      const url = urls[id];
      if (!url) continue;
      try {
        const blob = await (await fetch(url)).blob();
        await saveImageBlob(id, blob);
      } catch (e) {
        console.warn('Image download failed:', id, e);
      }
    }
  }

  // Backfill the cover thumbnail for older books now that the cover is on-device.
  await ensureCoverThumbUploaded(story);
}

// Download character thumbnails + photos that aren't on this device yet
// (so characters made on another device show their avatar/photo here too).
async function ensureCharacterImagesLocal(chars) {
  const want = [];
  for (const c of (chars || [])) {
    for (const id of [c.thumbnail_id, c.photo_id]) {
      if (!id) continue;
      try { if (!(await getImageBlob(id))) want.push(id); } catch (e) { want.push(id); }
    }
  }
  if (!want.length) return;
  const pw = getStoredPassword();
  let urls = {};
  try { urls = (await imgSignUrls(want, pw)).urls || {}; }
  catch (e) { console.warn('Could not sign character images', e); return; }
  for (const id of want) {
    const url = urls[id];
    if (!url) continue;
    try { const blob = await (await fetch(url)).blob(); await saveImageBlob(id, blob); }
    catch (e) { console.warn('Character image download failed:', id, e); }
  }
}

// Batch-sign cover images for Library thumbnails (display straight from the
// signed URL — no need to cache every cover locally). Returns { id: url }.
async function signCoverUrls(coverIds) {
  const ids = (coverIds || []).filter(Boolean);
  if (!ids.length) return {};
  // Sign the full cover AND its thumbnail; the Worker/Supabase just omits any
  // thumbnail that doesn't exist yet, so old books cleanly fall back to full.
  const req = [];
  for (const id of ids) { req.push(id); req.push(coverThumbId(id)); }
  const pw = getStoredPassword();
  try { return (await imgSignUrls(req, pw)).urls || {}; }
  catch (e) { console.warn('Cover sign failed', e); return {}; }
}

// Push just the last_read_at change up (metadata only; no image work).
async function syncStampLastRead(story) {
  const pw = getStoredPassword();
  if (!pw || !story) return;
  try { await dbUpsertStory(storyToRow(story), pw); }
  catch (e) { console.warn('last_read sync failed', e); }
}
