// =====================================================================
// StoryTime Service Worker
// =====================================================================
// Strategy (deliberately simple and safe):
//
//   - HTML pages: NETWORK-FIRST → falls back to cache when offline
//     (ensures you always get the latest app version when online)
//
//   - Static assets (JS, CSS, images): CACHE-FIRST with background refresh
//     (fast load from cache; updated copies fetched in the background)
//
//   - API calls (Cloudflare Worker / cross-origin): bypassed entirely
//     (always go directly to the network)
//
//   - Cache name is VERSION-TAGGED. When CACHE_VERSION changes, the
//     activate handler deletes all old caches automatically.
//
//   - skipWaiting() + clients.claim() = a new SW takes over on next
//     page load without requiring tabs to be closed.
//
// To force a full refresh from the app, use the "Force Update" button
// in the debug panel — it unregisters this SW and clears all caches.
// =====================================================================

const CACHE_VERSION = 'v0.9.65';
const CACHE_NAME = `storytime-${CACHE_VERSION}`;

// ---- Install ----
self.addEventListener('install', (event) => {
  // Take over immediately on next reload (don't wait for tabs to close)
  self.skipWaiting();
});

// ---- Activate: clean out old caches ----
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith('storytime-') && k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      );
      // Take control of all open pages immediately
      await self.clients.claim();
    })()
  );
});

// ---- Fetch handler ----
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only handle GET requests
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Bypass cross-origin (Cloudflare Worker, OpenAI, Vue CDN)
  if (url.origin !== self.location.origin) return;

  // HTML pages → network-first
  const isHTML =
    request.mode === 'navigate' ||
    request.destination === 'document' ||
    (request.headers.get('accept') || '').includes('text/html');

  if (isHTML) {
    event.respondWith(networkFirst(request));
    return;
  }

  // Everything else → cache-first with background refresh
  event.respondWith(cacheFirstWithRefresh(request));
});

async function networkFirst(request) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (e) {
    const cached = await caches.match(request);
    if (cached) return cached;
    throw e;
  }
}

async function cacheFirstWithRefresh(request) {
  const cached = await caches.match(request);

  // Kick off a background fetch to refresh cache for next time
  const networkUpdate = fetch(request)
    .then(async (response) => {
      if (response && response.ok) {
        const cache = await caches.open(CACHE_NAME);
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);

  // Return cached immediately if we have it; otherwise wait for network
  return cached || (await networkUpdate) || fetch(request);
}

// ---- Messages from the page ----
self.addEventListener('message', (event) => {
  if (!event.data) return;

  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data.type === 'CLEAR_ALL_CACHES') {
    event.waitUntil(
      (async () => {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      })()
    );
  }
});
