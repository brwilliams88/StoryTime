// =====================================================================
//  ███  WORKER REV: v0.11.0  (2026-07-06)  ███
//  Changes since last deploy: SHARE-A-STORY + dual (R2/Supabase) usage count.
//    - NEW public GET /share/<slug>-<token>  → serves the reader in "share mode"
//      (a standalone, password-free reading page with OG link-preview tags).
//    - NEW public GET /share-data/<token>    → story JSON + freshly signed image
//      URLs (Worker signs server-side, so the recipient needs no password).
//    - NEW public GET /share-cover/<token>   → cover thumbnail for the OG card.
//      The token is HMAC(APP_PASSWORD, storyId) truncated — unguessable, stable,
//      derivable client-side, so no DB column and no per-share write are needed.
//    - /img/usage now ALSO counts Supabase Storage + how many are R2-only-missing
//      (so Settings can show "197 (R2) / 326 (SB)" and a migration-progress line).
//  REQUIRES: an R2 bucket bound to this Worker as  IMAGES  (see README).
//  ^^ BUMP THIS LINE EVERY TIME THE WORKER CHANGES. When pasting a new version
//     into the Cloudflare dashboard, check this rev against the deployed one so
//     it's obvious whether you're up to date.
// =====================================================================
// StoryTime — Cloudflare Worker API Proxy
// =====================================================================
// PURPOSE:
//   A tiny "middleman" server. The browser app can't safely hold secret
//   keys, so it sends requests HERE; this Worker attaches the secret key
//   and forwards to OpenAI or Supabase, then returns the response.
//
//   ROUTES (all POST, all require the X-App-Password header):
//     /v1/*                  → forwarded to OpenAI (story + image gen)
//     /db/stories/upsert     → create/update a story row
//     /db/stories/delete     → delete a story row        { id }
//     /db/stories/get        → fetch one full story      { id }
//     /db/stories/list       → list story metadata        { sort, search, limit, offset }
//     /db/characters/upsert  → create/update a character
//     /db/characters/delete  → delete a character        { id }
//     /db/characters/list    → list all characters
//     /img/upload            → store an image            { id, b64, contentType }
//     /img/sign              → signed view URLs          { ids: [...] , expiresIn? }
//     /img/delete            → delete images             { ids: [...] }
//
// SECURITY:
//   1. X-App-Password must match the APP_PASSWORD secret.
//   2. Supabase calls use SUPABASE_SECRET_KEY (the "Secret Key"),
//      which bypasses Row-Level Security. The browser never sees it.
//
// REQUIRED ENV (set in Cloudflare → Worker → Settings → Variables):
//   APP_PASSWORD          (secret)  — existing
//   OPENAI_API_KEY        (secret)  — existing
//   SUPABASE_URL          (variable) e.g. https://xxxx.supabase.co
//   SUPABASE_SECRET_KEY   (secret)   the Supabase "Secret Key"
//
// HOW TO UPDATE:
//   This file is the reference copy in the repo. Paste its contents into
//   the Cloudflare Worker editor and click "Deploy."
// =====================================================================

