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
};

// ---- Password ----
function getStoredPassword() { return localStorage.getItem(STORAGE_KEYS.PASSWORD); }
function setStoredPassword(pw) { localStorage.setItem(STORAGE_KEYS.PASSWORD, pw); }
function clearStoredPassword() { localStorage.removeItem(STORAGE_KEYS.PASSWORD); }

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
  localStorage.setItem(STORAGE_KEYS.STORIES, JSON.stringify(stories));
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
  localStorage.setItem(STORAGE_KEYS.CHARACTERS, JSON.stringify(all));
}
function deleteCharacter(id) {
  const all = getStoredCharacters().filter(c => c.id !== id);
  localStorage.setItem(STORAGE_KEYS.CHARACTERS, JSON.stringify(all));
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
