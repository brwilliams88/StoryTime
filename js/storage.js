// =====================================================================
// storage.js — Browser localStorage helpers
// =====================================================================
// localStorage is a small key-value database that lives inside your
// browser. Each website gets its own private space (~5–10 MB).
// Data survives page refreshes and closing the browser, until the user
// explicitly clears their browser data.
//
// We use it for:
//   - Remembering the app password (so it's typed once per device)
//   - Caching generated stories (so the library survives refreshes)
//   - Remembering UI preferences (like whether debug mode is on)
//
// All functions here are intentionally simple and synchronous —
// localStorage is fast and doesn't need async/await.
// =====================================================================

const STORAGE_KEYS = {
  PASSWORD: 'storytime_password',
  STORIES: 'storytime_stories',
  DEBUG_MODE: 'storytime_debug_mode',
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
// Stories are stored as a JSON array. Each story object contains:
//   { id, title, pages, formData, cost, createdAt, response }
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
  stories.unshift(story); // newest first
  localStorage.setItem(STORAGE_KEYS.STORIES, JSON.stringify(stories));
}

function deleteStoryFromStorage(storyId) {
  const stories = getStoredStories().filter(s => s.id !== storyId);
  localStorage.setItem(STORAGE_KEYS.STORIES, JSON.stringify(stories));
}

// ---- Debug mode ----
function getDebugMode() {
  return localStorage.getItem(STORAGE_KEYS.DEBUG_MODE) === 'true';
}

function setDebugMode(enabled) {
  localStorage.setItem(STORAGE_KEYS.DEBUG_MODE, enabled ? 'true' : 'false');
}