const IMAGE_BUCKET = 'story-images';

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') return handleCORSPreflight();

    const reqUrl = new URL(request.url);

    // ---- PUBLIC image serving (GET) — NOT password-gated, because <img src>
    //      can't send headers. Access is guarded by the HMAC-signed URL instead. ----
    if (request.method === 'GET' && reqUrl.pathname.startsWith('/img/get/')) {
      return await imgServe(env, reqUrl, ctx);
    }

    // ---- PUBLIC share routes (GET) — NOT password-gated. Access is guarded by
    //      the unguessable token (HMAC of the story id). See the REV notes. ----
    if (request.method === 'GET' && reqUrl.pathname.startsWith('/share-data/')) {
      const token = decodeURIComponent(reqUrl.pathname.slice('/share-data/'.length));
      return await shareData(env, token, reqUrl);
    }
    if (request.method === 'GET' && reqUrl.pathname.startsWith('/share-cover/')) {
      const token = decodeURIComponent(reqUrl.pathname.slice('/share-cover/'.length));
      return await shareCover(env, token, ctx);
    }
    if (request.method === 'GET' && reqUrl.pathname.startsWith('/share/')) {
      // Slug is cosmetic; the token is everything after the LAST hyphen.
      const tail = decodeURIComponent(reqUrl.pathname.slice('/share/'.length));
      const token = tail.slice(tail.lastIndexOf('-') + 1);
      return await sharePage(env, token, reqUrl);
    }

    if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

    // ---- Password gate (protects every route) ----
    const submittedPassword = request.headers.get('X-App-Password');
    if (!submittedPassword || submittedPassword !== env.APP_PASSWORD) {
      return jsonResponse({ error: 'Unauthorized — invalid password' }, 401);
    }

    const path = new URL(request.url).pathname;

    try {
      // ---- OpenAI passthrough (unchanged) ----
      if (path.startsWith('/v1/')) return await proxyOpenAI(request, env, path);

      // Everything below is JSON in / JSON out
      const body = await readBody(request);

      // ---- Supabase: database ----
      if (path === '/db/stories/upsert')    return await dbUpsert(env, 'stories', body);
      if (path === '/db/stories/delete')    return await dbDelete(env, 'stories', body.id);
      if (path === '/db/stories/get')       return await dbGet(env, 'stories', body.id);
      if (path === '/db/stories/list')      return await listStories(env, body);
      if (path === '/db/characters/upsert') return await dbUpsert(env, 'characters', body);
      if (path === '/db/characters/delete') return await dbDelete(env, 'characters', body.id);
      if (path === '/db/characters/list')   return await listCharacters(env, body);

      // ---- Image storage (now Cloudflare R2; Supabase kept as lazy fallback) ----
      if (path === '/img/upload') return await imgUpload(env, body);
      if (path === '/img/sign')   return await imgSign(env, body, reqUrl);
      if (path === '/img/delete') return await imgDelete(env, body);
      if (path === '/img/usage')  return await imgUsage(env);

      // ---- Supabase: API-spend ledger (cross-device) ----
      if (path === '/spend/add')  return await spendAdd(env, body);
      if (path === '/spend/list') return await spendList(env);

      return jsonResponse({ error: 'Unknown endpoint: ' + path }, 404);
    } catch (err) {
      return jsonResponse({ error: 'Worker error', detail: err.message }, 500);
    }
  },
};

// =====================================================================
// Supabase — API-spend ledger (append-only events, aggregated client-side)
// =====================================================================
async function spendAdd(env, body) {
  const events = (body && body.events) || [];
  if (!Array.isArray(events) || !events.length) return jsonResponse({ ok: true, inserted: 0 });
  const rows = events.map(e => ({
    ts: e.ts ? new Date(e.ts).toISOString() : new Date().toISOString(),
    category: String(e.category || 'other'),
    amount: Number(e.amount) || 0,
  })).filter(r => r.amount > 0);
  if (!rows.length) return jsonResponse({ ok: true, inserted: 0 });
  const res = await fetch(sbRest(env, 'spend_events'), {
    method: 'POST',
    headers: sbHeaders(env, { 'Prefer': 'return=minimal' }),
    body: JSON.stringify(rows),
  });
  if (!res.ok) return jsonResponse({ error: 'Spend add failed', detail: await res.text() }, res.status);
  return jsonResponse({ ok: true, inserted: rows.length });
}

async function spendList(env) {
  // Return every event (personal-use table stays small); client aggregates.
  const res = await fetch(sbRest(env, 'spend_events?select=ts,category,amount&order=ts.asc'), {
    headers: sbHeaders(env),
  });
  if (!res.ok) return jsonResponse({ error: 'Spend list failed', detail: await res.text() }, res.status);
  return jsonResponse({ ok: true, events: await res.json() });
}

