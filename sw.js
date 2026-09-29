// =====================================================================
// SIAP APEL — Service Worker (versi Pegawai)
// Cache app-shell (network-first, fallback ke cache saat offline).
// Data tetap dari Supabase secara online; SW ini TIDAK menyimpan data absensi.
// =====================================================================
const CACHE_NAME = 'siap-apel-pegawai-v3';
const SHELL = [
  './',
  './index.html',
  './css/styles.css',
  './css/staf.css',
  './js/config.js',
  './js/supabase-init.js',
  './js/staf-db.js',
  './js/signature-pad.js',
  './js/staf-app.js',
  './assets/logo.png',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './manifest.webmanifest',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL))
      .catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))));
  self.clients.claim();
});

// Network-first: selalu coba jaringan dulu (data terbaru), simpan salinan
// ke cache untuk fallback offline. Setiap Response hanya dibaca SATU kali
// (via clone() sebelum dipakai) untuk menghindari "body already used".
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  if (req.url.includes('supabase.co')) return; // jangan cache panggilan API
  if (!req.url.startsWith(self.location.origin)) return; // jangan cache CDN eksternal

  event.respondWith(
    fetch(req)
      .then((networkRes) => {
        if (networkRes && networkRes.ok) {
          const copy = networkRes.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        }
        return networkRes;
      })
      .catch(() => caches.match(req))
  );
});
