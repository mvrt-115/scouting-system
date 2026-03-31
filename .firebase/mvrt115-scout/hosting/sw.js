const CACHE_VERSION = 'v4';
const CACHE_NAME = `mvrt-super-scout-${CACHE_VERSION}`;

const CORE_ASSETS = [
  '/',
  '/login',
  '/dashboard',
  '/scout',
  '/pit-scout',
  '/superscout',
  '/offline',
  '/logo.png',
  '/field.png',
  '/manifest.webmanifest',
];

// ─── Install ──────────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .catch(() => undefined)
  );
  self.skipWaiting();
});

// ─── Activate ─────────────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) return caches.delete(key);
          return Promise.resolve();
        })
      )
    )
  );
  self.clients.claim();
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
function isNavigationRequest(request) {
  return request.mode === 'navigate';
}

function isSameOriginAsset(request) {
  const url = new URL(request.url);
  return (
    url.origin === self.location.origin &&
    (url.pathname.startsWith('/_next/static/') ||
      url.pathname.startsWith('/_next/image') ||
      url.pathname.match(/\.(png|jpg|jpeg|svg|gif|webp|ico|woff2?|ttf|otf|css|js)$/))
  );
}

function isApiOrFirebase(request) {
  const url = new URL(request.url);
  return (
    url.pathname.startsWith('/api/') ||
    url.hostname.includes('firestore.googleapis.com') ||
    url.hostname.includes('firebase') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('thebluealliance.com')
  );
}

// ─── Fetch ────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only handle GET requests.
  if (request.method !== 'GET') return;

  // Let API / Firebase / external requests go straight to the network.
  if (isApiOrFirebase(request)) return;

  // ── Navigation (HTML pages) ──────────────────────────────────────────────
  if (isNavigationRequest(request)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          // Serve the dedicated offline page if available, otherwise root.
          return (await caches.match('/offline')) || (await caches.match('/')) || new Response('Offline', { status: 503 });
        })
    );
    return;
  }

  // ── Static assets – cache-first, update in background ───────────────────
  if (isSameOriginAsset(request)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const networkFetch = fetch(request)
          .then((response) => {
            if (response && response.status === 200) {
              const copy = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
            }
            return response;
          })
          .catch(() => cached);

        return cached || networkFetch;
      })
    );
    return;
  }

  // ── Everything else – network-first, fall back to cache ─────────────────
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.status === 200) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        return cached || new Response('Offline', { status: 503 });
      })
  );
});

// ─── Background Sync ──────────────────────────────────────────────────────────
self.addEventListener('sync', (event) => {
  if (event.tag === 'offline-queue-sync') {
    event.waitUntil(notifyClientsToSync());
  }
});

async function notifyClientsToSync() {
  const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of allClients) {
    client.postMessage({ type: 'SW_SYNC_QUEUE' });
  }
}

// ─── Message handling ─────────────────────────────────────────────────────────
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
