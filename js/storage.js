// =====================================================================
// storage.js — Browser localStorage helpers
// =====================================================================

const STORAGE_KEYS = {
  PASSWORD: 'storytime_password',
  STORIES: 'storytime_stories',
  CHARACTERS: 'storytime_characters',
  DEBUG_MODE: 'storytime_debug_mode',
  STICKY_PREFS: 'storytime_sticky_prefs',
  SHOW_INSPECT: 'storytime_show_inspect',
  GENRE_MRU: 'storytime_genre_mru',          // { value: timestamp }
  ARTSTYLE_MRU: 'storytime_artstyle_mru',
  INGREDIENT_MRU: 'storytime_ingredient_mru',
  CREATED_BY_LIST: 'storytime_createdby_list', // array of strings
  LIBRARY_INDEX: 'storytime_library_index',    // cloud book metadata (for offline list)
  SPEND_LEDGER: 'storytime_spend_ledger',      // running API-spend record (survives story deletes)
};

// ---- API spend ledger ----------------------------------------------------
// We record every paid API call (story text, illustrations, character
// portraits) the moment it happens, in its own ledger. This is deliberately
// SEPARATE from the stories themselves: deleting a story must NOT erase the
// fact that we already spent money making it. The ledger seeds with a one-time
// historical baseline (everything spent BEFORE this feature existed, taken from
// the OpenAI dashboard) and grows precisely from here on.
//
// Shape: { baseline: {total, pictures, text, characters, asOf},
//          events: [{ ts, cat, amt }],      // cat = 'pictures'|'text'|'characters'
//          lastStory: { text, pictures, total, ts } | null }
const SPEND_BASELINE = {
  // As of the OpenAI usage dashboard on 2026-06-22: $24.45 total spend.
  // Split is estimated (illustrations dominate; text + character portraits are small).
  total: 24.45,
  pictures: 21.00,
  text: 3.10,
  characters: 0.35,
  asOf: '2026-06-22',
};

function getSpendLedger() {
  let raw;
  try { raw = JSON.parse(localStorage.getItem(STORAGE_KEYS.SPEND_LEDGER)); } catch (e) { raw = null; }
  if (!raw || !raw.baseline) {
    raw = { baseline: { ...SPEND_BASELINE }, events: [], lastStory: null };
    safeSetItem(STORAGE_KEYS.SPEND_LEDGER, JSON.stringify(raw));
  }
  if (!Array.isArray(raw.events)) raw.events = [];
  return raw;
}

function saveSpendLedger(ledger) {
  try { safeSetItem(STORAGE_KEYS.SPEND_LEDGER, JSON.stringify(ledger)); } catch (e) {}
}

// Record one paid call. cat = 'pictures' | 'text' | 'characters'.
function recordSpend(cat, amount) {
  const amt = Number(amount) || 0;
  if (amt <= 0) return;
  const ledger = getSpendLedger();
  ledger.events.push({ ts: Date.now(), cat, amt });
  saveSpendLedger(ledger);
}

// Remember the most recently generated story's cost (for the "Last story" line).
function setLastStorySpend(textCost, picturesCost) {
  const ledger = getSpendLedger();
  const text = Number(textCost) || 0;
  const pictures = Number(picturesCost) || 0;
  ledger.lastStory = { text, pictures, total: text + pictures, ts: Date.now() };
  saveSpendLedger(ledger);
}

// Roll the ledger up into the numbers the Spend panel shows.
function getSpendSummary() {
  const ledger = getSpendLedger();
  const b = ledger.baseline;
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  // "This week" = the last 7 days (rolling), simplest mental model for a parent.
  const startOfWeek = startOfToday - 6 * 24 * 60 * 60 * 1000;

  const cat = { pictures: b.pictures, text: b.text, characters: b.characters };
  let today = 0, week = 0;
  for (const e of ledger.events) {
    cat[e.cat] = (cat[e.cat] || 0) + e.amt;
    if (e.ts >= startOfToday) today += e.amt;
    if (e.ts >= startOfWeek) week += e.amt;
  }
  const allTime = cat.pictures + cat.text + cat.characters;
  return {
    allTime, today, week,
    pictures: cat.pictures, text: cat.text, characters: cat.characters,
    lastStory: ledger.lastStory,
    baselineTotal: b.total, baselineAsOf: b.asOf,
  };
}

