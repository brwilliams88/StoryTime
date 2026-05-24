// =====================================================================
// storage.js — Browser localStorage helpers
// =====================================================================
// localStorage is a small key-value database that lives inside your
// browser. Each website gets its own private space (~5–10 MB).
// =====================================================================

const STORAGE_KEYS = {
  PASSWORD: 'storytime_password',
  STORIES: 'storytime_stories',
  DEBUG_MODE: 'storytime_debug_mode',
  STICKY_PREFS: 'storytime_sticky_prefs',  // age, length only
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
  try {
    return JSON.parse(raw);
  } catch (e) {
    console.error('Failed to parse stored stories — returning empty list', e);
    return [];
  }
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
  try {
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function setStickyPrefs(prefs) {
  // Only persist the explicitly sticky fields
  const toSave = {
    age: prefs.age,
    length: prefs.length,
  };
  localStorage.setItem(STORAGE_KEYS.STICKY_PREFS, JSON.stringify(toSave));
}

// ---- Storage size ----
// Returns total bytes used by all localStorage keys for this app
function getStorageSizeBytes() {
  let total = 0;
  for (const key of Object.values(STORAGE_KEYS)) {
    const value = localStorage.getItem(key);
    if (value) {
      total += key.length + value.length;
    }
  }
  return total;
}

function formatStorageSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
