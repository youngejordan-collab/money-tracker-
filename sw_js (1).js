
// ═══════════════════════════════════════════════════
//  The Money Tracker — Service Worker
//  Strategy:
//    - App shell (HTML/CSS/JS) → Cache First
//    - API calls to chat server → Network First (never cached)
//    - Everything else → Stale While Revalidate
// ═══════════════════════════════════════════════════

const CACHE_NAME = 'money-tracker-v1';
const API_HOST   = '3967e345-2e63-4cb6-bb9e-f7d35802e0d7.web.createdevserver.com';

// Files to pre-cache on install
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
];

// ── INSTALL: pre-cache app shell ──────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()) // activate immediately
  );
});

// ── ACTIVATE: clean up old caches ────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim()) // take control immediately
  );
});

// ── FETCH: routing strategy ───────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // 1. Skip non-GET requests entirely
  if (request.method !== 'GET') return;

  // 2. Skip API/chat server calls — always go to network
  if (url.hostname === API_HOST) {
    event.respondWith(networkOnly(request));
    return;
  }

  // 3. Skip browser-extension and non-http(s) URLs
  if (!url.protocol.startsWith('http')) return;

  // 4. App shell (HTML pages) → Cache First, fall back to offline page
  if (request.mode === 'navigate') {
    event.respondWith(cacheFirst(request));
    return;
  }

  // 5. Everything else → Stale While Revalidate
  event.respondWith(staleWhileRevalidate(request));
});

// ─────────────────────────────────────────────────
//  STRATEGIES
// ─────────────────────────────────────────────────

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Offline fallback — return cached index.html for navigation
    const fallback = await caches.match('/index.html');
    if (fallback) return fallback;
    return new Response(offlinePage(), {
      headers: { 'Content-Type': 'text/html' }
    });
  }
}

async function staleWhileRevalidate(request) {
  const cache  = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request).then(response => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => cached);
  return cached || fetchPromise;
}

async function networkOnly(request) {
  try {
    return await fetch(request);
  } catch {
    return new Response(JSON.stringify({ error: 'You are offline. Please reconnect to chat with the AI assistant.' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// ─────────────────────────────────────────────────
//  OFFLINE FALLBACK PAGE
// ─────────────────────────────────────────────────
function offlinePage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>The Money Tracker — Offline</title>
  <style>
    body { font-family: -apple-system, sans-serif; background: #065f46; color: #fff;
           display: flex; align-items: center; justify-content: center;
           min-height: 100vh; margin: 0; text-align: center; padding: 2rem; }
    .icon { font-size: 4rem; margin-bottom: 1rem; }
    h1 { font-size: 1.8rem; margin-bottom: 0.5rem; }
    p { color: rgba(255,255,255,0.75); margin-bottom: 2rem; }
    button { background: #22c55e; color: #fff; border: none; padding: 0.9rem 2rem;
             border-radius: 999px; font-size: 1rem; font-weight: 700; cursor: pointer; }
  </style>
</head>
<body>
  <div>
    <div class="icon">💰</div>
    <h1>You're Offline</h1>
    <p>The Money Tracker needs a connection to chat with the AI assistant.<br>
       Your saved plan is still available once you go back online.</p>
    <button onclick="location.reload()">Try Again</button>
  </div>
</body>
</html>`;
}

// ─────────────────────────────────────────────────
//  BACKGROUND SYNC (optional push for future use)
// ─────────────────────────────────────────────────
self.addEventListener('message', event => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});