// ---- Password ----
function getStoredPassword() { return localStorage.getItem(STORAGE_KEYS.PASSWORD); }
function setStoredPassword(pw) { localStorage.setItem(STORAGE_KEYS.PASSWORD, pw); }
function clearStoredPassword() { localStorage.removeItem(STORAGE_KEYS.PASSWORD); }

// ---- Quota detection ----
// localStorage has a ~5MB cap. When it's full, setItem throws. Detect it so
// the app can show a friendly "clear some stories" message instead of a raw error.
function isQuotaError(err) {
  if (!err) return false;
  return err.name === 'QuotaExceededError'
    || err.name === 'NS_ERROR_DOM_QUOTA_REACHED'
    || err.code === 22
    || err.code === 1014;
}
const STORAGE_FULL_MESSAGE = 'Storage is full. Open Settings and clear some saved stories to free up space.';

function safeSetItem(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (err) {
    if (isQuotaError(err)) {
      const e = new Error(STORAGE_FULL_MESSAGE);
      e.isQuota = true;
      throw e;
    }
    throw err;
  }
}

// ---- Stories ----
function getStoredStories() {
  const raw = localStorage.getItem(STORAGE_KEYS.STORIES);
  if (!raw) return [];
  try { return JSON.parse(raw); } catch (e) { return []; }
}
function saveStoryToStorage(story) {
  const stories = getStoredStories();
  const idx = stories.findIndex(s => s.id === story.id);
  if (idx === -1) stories.unshift(story);
  else stories[idx] = story;
  safeSetItem(STORAGE_KEYS.STORIES, JSON.stringify(stories));
}
function deleteStoryFromStorage(storyId) {
  const stories = getStoredStories().filter(s => s.id !== storyId);
  localStorage.setItem(STORAGE_KEYS.STORIES, JSON.stringify(stories));
}
function clearAllStories() { localStorage.removeItem(STORAGE_KEYS.STORIES); }

// ---- Characters ----
function getStoredCharacters() {
  const raw = localStorage.getItem(STORAGE_KEYS.CHARACTERS);
  if (!raw) return [];
  try { return JSON.parse(raw); } catch (e) { return []; }
}
function saveCharacter(character) {
  const all = getStoredCharacters();
  const idx = all.findIndex(c => c.id === character.id);
  if (idx === -1) all.unshift(character);
  else all[idx] = character;
  safeSetItem(STORAGE_KEYS.CHARACTERS, JSON.stringify(all));
}
function deleteCharacter(id) {
  const all = getStoredCharacters().filter(c => c.id !== id);
  localStorage.setItem(STORAGE_KEYS.CHARACTERS, JSON.stringify(all));
}
// Overwrite the whole character set (used when merging the cloud copy in)
function saveAllCharacters(arr) {
  safeSetItem(STORAGE_KEYS.CHARACTERS, JSON.stringify(arr || []));
}
function touchCharacterLastUsed(id) {
  const all = getStoredCharacters();
  const c = all.find(x => x.id === id);
  if (!c) return;
  c.last_used_at = new Date().toISOString();
  localStorage.setItem(STORAGE_KEYS.CHARACTERS, JSON.stringify(all));
}
function setCharacterAlwaysUseFallback(id, value) {
  const all = getStoredCharacters();
  const c = all.find(x => x.id === id);
  if (!c) return;
  c.always_use_fallback = value;
  localStorage.setItem(STORAGE_KEYS.CHARACTERS, JSON.stringify(all));
}

