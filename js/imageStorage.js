// =====================================================================
// imageStorage.js — IndexedDB wrapper for image blobs
// =====================================================================
// localStorage is too small for image data (~5MB cap).
// IndexedDB has GB-scale capacity and handles binary blobs natively.
//
// Used for: storing generated story images (cover + each page).
// Story metadata stays in localStorage; image binary lives here.
// =====================================================================

const IMAGE_DB_NAME = 'storytime_images';
const IMAGE_STORE = 'images';
const IMAGE_DB_VERSION = 1;

let dbPromise = null;

function openImageDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(IMAGE_DB_NAME, IMAGE_DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(IMAGE_STORE)) {
        db.createObjectStore(IMAGE_STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
  return dbPromise;
}

async function saveImageBlob(imageId, blob) {
  const db = await openImageDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([IMAGE_STORE], 'readwrite');
    const store = tx.objectStore(IMAGE_STORE);
    const req = store.put({ id: imageId, blob, savedAt: Date.now() });
    req.onsuccess = () => resolve();
    req.onerror = (e) => reject(e.target.error);
  });
}

async function getImageBlob(imageId) {
  const db = await openImageDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([IMAGE_STORE], 'readonly');
    const store = tx.objectStore(IMAGE_STORE);
    const req = store.get(imageId);
    req.onsuccess = (e) => resolve(e.target.result ? e.target.result.blob : null);
    req.onerror = (e) => reject(e.target.error);
  });
}

async function deleteImageBlob(imageId) {
  const db = await openImageDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([IMAGE_STORE], 'readwrite');
    const store = tx.objectStore(IMAGE_STORE);
    const req = store.delete(imageId);
    req.onsuccess = () => resolve();
    req.onerror = (e) => reject(e.target.error);
  });
}

async function clearAllImages() {
  const db = await openImageDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([IMAGE_STORE], 'readwrite');
    const store = tx.objectStore(IMAGE_STORE);
    const req = store.clear();
    req.onsuccess = () => resolve();
    req.onerror = (e) => reject(e.target.error);
  });
}

// Returns all image ids currently stored (for orphan cleanup)
async function getAllImageIds() {
  const db = await openImageDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([IMAGE_STORE], 'readonly');
    const store = tx.objectStore(IMAGE_STORE);
    const req = store.getAllKeys();
    req.onsuccess = (e) => resolve(e.target.result || []);
    req.onerror = (e) => reject(e.target.error);
  });
}

// Returns rough stats about the image DB
async function getImageDBStats() {
  const db = await openImageDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([IMAGE_STORE], 'readonly');
    const store = tx.objectStore(IMAGE_STORE);
    const req = store.getAll();
    req.onsuccess = (e) => {
      const all = e.target.result || [];
      const totalBytes = all.reduce((sum, x) => sum + (x.blob ? x.blob.size : 0), 0);
      resolve({ count: all.length, bytes: totalBytes });
    };
    req.onerror = (e) => reject(e.target.error);
  });
}

// Convert base64 string to a Blob
function base64ToBlob(b64, mimeType = 'image/png') {
  const byteCharacters = atob(b64);
  const byteArrays = [];
  for (let offset = 0; offset < byteCharacters.length; offset += 512) {
    const slice = byteCharacters.slice(offset, offset + 512);
    const byteNumbers = new Array(slice.length);
    for (let i = 0; i < slice.length; i++) {
      byteNumbers[i] = slice.charCodeAt(i);
    }
    byteArrays.push(new Uint8Array(byteNumbers));
  }
  return new Blob(byteArrays, { type: mimeType });
}

// Create an object URL from a blob (for use as <img src="...">)
function blobToObjectURL(blob) {
  return URL.createObjectURL(blob);
}
