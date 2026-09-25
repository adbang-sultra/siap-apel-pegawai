// =====================================================================
// SIAP APEL — Konfigurasi Koneksi Supabase
// =====================================================================
// Isi dua nilai di bawah ini dengan milik project Supabase Anda:
// Dashboard Supabase -> Project Settings -> API
//   - Project URL          -> SUPABASE_URL
//   - anon / public API key -> SUPABASE_ANON_KEY
//
// Kunci "anon" AMAN untuk ditaruh di kode front-end (bukan rahasia),
// karena akses data tetap dibatasi oleh Row Level Security (RLS) yang
// sudah diatur lewat supabase/schema.sql. JANGAN pernah menaruh
// "service_role key" di sini.
// =====================================================================

window.SIAP_APEL_CONFIG = {
  SUPABASE_URL: 'https://YOUR-PROJECT-REF.supabase.co',
  SUPABASE_ANON_KEY: 'YOUR-ANON-PUBLIC-KEY',
};
