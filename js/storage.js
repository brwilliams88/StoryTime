// =====================================================================
// storage.js — Browser localStorage helpers
// =====================================================================

const STORAGE_KEYS = {
  PASSWORD: 'storytime_password',
  STORIES: 'storytime_stories',
  CHARACTERS: 'storytime_characters',
  DEBUG_MODE: 'storytime_debug_mode',
  STICKY_PREFS: 'storytime_sticky_prefs',
};

// ---- Password ----
function getStoredPassword() {
  return localStorage.getItem(STORAGE_KEYS.PASSWORD);
}
function setStoredPassword(password) {
  localStorage.setItem(STORAGE_KEYS.PASSWORD, password);
}
function clearStoredPassword() {
  localStorage.removeItem(STORAGE_KEYS.PASSWORD);
}

// ---- Stories ----
function getStoredStories() {
  const raw = localStorage.getItem(STORAGE_KEYS.STORIES);
  if (!raw) return [];
  try { return JSON.parse(raw); } catch (e) { return []; }
}
function saveStoryToStorage(story) {
  const stories = getStoredStories();
  stories.unshift(story);
  localStorage.setItem(STORAGE_KEYS.STORIES, JSON.stringify(stories));
}
function deleteStoryFromStorage(storyId) {
  const stories = getStoredStories().filter(s => s.id !== storyId);
  localStorage.setItem(STORAGE_KEYS.STORIES, JSON.stringify(stories));
}
function clearAllStories() {
  localStorage.removeItem(STORAGE_KEYS.STORIES);
}

// ---- Characters ----
function getStoredCharacters() {
  const raw = localStorage.getItem(STORAGE_KEYS.CHARACTERS);
  if (!raw) return [];
  try { return JSON.parse(raw); } catch (e) { return []; }
}
function saveCharacter(character) {
  const all = getStoredCharacters();
  const idx = all.findIndex(c => c.id === character.id);
  if (idx === -1) {
    all.unshift(character); // new character to top
  } else {
    all[idx] = character;   // update existing
  }
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

// ---- Debug mode ----
function getDebugMode() {
  return localStorage.getItem(STORAGE_KEYS.DEBUG_MODE) === 'true';
}
function setDebugMode(enabled) {
  localStorage.setItem(STORAGE_KEYS.DEBUG_MODE, enabled ? 'true' : 'false');
}

// ---- Sticky preferences (age, length only) ----
function getStickyPrefs() {
  const raw = localStorage.getItem(STORAGE_KEYS.STICKY_PREFS);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { return null; }
}
function setStickyPrefs(prefs) {
  localStorage.setItem(STORAGE_KEYS.STICKY_PREFS, JSON.stringify({
    age: prefs.age,
    length: prefs.length,
  }));
}

// ---- Storage size (stories only, per v0.5 bug fix) ----
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

// ---- Relative time formatter ("used today / 3 days ago / etc") ----
function formatRelativeTime(isoString) {
  if (!isoString) return 'Never used';
  const then = new Date(isoString);
  const now = new Date();
  const diffSec = Math.max(0, Math.floor((now - then) / 1000));

  if (diffSec < 60)            return 'Just now';
  if (diffSec < 3600)          return `${Math.floor(diffSec / 60)} min ago`;
  if (diffSec < 86400)         return 'Used today';
  if (diffSec < 2 * 86400)     return 'Used yesterday';
  if (diffSec < 7 * 86400)     return `Used ${Math.floor(diffSec / 86400)} days ago`;
  if (diffSec < 30 * 86400) {
    const w = Math.floor(diffSec / (7 * 86400));
    return w === 1 ? 'Used last week' : `Used ${w} weeks ago`;
  }
  if (diffSec < 365 * 86400) {
    const m = Math.floor(diffSec / (30 * 86400));
    return m === 1 ? 'Used last month' : `Used ${m} months ago`;
  }
  return 'Used over a year ago';
}