// =====================================================================
// OpenAI
// =====================================================================
async function proxyOpenAI(request, env, endpoint) {
  const requestBody = await request.text();
  let openaiResponse;
  try {
    openaiResponse = await fetch(`https://api.openai.com${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
      },
      body: requestBody,
    });
  } catch (err) {
    return jsonResponse({ error: 'Failed to reach OpenAI', detail: err.message }, 502);
  }
  const responseBody = await openaiResponse.text();
  return new Response(responseBody, {
    status: openaiResponse.status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}

// =====================================================================
// Supabase — database (PostgREST)
// =====================================================================
function sbHeaders(env, extra = {}) {
  return {
    'apikey': env.SUPABASE_SECRET_KEY,
    'Authorization': `Bearer ${env.SUPABASE_SECRET_KEY}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}
function sbRest(env, pathAndQuery) {
  return `${env.SUPABASE_URL}/rest/v1/${pathAndQuery}`;
}

// Insert-or-update a row (conflict on primary key `id`)
async function dbUpsert(env, table, row) {
  if (!row || !row.id) return jsonResponse({ error: 'Missing row.id' }, 400);
  const res = await fetch(sbRest(env, table), {
    method: 'POST',
    headers: sbHeaders(env, { 'Prefer': 'resolution=merge-duplicates,return=minimal' }),
    body: JSON.stringify(row),
  });
  if (!res.ok) return jsonResponse({ error: 'DB upsert failed', detail: await res.text() }, res.status);
  return jsonResponse({ ok: true });
}

async function dbDelete(env, table, id) {
  if (!id) return jsonResponse({ error: 'Missing id' }, 400);
  const res = await fetch(sbRest(env, `${table}?id=eq.${encodeURIComponent(id)}`), {
    method: 'DELETE',
    headers: sbHeaders(env, { 'Prefer': 'return=minimal' }),
  });
  if (!res.ok) return jsonResponse({ error: 'DB delete failed', detail: await res.text() }, res.status);
  return jsonResponse({ ok: true });
}

async function dbGet(env, table, id) {
  if (!id) return jsonResponse({ error: 'Missing id' }, 400);
  const res = await fetch(sbRest(env, `${table}?id=eq.${encodeURIComponent(id)}&select=*`), {
    headers: sbHeaders(env, { 'Accept': 'application/vnd.pgrst.object+json' }),
  });
  if (res.status === 406 || res.status === 404) return jsonResponse({ ok: true, row: null });
  if (!res.ok) return jsonResponse({ error: 'DB get failed', detail: await res.text() }, res.status);
  return jsonResponse({ ok: true, row: await res.json() });
}

// Lightweight list for the Library view (metadata only, not the big `data` blob)
async function listStories(env, opts) {
  opts = opts || {};
  const order = opts.sort === 'last_read'
    ? 'last_read_at.desc.nullslast'
    : 'created_at.desc';
  const limit = Math.min(parseInt(opts.limit, 10) || 100, 200);
  const offset = parseInt(opts.offset, 10) || 0;
  const cols = 'id,title,created_by,genre,age_range,art_style,theme,summary,character_names,rating,created_at,last_read_at,cover_image_id';
  let q = `stories?select=${cols}&order=${order}&limit=${limit}&offset=${offset}`;

  if (opts.search && String(opts.search).trim()) {
    // Full-text search over the whole story (title + characters + summary + page text)
    const pat = '*' + encodeURIComponent(String(opts.search).trim().toLowerCase()) + '*';
    q += `&search_text=ilike.${pat}`;
  }

  const res = await fetch(sbRest(env, q), { headers: sbHeaders(env) });
  if (!res.ok) return jsonResponse({ error: 'List failed', detail: await res.text() }, res.status);
  return jsonResponse({ ok: true, rows: await res.json() });
}

// Characters are small — return them in full (the app needs their data)
async function listCharacters(env, opts) {
  const res = await fetch(sbRest(env, 'characters?select=*&order=created_at.desc'), {
    headers: sbHeaders(env),
  });
  if (!res.ok) return jsonResponse({ error: 'List failed', detail: await res.text() }, res.status);
  return jsonResponse({ ok: true, rows: await res.json() });
}

// =====================================================================
// Image storage — Cloudflare R2 (zero egress).  env.IMAGES = R2 bucket binding.
// Supabase Storage is kept read-only as a lazy-migration fallback: any image
// not yet in R2 is pulled from Supabase on first view and copied into R2.
// =====================================================================

// Upload a new image straight to R2.
async function imgUpload(env, body) {
  const { id, b64, contentType } = body || {};
  if (!id || !b64) return jsonResponse({ error: 'Missing id or b64' }, 400);
  const bytes = base64ToBytes(b64);
  await env.IMAGES.put(id, bytes, { httpMetadata: { contentType: contentType || 'image/jpeg' } });
  return jsonResponse({ ok: true, id });
}

// Return HMAC-signed, short-lived URLs pointing back at THIS Worker's public
// GET route. <img src> works (no headers needed); access is guarded by the sig.
// We sign every requested id without checking existence — a missing one just
// 404s on GET and the client falls back (matches the old Supabase behaviour).
async function imgSign(env, body, reqUrl) {
  const ids = (body && (body.ids || (body.id ? [body.id] : []))) || [];
  if (!ids.length) return jsonResponse({ error: 'Missing ids' }, 400);
  const expiresIn = (body && body.expiresIn) || 3600;
  const exp = Math.floor(Date.now() / 1000) + expiresIn;
  const base = `${reqUrl.origin}/img/get/`;
  const urls = {};
  for (const id of ids) {
    const sig = await hmacHex(env.APP_PASSWORD, id + ':' + exp);
    urls[id] = `${base}${encodeURIComponent(id)}?exp=${exp}&sig=${sig}`;
  }
  return jsonResponse({ ok: true, urls });
}

// PUBLIC: serve an image by id from R2, verifying the HMAC-signed URL. If the
// object isn't in R2 yet, pull it from Supabase Storage, serve it, and copy it
// into R2 (write-through migration — happens transparently as books are viewed).
async function imgServe(env, reqUrl, ctx) {
  const id = decodeURIComponent(reqUrl.pathname.slice('/img/get/'.length));
  const exp = Number(reqUrl.searchParams.get('exp') || 0);
  const sig = reqUrl.searchParams.get('sig') || '';
  if (!id) return new Response('Missing id', { status: 400 });
  if (!exp || exp < Math.floor(Date.now() / 1000)) return new Response('URL expired', { status: 403 });
  const expect = await hmacHex(env.APP_PASSWORD, id + ':' + exp);
  if (sig !== expect) return new Response('Bad signature', { status: 403 });

  // 1) R2 (the normal path once migrated)
  const obj = await env.IMAGES.get(id);
  if (obj) return new Response(obj.body, { headers: imgHeaders(obj.httpMetadata && obj.httpMetadata.contentType) });

  // 2) Lazy fallback: Supabase Storage → serve + copy into R2
  const sbUrl = `${env.SUPABASE_URL}/storage/v1/object/${IMAGE_BUCKET}/${encodeURIComponent(id)}`;
  const sbRes = await fetch(sbUrl, {
    headers: { 'apikey': env.SUPABASE_SECRET_KEY, 'Authorization': `Bearer ${env.SUPABASE_SECRET_KEY}` },
  });
  if (!sbRes.ok) return new Response('Not found', { status: 404 });
  const buf = await sbRes.arrayBuffer();
  const ct = sbRes.headers.get('content-type') || 'image/jpeg';
  if (ctx && ctx.waitUntil) ctx.waitUntil(env.IMAGES.put(id, buf, { httpMetadata: { contentType: ct } }).catch(() => {}));
  return new Response(buf, { headers: imgHeaders(ct) });
}

// Sum the size + count of every object in the R2 bucket (paginated), AND count
// what's still sitting in Supabase Storage so Settings can show the migration
// crossing over: "197 (R2) / 326 (SB)". `unmigrated` = objects that exist in
// Supabase but NOT yet in R2 (the true "still to move" number).
async function imgUsage(env) {
  // ---- R2 ----
  const r2Ids = new Set();
  let bytes = 0, cursor;
  for (let i = 0; i < 100; i++) {
    const list = await env.IMAGES.list({ limit: 1000, cursor });
    for (const o of list.objects) { r2Ids.add(o.key); bytes += o.size || 0; }
    if (!list.truncated) break;
    cursor = list.cursor;
  }

  // ---- Supabase Storage (paginated; 100 per page) ----
  const sbIds = new Set();
  for (let offset = 0; offset < 100000; offset += 100) {
    let page = [];
    try {
      const res = await fetch(`${env.SUPABASE_URL}/storage/v1/object/list/${IMAGE_BUCKET}`, {
        method: 'POST',
        headers: sbHeaders(env),
        body: JSON.stringify({ limit: 100, offset, prefix: '', sortBy: { column: 'name', order: 'asc' } }),
      });
      if (res.ok) page = await res.json();
    } catch (e) { /* best-effort — SB count just won't show */ }
    if (!Array.isArray(page) || !page.length) break;
    for (const o of page) { if (o && o.name) sbIds.add(o.name); }
    if (page.length < 100) break;
  }

  // How many Supabase objects have NOT been copied into R2 yet.
  let unmigrated = 0;
  for (const id of sbIds) { if (!r2Ids.has(id)) unmigrated++; }

  return jsonResponse({
    ok: true,
    count: r2Ids.size,          // back-compat: old clients read `count` as the R2 count
    bytes,
    r2Count: r2Ids.size,
    sbCount: sbIds.size,
    unmigrated,
  });
}

// Delete from R2, and best-effort from Supabase (in case not migrated yet).
async function imgDelete(env, body) {
  const ids = (body && (body.ids || (body.id ? [body.id] : []))) || [];
  if (!ids.length) return jsonResponse({ error: 'Missing ids' }, 400);
  await Promise.all(ids.map((id) => env.IMAGES.delete(id).catch(() => {})));
  try {
    await fetch(`${env.SUPABASE_URL}/storage/v1/object/${IMAGE_BUCKET}`, {
      method: 'DELETE', headers: sbHeaders(env), body: JSON.stringify({ prefixes: ids }),
    });
  } catch (e) { /* best-effort */ }
  return jsonResponse({ ok: true });
}

// =====================================================================
// Share a story — public, password-free, guarded by an unguessable token.
// token = HMAC(APP_PASSWORD, storyId) truncated. Because it's derived (not
// stored), the app can build a share link client-side with no round-trip, and
// there's no DB column to migrate. Trade-off: to find a story FROM a token we
// scan story ids and re-derive each token — fine at personal-library scale.
// =====================================================================
const SHARE_SITE = 'https://brwilliams88.github.io/StoryTime';

async function shareTokenFor(env, storyId) {
  return (await hmacHex(env.APP_PASSWORD, storyId)).slice(0, 12);
}

// Find the story whose token matches. Returns light metadata (no big data blob).
async function resolveShare(env, token) {
  if (!token || !/^[a-f0-9]{6,32}$/.test(token)) return null;
  const res = await fetch(
    sbRest(env, 'stories?select=id,title,created_by,cover_image_id&limit=2000'),
    { headers: sbHeaders(env) });
  if (!res.ok) return null;
  const rows = await res.json();
  for (const r of rows) {
    if ((await shareTokenFor(env, r.id)) === token) return r;
  }
  return null;
}

// Story JSON + freshly signed image URLs (signed here, so no password needed).
async function shareData(env, token, reqUrl) {
  const meta = await resolveShare(env, token);
  if (!meta) return jsonResponse({ ok: false, error: 'Story not found' }, 404);

  const res = await fetch(
    sbRest(env, `stories?id=eq.${encodeURIComponent(meta.id)}&select=data`),
    { headers: sbHeaders(env, { 'Accept': 'application/vnd.pgrst.object+json' }) });
  if (!res.ok) return jsonResponse({ ok: false, error: 'Story not found' }, 404);
  const row = await res.json();
  const story = row && row.data;
  if (!story) return jsonResponse({ ok: false, error: 'Story not found' }, 404);

  const ids = [story.cover && story.cover.image_id, ...((story.pages || []).map(p => p.image_id))].filter(Boolean);
  const exp = Math.floor(Date.now() / 1000) + 6 * 3600;   // 6h — a comfy reading window
  const base = `${reqUrl.origin}/img/get/`;
  const images = {};
  for (const id of ids) {
    const sig = await hmacHex(env.APP_PASSWORD, id + ':' + exp);
    images[id] = `${base}${encodeURIComponent(id)}?exp=${exp}&sig=${sig}`;
  }
  return jsonResponse({ ok: true, story, images });
}

// Cover image for the link-preview card (crawlers can't sign URLs, so this is
// public via the token). Prefer the small thumbnail; fall back to full cover.
async function shareCover(env, token, ctx) {
  const meta = await resolveShare(env, token);
  if (!meta || !meta.cover_image_id) return new Response('Not found', { status: 404 });
  const thumbId = meta.cover_image_id + '_t';
  for (const id of [thumbId, meta.cover_image_id]) {
    const obj = await env.IMAGES.get(id);
    if (obj) return new Response(obj.body, { headers: imgHeaders(obj.httpMetadata && obj.httpMetadata.contentType) });
    // Lazy fallback to Supabase (+ copy into R2), same as normal image serving.
    const sbUrl = `${env.SUPABASE_URL}/storage/v1/object/${IMAGE_BUCKET}/${encodeURIComponent(id)}`;
    const sbRes = await fetch(sbUrl, { headers: { 'apikey': env.SUPABASE_SECRET_KEY, 'Authorization': `Bearer ${env.SUPABASE_SECRET_KEY}` } });
    if (sbRes.ok) {
      const buf = await sbRes.arrayBuffer();
      const ct = sbRes.headers.get('content-type') || 'image/jpeg';
      if (ctx && ctx.waitUntil) ctx.waitUntil(env.IMAGES.put(id, buf, { httpMetadata: { contentType: ct } }).catch(() => {}));
      return new Response(buf, { headers: imgHeaders(ct) });
    }
  }
  return new Response('Not found', { status: 404 });
}

// The standalone reading page. We fetch the real app's index.html and inject:
//   - <base> so its relative js/css/asset URLs still resolve to GitHub Pages
//   - OG/Twitter tags (so the link unfurls into a cover+title card)
//   - theme-color + noindex
//   - window.__SHARE__ so the app boots straight into password-free share mode
async function sharePage(env, token, reqUrl) {
  const meta = await resolveShare(env, token);
  if (!meta) {
    return new Response(shareNotFoundHtml(), {
      status: 404,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  let html;
  try {
    const siteRes = await fetch(`${SHARE_SITE}/index.html`, { cf: { cacheTtl: 300, cacheEverything: true } });
    html = await siteRes.text();
  } catch (e) {
    return new Response('Could not load the reader. Please try again.', { status: 502 });
  }

  const creators = (meta.created_by && meta.created_by.trim()) || 'We';
  const title = escapeHtml(meta.title || 'A StoryTime story');
  const desc = escapeHtml(`${creators} made this story on StoryTime and want to share it with you. Tap to read it!`);
  const ogImg = `${reqUrl.origin}/share-cover/${token}`;

  const inject =
    `<base href="${SHARE_SITE}/">` +
    `<meta name="theme-color" content="#1a1a2e">` +
    `<meta name="robots" content="noindex, nofollow">` +
    `<meta property="og:type" content="book">` +
    `<meta property="og:site_name" content="StoryTime">` +
    `<meta property="og:title" content="${title}">` +
    `<meta property="og:description" content="${desc}">` +
    `<meta property="og:image" content="${ogImg}">` +
    `<meta name="twitter:card" content="summary_large_image">` +
    `<meta name="twitter:title" content="${title}">` +
    `<meta name="twitter:description" content="${desc}">` +
    `<meta name="twitter:image" content="${ogImg}">` +
    `<script>window.__SHARE__=${JSON.stringify({ token, api: reqUrl.origin })};</script>`;

  html = html.replace('<title>StoryTime</title>', `<title>${title} — StoryTime</title>`);
  html = html.replace('<head>', '<head>\n' + inject);

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'X-Robots-Tag': 'noindex, nofollow',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
    },
  });
}

function shareNotFoundHtml() {
  return '<!DOCTYPE html><html><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<meta name="robots" content="noindex, nofollow">' +
    '<title>Story not found — StoryTime</title>' +
    '<style>html,body{height:100%;margin:0}body{background:#1a1a2e;color:#eee;' +
    'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;' +
    'display:flex;align-items:center;justify-content:center;text-align:center;padding:1.5rem}' +
    'h1{font-size:1.4rem;margin:.2rem 0}p{opacity:.7}</style></head><body><div>' +
    '<div style="font-size:2.4rem">📖</div><h1>Story not found</h1>' +
    '<p>This share link may be broken or the story was removed.</p></div></body></html>';
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ---- HMAC + image response helpers ----
async function hmacHex(secret, msg) {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret || ''), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function imgHeaders(contentType) {
  return {
    'Content-Type': contentType || 'image/jpeg',
    'Access-Control-Allow-Origin': '*',
    // image ids are content-immutable, so let the browser + Cloudflare edge cache hard
    'Cache-Control': 'public, max-age=31536000, immutable',
  };
}

// =====================================================================
// Helpers
// =====================================================================
async function readBody(request) {
  const t = await request.text();
  if (!t) return {};
  try { return JSON.parse(t); } catch (e) { return {}; }
}

function base64ToBytes(b64) {
  const bin = atob(b64);
  const len = bin.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}

function handleCORSPreflight() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-App-Password',
      'Access-Control-Max-Age': '86400',
    },
  });
}
