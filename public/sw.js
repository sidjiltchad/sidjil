// ============================================================
// SIDJIL — Service Worker لتطبيق الويب التقدمي (مجلس سِجِل)
// - الأصول الثابتة: cache-first
// - الصفحات: network-first مع بديل أوفلاين
// - الـ API: network-only (لا تخزين مؤقت للنقاشات — تظهر تلقائيًا)
// ============================================================

const STATIC_CACHE = 'sidjil-static-v1';
const PAGES_CACHE = 'sidjil-pages-v1';

const STATIC_ASSETS = [
  '/style.css',
  '/app.js',
  '/js/discussions.js',
  '/logo.png',
  '/manifest.json',
  '/fonts/ibm-plex-sans-arabic-400.woff2',
  '/fonts/ibm-plex-sans-arabic-500.woff2',
  '/fonts/ibm-plex-sans-arabic-600.woff2',
  '/fonts/ibm-plex-sans-arabic-700.woff2',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => ![STATIC_CACHE, PAGES_CACHE].includes(k)).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

function isStatic(url) {
  return /\.(css|js|png|jpg|jpeg|webp|svg|woff2?|ico)$/.test(url.pathname) || url.pathname === '/manifest.json';
}

function isApi(url) {
  return url.pathname.startsWith('/api/') || url.pathname.startsWith('/file/');
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // الـ API والملفات: شبكة فقط دائمًا
  if (isApi(url)) {
    event.respondWith(fetch(request));
    return;
  }

  // الأصول الثابتة: الكاش أولًا
  if (isStatic(url)) {
    event.respondWith(
      caches.match(request).then((hit) => hit || fetch(request).then((res) => {
        const copy = res.clone();
        caches.open(STATIC_CACHE).then((c) => c.put(request, copy));
        return res;
      }))
    );
    return;
  }

  // الصفحات: الشبكة أولًا، ثم الكاش، ثم صفحة أوفلاين
  event.respondWith(
    fetch(request).then((res) => {
      const copy = res.clone();
      caches.open(PAGES_CACHE).then((c) => c.put(request, copy));
      return res;
    }).catch(() =>
      caches.match(request).then((hit) => hit || caches.match('/offline'))
    )
  );
});