function setCharacterConfirmedSafe(id, value) {
  const all = getStoredCharacters();
  const c = all.find(x => x.id === id);
  if (!c) return;
  c.confirmed_safe = value;
  localStorage.setItem(STORAGE_KEYS.CHARACTERS, JSON.stringify(all));
}

function setCharacterBothFailed(id, value) {
  const all = getStoredCharacters();
  const c = all.find(x => x.id === id);
  if (!c) return;
  c.image_gen_failed_both = value;
  localStorage.setItem(STORAGE_KEYS.CHARACTERS, JSON.stringify(all));
}

function incrementCharacterFallbackCount(id, success) {
  const all = getStoredCharacters();
  const c = all.find(x => x.id === id);
  if (!c) return;
  if (success) {
    c.fallback_success_count = (c.fallback_success_count || 0) + 1;
  } else {
    c.fallback_fail_count = (c.fallback_fail_count || 0) + 1;
  }
  localStorage.setItem(STORAGE_KEYS.CHARACTERS, JSON.stringify(all));
}

function setCharacterPhotoId(id, photoId) {
  const all = getStoredCharacters();
  const c = all.find(x => x.id === id);
  if (!c) return;
  c.photo_id = photoId;
  localStorage.setItem(STORAGE_KEYS.CHARACTERS, JSON.stringify(all));
}

function setCharacterThumbnailId(id, thumbnailId) {
  const all = getStoredCharacters();
  const c = all.find(x => x.id === id);
  if (!c) return;
  c.thumbnail_id = thumbnailId;
  localStorage.setItem(STORAGE_KEYS.CHARACTERS, JSON.stringify(all));
}

// ---- Library index (cloud book metadata, cached for offline list display) ----
function getLibraryIndex() {
  const raw = localStorage.getItem(STORAGE_KEYS.LIBRARY_INDEX);
  if (!raw) return [];
  try { return JSON.parse(raw); } catch (e) { return []; }
}
function setLibraryIndex(rows) {
  try { safeSetItem(STORAGE_KEYS.LIBRARY_INDEX, JSON.stringify(rows || [])); }
  catch (e) { /* index is a convenience cache; ignore quota */ }
}

// ---- MRU tracking ----
function getMRU(key) {
  const raw = localStorage.getItem(key);
  if (!raw) return {};
  try { return JSON.parse(raw); } catch (e) { return {}; }
}
function touchMRU(key, value) {
  const mru = getMRU(key);
  mru[value] = Date.now();
  localStorage.setItem(key, JSON.stringify(mru));
}
// Sort an array of options (each with .value) by MRU desc; preserves order for ties.
// Items with `pinned: true` (like "Surprise me") always stay at index 0.
function sortByMRU(items, key, pinValue) {
  const mru = getMRU(key);
  const pinned = pinValue ? items.find(i => i.value === pinValue) : null;
  const rest = pinValue ? items.filter(i => i.value !== pinValue) : items.slice();
  rest.sort((a, b) => (mru[b.value] || 0) - (mru[a.value] || 0));
  return pinned ? [pinned, ...rest] : rest;
}

// ---- Created By suggestions ----
function getCreatedBySuggestions() {
  const raw = localStorage.getItem(STORAGE_KEYS.CREATED_BY_LIST);
  if (!raw) return [];
  try { return JSON.parse(raw); } catch (e) { return []; }
}
function addCreatedBySuggestion(name) {
  if (!name || !name.trim()) return;
  const trimmed = name.trim();
  const list = getCreatedBySuggestions().filter(n => n !== trimmed);
  list.unshift(trimmed);
  // cap at 20 to avoid runaway growth
  while (list.length > 20) list.pop();
  localStorage.setItem(STORAGE_KEYS.CREATED_BY_LIST, JSON.stringify(list));
}
function removeCreatedBySuggestion(name) {
  const list = getCreatedBySuggestions().filter(n => n !== name);
  localStorage.setItem(STORAGE_KEYS.CREATED_BY_LIST, JSON.stringify(list));
}

