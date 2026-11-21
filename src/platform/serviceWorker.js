// Vite prepends the release and the complete list of files in its build.
const scope = new URL(self.registration.scope);
const prefix = `affix-grid-release:${scope.href}:`;
const cacheName = prefix + release;
const shell = new URL(`offline-${release}.html`, scope);
const index = new URL('index.html', scope);

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(cacheName);
    try {
      await cache.addAll(precache.map(file => new Request(new URL(file, scope), {
        cache: file.startsWith('assets/') ? 'default' : 'reload',
      })));
    } catch (error) {
      if (!(await cache.match(shell))) await caches.delete(cacheName);
      throw error;
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const releases = (await caches.keys()).filter(key => key.startsWith(prefix));
    const current = releases.indexOf(cacheName);
    // An already-open tab can still request a lazy chunk from the preceding release.
    const stale = releases.slice(0, Math.max(0, current - 1));
    await Promise.all(stale.map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

async function navigate(request) {
  let response;
  try {
    response = await fetch(request);
    if (response.ok) return response;
  } catch {
    // The pinned shell and its assets are installed together.
  }
  const cached = await (await caches.open(cacheName)).match(shell);
  return cached ?? response ?? new Response('请联网打开一次词条法阵。', {
    status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

async function asset(request) {
  const cached = await (await caches.open(cacheName)).match(request);
  if (cached) return cached;
  for (const key of (await caches.keys()).reverse()) {
    if (key === cacheName || !key.startsWith(prefix)) continue;
    const previous = await caches.match(request, { cacheName: key });
    if (previous) return previous;
  }
  return fetch(request);
}

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;
  if (request.mode === 'navigate') {
    if (url.pathname === scope.pathname || url.pathname === index.pathname) event.respondWith(navigate(request));
  } else {
    event.respondWith(asset(request));
  }
});
