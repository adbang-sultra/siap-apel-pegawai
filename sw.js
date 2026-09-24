// =====================================================================
// SIAP APEL — Service Worker (versi Pegawai)
// Cache app-shell agar tampilan tetap terbuka saat koneksi lemah/terputus.
// Data tetap dari Supabase secara online; SW ini TIDAK menyimpan data absensi.
// =====================================================================
const CACHE_NAME = 'siap-apel-pegawai-v1';
const SHELL = [
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
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  // Jangan cache panggilan API Supabase — selalu ambil data terbaru dari jaringan.
  if (req.url.includes('supabase.co')) return;
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.ok) caches.open(CACHE_NAME).then((cache) => cache.put(req, res.clone()));
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
