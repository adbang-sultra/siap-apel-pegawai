// =====================================================================
// SIAP APEL (Versi Pegawai) — Inisialisasi Supabase
// =====================================================================
// NOTE: kita sengaja TIDAK menamai variabel lokal "supabase", karena nama
// itu dipakai oleh library UMD Supabase sendiri (window.supabase). Memakai
// nama yang sama bisa membuat pemanggilan berikutnya salah sasaran / bug.
(function () {
  const CFG = window.SIAP_APEL_CONFIG || {};
  const NOT_CONFIGURED =
    !CFG.SUPABASE_URL ||
    !CFG.SUPABASE_ANON_KEY ||
    CFG.SUPABASE_URL.includes('YOUR-PROJECT-REF') ||
    CFG.SUPABASE_ANON_KEY.includes('YOUR-ANON');

  let sbClient = null;
  let SDK_ERROR = null;

  try {
    if (!NOT_CONFIGURED) {
      if (!window.supabase || typeof window.supabase.createClient !== 'function') {
        throw new Error('Library Supabase (CDN) gagal dimuat. Periksa koneksi internet / apakah script CDN diblokir.');
      }
      sbClient = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
    }
  } catch (err) {
    console.error('Gagal membuat Supabase client:', err);
    SDK_ERROR = err;
  }

  window.SB = {
    client() {
      if (SDK_ERROR) throw SDK_ERROR;
      if (!sbClient) throw new Error('Supabase belum dikonfigurasi. Lengkapi js/config.js.');
      return sbClient;
    },
    isConfigured() {
      return !NOT_CONFIGURED && !SDK_ERROR;
    },
    configError() {
      return SDK_ERROR ? SDK_ERROR.message : null;
    },
  };

  function throwIfError(error) {
    if (error) throw new Error(error.message || 'Terjadi kesalahan pada database.');
  }
  window.throwIfError = throwIfError;
})();
