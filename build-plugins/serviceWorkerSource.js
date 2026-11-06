// build-plugins/serviceWorkerSource.js
// The service worker that lets the app be installed and run offline (served as /studio2/sw.js).
// The build (build-plugins/serviceWorker.js) puts `const PRECACHE = { version, files }` in
// front of this file: every file of the build with its SHA-256, so each deploy makes a new
// sw.js, which the browser notices and installs in the background.
//
// - install: saves every file of the build in a cache of its own (`ewave-studio2-app-<version>`).
//   A file the previous version already saved, unchanged, is copied from there instead of
//   downloaded again. Each file must match the build's checksum, so a deploy that is still
//   uploading (a new sw.js next to an old index.html) fails the install, and the browser tries
//   again on a later visit; until then the previous version keeps working.
// - The new version then waits: the page shows "New version available" (src/composables/
//   usePwa.ts), and its Reload button tells this worker to take over ('skip-waiting').
// - activate: deletes the older versions' caches. On the very first install it takes the open
//   page over at once (clients.claim), so it works offline from the first visit.
// - fetch: the app's own files come from the cache, falling back to the network; opening the
//   app (/studio2/) gets the cached index.html. Other sites' requests (Google Analytics) and
//   anything outside /studio2/ are left alone. Only this folder is the worker's scope, so the
//   main site and /studio/ are never touched.

/* global PRECACHE */
const CACHE_PREFIX = 'ewave-studio2-app-';
const CACHE = CACHE_PREFIX + PRECACHE.version;
const SCOPE = self.registration.scope; // https://…/studio2/
const urlOf = (path) => new URL(path, SCOPE).href;

async function sha256Hex(buffer) {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

// A stored copy keeps only the body and its type (the body is already decoded, so a
// Content-Encoding or Content-Length header would no longer be true)
const stored = (body, type) => new Response(body, { headers: type ? { 'Content-Type': type } : {} });

async function previousCopy(url, hash, older) {
  for (const name of older) {
    const hit = await (await caches.open(name)).match(url);
    if (!hit) continue;
    const body = await hit.arrayBuffer();
    if (await sha256Hex(body) === hash) return stored(body, hit.headers.get('Content-Type'));
  }
  return null;
}

async function download(url, hash) {
  const res = await fetch(url, { cache: 'reload' });
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  const body = await res.arrayBuffer();
  if (await sha256Hex(body) !== hash) throw new Error(`${url} isn't this version's file (a deploy still uploading?)`);
  return stored(body, res.headers.get('Content-Type'));
}

async function install() {
  const older = (await caches.keys()).filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE);
  const existed = await caches.has(CACHE);
  const cache = await caches.open(CACHE);
  try {
    await Promise.all(PRECACHE.files.map(async ({ url: path, hash }) => {
      const url = urlOf(path);
      const copy = (await previousCopy(url, hash, older)) || (await download(url, hash));
      await cache.put(url, copy);
    }));
  } catch (err) {
    if (!existed) await caches.delete(CACHE); // never the cache a running version uses
    throw err;
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(install());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const k of await caches.keys()) {
      if (k.startsWith(CACHE_PREFIX) && k !== CACHE) await caches.delete(k);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});

async function fromCache(key, request) {
  const hit = await (await caches.open(CACHE)).match(key, { ignoreSearch: true });
  return hit || fetch(request);
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || !request.url.startsWith(SCOPE)) return;
  const url = new URL(request.url);
  const key = url.origin + url.pathname;
  // Opening the app: its page, whatever follows the folder's name (?query, #hash)
  const isApp = request.mode === 'navigate' && (key === SCOPE || key === urlOf('index.html'));
  event.respondWith(fromCache(isApp ? urlOf('index.html') : key, request));
});