// ---- Debug mode (kept for backwards compatibility — Settings menu now controls visibility) ----
function getDebugMode() { return localStorage.getItem(STORAGE_KEYS.DEBUG_MODE) === 'true'; }
function setDebugMode(enabled) { localStorage.setItem(STORAGE_KEYS.DEBUG_MODE, enabled ? 'true' : 'false'); }

// ---- Show inspect buttons on images ----
function getShowInspect() { return localStorage.getItem(STORAGE_KEYS.SHOW_INSPECT) === 'true'; }
function setShowInspect(v) { localStorage.setItem(STORAGE_KEYS.SHOW_INSPECT, v ? 'true' : 'false'); }

// ---- Sticky prefs ----
function getStickyPrefs() {
  const raw = localStorage.getItem(STORAGE_KEYS.STICKY_PREFS);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { return null; }
}
function setStickyPrefs(prefs) {
  localStorage.setItem(STORAGE_KEYS.STICKY_PREFS, JSON.stringify({
    ageRange: prefs.ageRange,
    length: prefs.length,
  }));
}

// ---- Storage size (stories only) ----
function getStorageSizeBytes() {
  const stories = localStorage.getItem(STORAGE_KEYS.STORIES);
  if (!stories) return 0;
  return STORAGE_KEYS.STORIES.length + stories.length;
}

function formatStorageSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

// ---- Calendar-day relative time ----
// Uses local calendar day, not 24-hour windows. Adds time-of-day for recent uses.
function formatRelativeTime(isoString) {
  if (!isoString) return 'Never used';
  const then = new Date(isoString);
  const now = new Date();

  const thenDay = new Date(then.getFullYear(), then.getMonth(), then.getDate());
  const nowDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayDiff = Math.round((nowDay - thenDay) / (1000 * 60 * 60 * 24));

  const timeStr = then.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

  if (dayDiff === 0) return `Used today at ${timeStr}`;
  if (dayDiff === 1) return `Used yesterday at ${timeStr}`;
  if (dayDiff < 7) return `Used ${dayDiff} days ago`;
  if (dayDiff < 14) return 'Used last week';
  if (dayDiff < 30) {
    const weeks = Math.floor(dayDiff / 7);
    return weeks === 1 ? 'Used last week' : `Used ${weeks} weeks ago`;
  }
  if (dayDiff < 60) return 'Used last month';
  if (dayDiff < 365) {
    const months = Math.floor(dayDiff / 30);
    return months === 1 ? 'Used last month' : `Used ${months} months ago`;
  }
  return 'Used over a year ago';
}

// ---- Possibly-copyrighted name detection (tightened) ----
// Only flag SPECIFIC character names, not categorical terms like "disney" or "princess".
// This list is intentionally conservative — better to miss a flag than create false positives.
const POSSIBLY_PROBLEMATIC_KEYWORDS = [
  // Nintendo
  'mario','luigi','bowser','pikachu','charmander','squirtle','bulbasaur',
  // Disney specific characters
  'elsa','olaf','mickey mouse','minnie mouse','simba','ariel','rapunzel','moana','aladdin','cinderella',
  // Marvel/DC
  'spider-man','spiderman','batman','superman','iron man','captain america','wolverine','deadpool',
  // Kids shows
  'bluey','peppa pig','spongebob','minions',
  // Other
  'harry potter','hermione','sonic','kirby','darth vader','baby yoda',
  // NOTE: Generic terms like "disney", "princess", "marvel", "pokemon" are NOT flagged
  // because they often appear as descriptors of original characters.
];

function isPossiblyProblematic(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  return POSSIBLY_PROBLEMATIC_KEYWORDS.some(ip => lower.includes(ip));
}

// Find which specific keyword(s) triggered the flag — for showing the user
function getProblematicMatches(text) {
  if (!text) return [];
  const lower = text.toLowerCase();
  return POSSIBLY_PROBLEMATIC_KEYWORDS.filter(ip => lower.includes(ip));
}
