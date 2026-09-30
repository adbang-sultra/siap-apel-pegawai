// =====================================================================
// SIAP APEL — Logika Aplikasi Versi Pegawai (Biro Administrasi Pembangunan)
// =====================================================================

const LOGO_SULTRA = 'assets/logo.png';
let STAF = [];
let ORG_SETTINGS = { namaBiro: 'Biro Administrasi Pembangunan', kepalaNama: '', kepalaPangkat: '', kepalaNip: '' };
let PEGAWAI_SESSION = null; // profil pegawai yang sedang login (role pegawai)
let ADMIN_USERNAME = null;
let sigPadPegawai = null;
let html5QrCode = null;
let qrRotateInterval = null;

const todayStr = () => new Date().toISOString().slice(0, 10);
const fmtTgl = (iso) => {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
};
function esc(s) {
  return (s ?? '').toString().replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
function toast(msg, type) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast' + (type === 'error' ? ' error' : '');
  clearTimeout(window._tt);
  window._tt = setTimeout(() => t.classList.add('hidden'), 3200);
}
function defaultJenisApel() {
  return new Date().getHours() < 12 ? 'Apel Pagi' : 'Apel Sore';
}

// ---------------- OFFLINE BANNER ----------------
function updateOnlineStatus() {
  const el = document.getElementById('offlineBanner');
  if (el) el.classList.toggle('show', !navigator.onLine);
}
window.addEventListener('online', updateOnlineStatus);
window.addEventListener('offline', updateOnlineStatus);

// =====================================================================
// ROTATING QR — HMAC-SHA256 berbasis waktu, berputar tiap 10 detik
// Payload (HURUF BESAR agar QR lebih kecil/rapat-rendah & mudah dipindai):
//   "<ID32HEX>.<SLOT-BASE36>.<KODE10HEX>"
// Jam disamakan ke waktu SERVER (server_time_ms) agar HP pegawai dan
// perangkat Admin tidak salah hitung slot bila jam perangkatnya berbeda.
// =====================================================================
let CLOCK_OFFSET = 0; // ms; waktuServer - waktuPerangkat
let CLOCK_SYNCED = false;
function nowMs() {
  return Date.now() + CLOCK_OFFSET;
}
async function syncClock() {
  try {
    const t0 = Date.now();
    const server = await StafDB.serverTimeMs();
    const t1 = Date.now();
    if (Number.isFinite(server) && server > 0) {
      CLOCK_OFFSET = server + (t1 - t0) / 2 - t1;
      CLOCK_SYNCED = true;
    }
  } catch (err) {
    console.warn('Sinkronisasi jam server gagal (jalankan ulang supabase/schema.sql):', err.message);
  }
}
function currentTimeSlot() {
  return Math.floor(nowMs() / 10000);
}
async function hmacHex(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
async function computeRotatingPayload(stafId, secret, slot) {
  const code = (await hmacHex(secret, stafId + ':' + slot)).slice(0, 10);
  return `${stafId.replace(/-/g, '')}.${slot.toString(36)}.${code}`.toUpperCase();
}
async function validateRotatingPayload(payload) {
  const parts = (payload || '').trim().toUpperCase().split('.');
  if (parts.length !== 3) return { ok: false, reason: 'format' };
  const [idC, slotStr, code] = parts;
  const staf = STAF.find((p) => p.id.replace(/-/g, '').toUpperCase() === idC);
  if (!staf) return { ok: false, reason: 'notfound' };
  const slot = parseInt(slotStr, 36);
  if (!Number.isFinite(slot)) return { ok: false, reason: 'format', staf };
  const diff = currentTimeSlot() - slot;
  const tol = CLOCK_SYNCED ? 1 : 3; // jam belum tersinkron → toleransi lebih longgar
  if (Math.abs(diff) > tol) return { ok: false, reason: 'expired', staf, diff };
  const expected = (await hmacHex(staf.qrToken, staf.id + ':' + slot)).slice(0, 10).toUpperCase();
  if (expected !== code) return { ok: false, reason: 'invalid', staf };
  return { ok: true, staf };
}

// =====================================================================
// SESSION / LOGIN
// =====================================================================
function saveSession(role, data) {
  sessionStorage.setItem('siap_role', role);
  sessionStorage.setItem('siap_session_data', JSON.stringify(data));
}
function clearSession() {
  sessionStorage.removeItem('siap_role');
  sessionStorage.removeItem('siap_session_data');
}
function loadSession() {
  const role = sessionStorage.getItem('siap_role');
  if (!role) return null;
  try {
    return { role, data: JSON.parse(sessionStorage.getItem('siap_session_data') || 'null') };
  } catch {
    return null;
  }
}

function showScreen(which) {
  document.getElementById('loginScreen').style.display = which === 'login' ? 'flex' : 'none';
  document.getElementById('adminApp').style.display = which === 'admin' ? 'flex' : 'none';
  document.getElementById('pegawaiApp').style.display = which === 'pegawai' ? 'flex' : 'none';
}

// --- Login screen: tab switching ---
document.getElementById('tabAdmin').addEventListener('click', () => switchLoginTab('admin'));
document.getElementById('tabPegawai').addEventListener('click', () => switchLoginTab('pegawai'));
function switchLoginTab(which) {
  document.getElementById('tabAdmin').classList.toggle('active', which === 'admin');
  document.getElementById('tabPegawai').classList.toggle('active', which === 'pegawai');
  document.getElementById('loginAdminBox').style.display = which === 'admin' ? 'block' : 'none';
  document.getElementById('loginPegawaiBox').style.display = which === 'pegawai' ? 'block' : 'none';
}

// --- Admin login ---
document.getElementById('btnAdminLogin').addEventListener('click', async () => {
  const username = document.getElementById('adminUsername').value.trim();
  const password = document.getElementById('adminPassword').value;
  const msg = document.getElementById('adminLoginMsg');
  msg.textContent = '';
  if (!username || !password) {
    msg.textContent = 'Isi username dan password.';
    return;
  }
  const btn = document.getElementById('btnAdminLogin');
  btn.disabled = true;
  try {
    const ok = await StafDB.adminLogin(username, password);
    if (ok) {
      ADMIN_USERNAME = username;
      saveSession('admin', { username });
      await bootAdmin();
    } else {
      msg.textContent = 'Username atau password salah.';
    }
  } catch (err) {
    msg.textContent = 'Gagal terhubung: ' + err.message;
  } finally {
    btn.disabled = false;
  }
});

// --- Pegawai login ---
document.getElementById('btnPegawaiLogin').addEventListener('click', async () => {
  const nip = document.getElementById('pegawaiNipLogin').value.trim();
  const pin = document.getElementById('pegawaiPinLogin').value.trim();
  const msg = document.getElementById('pegawaiLoginMsg');
  msg.textContent = '';
  if (!nip || !pin) {
    msg.textContent = 'Isi NIP dan PIN.';
    return;
  }
  const btn = document.getElementById('btnPegawaiLogin');
  btn.disabled = true;
  try {
    const staf = await StafDB.stafLogin(nip, pin);
    if (!staf) {
      msg.textContent = 'NIP atau PIN salah, atau akun belum diaktifkan.';
      return;
    }
    if (!staf.aktif) {
      msg.textContent = 'Akun Anda berstatus tidak aktif. Hubungi Admin.';
      return;
    }
    saveSession('pegawai', staf);
    await bootPegawai(staf);
  } catch (err) {
    msg.textContent = 'Gagal terhubung: ' + err.message;
  } finally {
    btn.disabled = false;
  }
});

// --- Aktivasi akun pegawai ---
document.getElementById('btnKeAktivasi').addEventListener('click', () => {
  document.getElementById('pegawaiLoginStep').style.display = 'none';
  document.getElementById('pegawaiAktivasiStep').style.display = 'block';
  document.getElementById('aktivasiMsg').textContent = '';
  document.getElementById('aktivasiPinBox').style.display = 'none';
});
document.getElementById('btnKeLogin').addEventListener('click', () => {
  document.getElementById('pegawaiAktivasiStep').style.display = 'none';
  document.getElementById('pegawaiLoginStep').style.display = 'block';
});
document.getElementById('btnCekNip').addEventListener('click', async () => {
  const nip = document.getElementById('aktivasiNip').value.trim();
  const msg = document.getElementById('aktivasiMsg');
  msg.textContent = '';
  if (!nip) {
    msg.textContent = 'Isi NIP terlebih dahulu.';
    return;
  }
  try {
    const res = await StafDB.stafCheckNip(nip);
    if (!res.found) {
      msg.textContent = 'NIP tidak ditemukan. Hubungi Admin untuk didaftarkan terlebih dahulu.';
      document.getElementById('aktivasiPinBox').style.display = 'none';
      return;
    }
    if (res.sudahAktif) {
      msg.textContent = `Akun "${res.nama}" sudah aktif. Silakan masuk dengan PIN Anda.`;
      document.getElementById('aktivasiPinBox').style.display = 'none';
      return;
    }
    document.getElementById('aktivasiNamaInfo').textContent = `Halo, ${res.nama}! Buat PIN untuk mengaktifkan akun Anda.`;
    document.getElementById('aktivasiPinBox').style.display = 'block';
  } catch (err) {
    msg.textContent = 'Gagal terhubung: ' + err.message;
  }
});
document.getElementById('btnAktivasiSimpan').addEventListener('click', async () => {
  const nip = document.getElementById('aktivasiNip').value.trim();
  const pin1 = document.getElementById('aktivasiPin1').value.trim();
  const pin2 = document.getElementById('aktivasiPin2').value.trim();
  const msg = document.getElementById('aktivasiMsg');
  if (pin1.length < 4) {
    msg.textContent = 'PIN minimal 4 digit.';
    return;
  }
  if (pin1 !== pin2) {
    msg.textContent = 'Konfirmasi PIN tidak sama.';
    return;
  }
  const btn = document.getElementById('btnAktivasiSimpan');
  btn.disabled = true;
  try {
    const ok = await StafDB.stafActivate(nip, pin1);
    if (ok) {
      msg.className = 'login-msg ok';
      msg.textContent = 'Akun berhasil diaktifkan! Silakan masuk.';
      setTimeout(() => {
        document.getElementById('btnKeLogin').click();
        document.getElementById('pegawaiNipLogin').value = nip;
        document.getElementById('pegawaiPinLogin').focus();
        msg.className = 'login-msg';
      }, 1200);
    } else {
      msg.className = 'login-msg';
      msg.textContent = 'Gagal mengaktifkan. Akun mungkin sudah aktif sebelumnya.';
    }
  } catch (err) {
    msg.textContent = 'Gagal terhubung: ' + err.message;
  } finally {
    btn.disabled = false;
  }
});

// --- Logout ---
document.getElementById('btnLogoutAdmin').addEventListener('click', () => {
  stopScanner();
  clearSession();
  location.reload();
});
document.getElementById('btnLogoutPegawai').addEventListener('click', () => {
  stopRotatingQr();
  clearSession();
  location.reload();
});

// =====================================================================
// ADMIN APP
// =====================================================================
const sidebar = document.getElementById('sidebar');
const sidebarOverlay = document.getElementById('sidebarOverlay');
document.getElementById('btnHamburger').addEventListener('click', () => {
  sidebar.classList.add('open');
  sidebarOverlay.classList.add('show');
});
sidebarOverlay.addEventListener('click', closeSidebar);
function closeSidebar() {
  sidebar.classList.remove('open');
  sidebarOverlay.classList.remove('show');
}

const PAGE_TITLES = { beranda: 'Beranda', absen: 'Absen (Scan QR)', pegawai: 'Data Pegawai', rekap: 'Rekap & Cetak', pengaturan: 'Pengaturan' };
function gotoPage(page) {
  document.querySelectorAll('.nav-item[data-page]').forEach((b) => b.classList.remove('active'));
  const navBtn = document.querySelector(`.nav-item[data-page="${page}"]`);
  if (navBtn) navBtn.classList.add('active');
  document.querySelectorAll('#adminApp .page').forEach((p) => p.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');
  document.getElementById('pageTitle').textContent = PAGE_TITLES[page];
  closeSidebar();
  if (page !== 'absen') {
    stopScanner();
  }
  if (page === 'beranda') renderDashboardStaf();
  if (page === 'pegawai') renderStafTable();
  if (page === 'absen') resetAbsenPage();
  if (page === 'pengaturan') fillPengaturanForm();
}
document.querySelectorAll('.nav-item[data-page]').forEach((btn) => btn.addEventListener('click', () => gotoPage(btn.dataset.page)));
document.querySelectorAll('[data-go]').forEach((btn) => btn.addEventListener('click', () => gotoPage(btn.dataset.go)));

async function checkConnection() {
  const banner = document.getElementById('loginConfigBanner');
  const badge = document.getElementById('connBadge');
  const badgeText = document.getElementById('connBadgeText');
  const dot = document.getElementById('liveDot');
  const connText = document.getElementById('connText');
  const pengInfo = document.getElementById('pengaturanConnInfoStaf');

  const setBanner = (html) => {
    if (banner) {
      banner.style.display = html ? 'block' : 'none';
      banner.innerHTML = html || '';
    }
  };

  if (!StafDB.isConfigured()) {
    setBanner('⚠️ <b>Supabase belum dikonfigurasi.</b> Lengkapi <code>js/config.js</code> lalu muat ulang halaman.');
    if (badge) {
      badge.classList.add('off');
      badgeText.textContent = 'Belum dikonfigurasi';
    }
    if (dot) dot.classList.add('off');
    if (connText) connText.textContent = 'Supabase belum dikonfigurasi';
    if (pengInfo) pengInfo.innerHTML = '⚠️ Supabase belum dikonfigurasi.';
    return false;
  }
  try {
    await StafDB.getOrgSettings();
    setBanner(null);
    if (badge) {
      badge.classList.remove('off');
      badgeText.textContent = 'Terhubung';
    }
    if (dot) dot.classList.remove('off');
    if (connText) connText.textContent = 'Terhubung ke Supabase';
    if (pengInfo) pengInfo.innerHTML = '✅ Terhubung ke database Supabase.';
    return true;
  } catch (err) {
    setBanner('⚠️ <b>Gagal terhubung ke Supabase.</b> Pastikan <code>supabase/schema.sql</code> sudah dijalankan, dan periksa <code>js/config.js</code>. Detail: ' + esc(err.message));
    if (badge) {
      badge.classList.add('off');
      badgeText.textContent = 'Terputus';
    }
    if (dot) dot.classList.add('off');
    if (connText) connText.textContent = 'Gagal terhubung';
    if (pengInfo) pengInfo.innerHTML = '❌ Gagal terhubung: ' + esc(err.message);
    return false;
  }
}

// ---------------- DASHBOARD ----------------
const STATUS_COLOR_STAF = { HADIR: '#1F8A57', IZIN: '#2563A8', SAKIT: '#B8860B', CUTI: '#7A4FB5', TK: '#C0392B', TUGAS_LUAR: '#6b46c1', HADIR_P3K: '#0e7490', CUTI_P3K: '#b45309' };
function statCardsHtmlStaf(c) {
  return STATUS_LIST_STAF.map((s) => `<div class="stat" style="background:${STATUS_COLOR_STAF[s]}1A;"><div class="n" style="color:${STATUS_COLOR_STAF[s]}">${c[s] || 0}</div><div class="l">${STATUS_LABEL_STAF[s]}</div></div>`).join('');
}
function renderDonutStaf(counts, totalDenom) {
  const svg = document.getElementById('donutStaf');
  const r = 15.9155, cx = 18, cy = 18, circumference = 2 * Math.PI * r;
  let offset = 0;
  let circles = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#E4E9F0" stroke-width="4"></circle>`;
  const hadirCount = (counts.HADIR || 0) + (counts.HADIR_P3K || 0);
  const recorded = STATUS_LIST_STAF.reduce((a, s) => a + (counts[s] || 0), 0);
  const belum = Math.max(0, totalDenom - recorded);
  const segments = STATUS_LIST_STAF.map((s) => ({ key: s, val: counts[s] || 0, color: STATUS_COLOR_STAF[s] }));
  if (belum > 0) segments.push({ key: 'BELUM', val: belum, color: '#C9D3DE' });
  segments.forEach((seg) => {
    if (!seg.val || !totalDenom) return;
    const frac = seg.val / totalDenom;
    const len = frac * circumference;
    circles += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${seg.color}" stroke-width="4" stroke-dasharray="${len} ${circumference - len}" stroke-dashoffset="${-offset}"></circle>`;
    offset += len;
  });
  svg.innerHTML = circles;
  const pct = totalDenom ? Math.round((hadirCount / totalDenom) * 100) : 0;
  document.getElementById('donutStafPct').textContent = pct + '%';
  const legendLabels = { ...STATUS_LABEL_STAF, BELUM: 'Belum Absen' };
  const legendColors = { ...STATUS_COLOR_STAF, BELUM: '#9AA7B8' };
  document.getElementById('legendStaf').innerHTML =
    segments
      .filter((s) => s.val > 0)
      .map((s) => `<div class="li"><div class="left"><span class="sw" style="background:${legendColors[s.key]}"></span>${legendLabels[s.key]}</div><b>${s.val}</b></div>`)
      .join('') || '<div class="muted">Belum ada data hari ini.</div>';
}
async function renderDashboardStaf() {
  document.getElementById('dashDateLabelStaf').textContent = '— ' + fmtTgl(todayStr());
  const totalAktif = STAF.filter((p) => p.aktif).length;
  document.getElementById('totalAktifStaf').textContent = totalAktif;
  document.getElementById('dashPagiStaf').innerHTML = '<div class="loading-row"><span class="spinner dark"></span>Memuat...</div>';
  document.getElementById('dashSoreStaf').innerHTML = '<div class="loading-row"><span class="spinner dark"></span>Memuat...</div>';
  try {
    const rows = await StafDB.listKehadiranStaf({ dari: todayStr(), sampai: todayStr() });
    const empty = () => Object.fromEntries(STATUS_LIST_STAF.map((s) => [s, 0]));
    const cPagi = empty(), cSore = empty();
    rows.forEach((k) => {
      const target = k.jenisApel === 'Apel Pagi' ? cPagi : k.jenisApel === 'Apel Sore' ? cSore : null;
      if (target && target[k.status] !== undefined) target[k.status]++;
    });
    document.getElementById('dashPagiStaf').innerHTML = statCardsHtmlStaf(cPagi);
    document.getElementById('dashSoreStaf').innerHTML = statCardsHtmlStaf(cSore);
    renderDonutStaf(cPagi, totalAktif);
  } catch (err) {
    document.getElementById('dashPagiStaf').innerHTML = '<div class="muted">Gagal memuat data.</div>';
    document.getElementById('dashSoreStaf').innerHTML = '<div class="muted">Gagal memuat data.</div>';
  }
}

// ---------------- ABSEN (SCAN QR + TANDAI TIDAK HADIR) ----------------
let SESI_LOG = [];
const absenTanggalEl = document.getElementById('absenTanggal');
const absenJenisApelEl = document.getElementById('absenJenisApel');
absenTanggalEl.value = todayStr();
absenJenisApelEl.value = defaultJenisApel();
absenTanggalEl.addEventListener('change', resetSesi);
absenJenisApelEl.addEventListener('change', resetSesi);

function resetAbsenPage() {
  document.getElementById('scanBox').style.display = 'none';
  document.getElementById('tidakHadirBox').style.display = 'none';
  document.getElementById('absenIdleHint').style.display = 'block';
  resetSesi();
}
function resetSesi() {
  SESI_LOG = [];
  drawSesiLog();
}
function drawSesiLog() {
  const tbody = document.getElementById('sesiLog');
  tbody.innerHTML =
    SESI_LOG.map(
      (e) => `<tr><td>${e.waktu}</td><td>${esc(e.nama)}</td><td><span class="badge" style="background:${STATUS_COLOR_STAF[e.status]}">${STATUS_LABEL_STAF[e.status]}</span></td><td>${e.metode === 'QR' ? '📷 QR' : '✋ Manual'}</td></tr>`
    ).join('') || '<tr><td colspan="4" class="muted">Belum ada catatan pada sesi ini.</td></tr>';
}
function logSesi(nama, status, metode) {
  SESI_LOG.unshift({ waktu: new Date().toLocaleTimeString('id-ID'), nama, status, metode });
  drawSesiLog();
}

// --- Scan QR ---
document.getElementById('btnMulaiScan').addEventListener('click', () => {
  document.getElementById('tidakHadirBox').style.display = 'none';
  document.getElementById('absenIdleHint').style.display = 'none';
  document.getElementById('scanBox').style.display = 'block';
  document.getElementById('scanDebug').textContent = '';
  syncClock(); // samakan jam dengan server (tidak menghalangi kamera)
  startScanner();
});
document.getElementById('btnStopScan').addEventListener('click', () => {
  stopScanner();
  document.getElementById('scanBox').style.display = 'none';
  document.getElementById('absenIdleHint').style.display = 'block';
});

// Area pindai proporsional dengan ukuran video (bukan angka tetap)
function scanQrbox(vw, vh) {
  const size = Math.max(120, Math.floor(Math.min(vw, vh) * 0.78));
  return { width: size, height: size };
}
async function startScanner() {
  const hint = document.getElementById('scanHint');
  hint.textContent = 'Meminta izin kamera...';
  if (typeof Html5Qrcode === 'undefined') {
    hint.textContent = 'Pustaka pemindai QR gagal dimuat. Periksa koneksi internet lalu muat ulang halaman.';
    return;
  }
  await stopScannerAsync();
  const ctorCfg = { verbose: false, experimentalFeatures: { useBarCodeDetectorIfSupported: true } };
  if (typeof Html5QrcodeSupportedFormats !== 'undefined') ctorCfg.formatsToSupport = [Html5QrcodeSupportedFormats.QR_CODE];
  const inst = new Html5Qrcode('qrReader', ctorCfg);
  html5QrCode = inst;
  const cfg = { fps: 12, qrbox: scanQrbox };
  const okMsg = 'Arahkan kamera ke QR di layar HP pegawai (kecerahan layar dinaikkan) — kamera tetap aktif untuk pegawai berikutnya.';
  try {
    await inst.start({ facingMode: 'environment' }, cfg, onScanSuccess, () => {});
    hint.textContent = okMsg;
  } catch (e1) {
    // Laptop/PC umumnya tidak punya kamera "environment" → pakai kamera yang tersedia
    try {
      const cams = await Html5Qrcode.getCameras();
      if (!cams || !cams.length) throw new Error('tidak ada kamera terdeteksi');
      await inst.start(cams[0].id, cfg, onScanSuccess, () => {});
      hint.textContent = okMsg;
    } catch (e2) {
      hint.textContent = 'Gagal mengakses kamera: ' + (e2 && e2.message ? e2.message : e2) + '. Pastikan izin kamera diberikan dan halaman dibuka lewat HTTPS.';
    }
  }
}
function stopScannerAsync() {
  if (!html5QrCode) return Promise.resolve();
  const inst = html5QrCode;
  html5QrCode = null;
  return inst
    .stop()
    .then(() => inst.clear())
    .catch(() => {});
}
function stopScanner() {
  stopScannerAsync();
}
let lastScan = { text: null, time: 0 };
function flashScan(icon, name, sub, isError) {
  const el = document.getElementById('scanFlash');
  el.className = 'scan-flash show' + (isError ? ' err' : '');
  el.innerHTML = `<div class="sf-icon">${icon}</div><div class="sf-name">${esc(name)}</div><div class="sf-sub">${esc(sub)}</div>`;
  clearTimeout(window._flashTimer);
  window._flashTimer = setTimeout(() => el.classList.remove('show'), 1800);
}
function scanDebug(msg) {
  const el = document.getElementById('scanDebug');
  if (el) el.textContent = new Date().toLocaleTimeString('id-ID') + ' — ' + msg;
}
// Ambil data terbaru pegawai (tanda tangan & kunci QR bisa berubah setelah daftar dimuat)
async function refreshStafFromPayload(payload) {
  const idC = (payload || '').trim().toUpperCase().split('.')[0];
  const findLocal = () => STAF.find((p) => p.id.replace(/-/g, '').toUpperCase() === idC);
  let local = findLocal();
  if (!local) {
    // pegawai baru mungkin belum ada di daftar lokal → muat ulang daftar
    try {
      STAF = await StafDB.listStaf();
    } catch (e) {
      /* abaikan */
    }
    local = findLocal();
  }
  if (local) {
    const fresh = await StafDB.getStafById(local.id).catch(() => null);
    if (fresh) Object.assign(local, fresh);
  }
}
async function onScanSuccess(decodedText) {
  const now = Date.now();
  if (decodedText === lastScan.text && now - lastScan.time < 4000) return;
  lastScan = { text: decodedText, time: now };
  scanDebug('QR terbaca, memverifikasi…');
  try {
    await refreshStafFromPayload(decodedText);
    const res = await validateRotatingPayload(decodedText);
    if (!res.ok) {
      const detik = res.diff != null ? Math.abs(res.diff) * 10 : 0;
      const msgs = {
        notfound: 'QR tidak dikenali (pegawai tidak ada di daftar).',
        expired: `QR kedaluwarsa (selisih ±${detik} detik) — minta pegawai membuka ulang tab QR.`,
        invalid: 'Kode QR tidak valid.',
        format: 'Format QR tidak dikenali — pastikan yang dipindai adalah QR dari halaman "QR Saya".',
      };
      scanDebug('DITOLAK: ' + (msgs[res.reason] || res.reason));
      flashScan('⚠️', res.staf ? res.staf.nama : 'QR ditolak', msgs[res.reason] || 'Coba pindai ulang.', true);
      return;
    }
    const staf = res.staf;
    if (!staf.aktif) {
      scanDebug('DITOLAK: pegawai tidak aktif');
      flashScan('🚫', staf.nama, 'Status pegawai tidak aktif.', true);
      return;
    }
    const tanggal = absenTanggalEl.value;
    const jenisApel = absenJenisApelEl.value;
    if (!tanggal) {
      flashScan('⚠️', 'Tanggal kosong', 'Pilih tanggal absen terlebih dahulu.', true);
      return;
    }
    const status = staf.kategori === 'PPPK' ? 'HADIR_P3K' : 'HADIR';
    await StafDB.upsertKehadiranSatu({
      tanggal,
      jenisApel,
      stafId: staf.id,
      status,
      keterangan: '',
      tandaTangan: staf.tandaTangan || null,
      metode: 'QR',
    });
    scanDebug('BERHASIL: ' + staf.nama + ' — ' + STATUS_LABEL_STAF[status]);
    const sub = staf.tandaTangan ? 'Kehadiran tercatat ✓ tanda tangan tersimpan' : 'Kehadiran tercatat — pegawai belum menyimpan tanda tangan';
    flashScan('✅', staf.nama, sub, false);
    logSesi(staf.nama, status, 'QR');
    renderDashboardStaf();
  } catch (err) {
    scanDebug('ERROR: ' + err.message);
    flashScan('⚠️', 'Gagal menyimpan', err.message, true);
  }
}

// --- Tandai Tidak Hadir ---
document.getElementById('btnBukaTidakHadir').addEventListener('click', () => {
  stopScanner();
  document.getElementById('scanBox').style.display = 'none';
  document.getElementById('absenIdleHint').style.display = 'none';
  document.getElementById('tidakHadirBox').style.display = 'block';
  document.getElementById('tidakHadirPicked').style.display = 'none';
  document.getElementById('tidakHadirCloseWrap').style.display = 'flex';
  document.getElementById('tidakHadirSearch').value = '';
  drawTidakHadirList();
});
document.getElementById('btnTutupTidakHadir').addEventListener('click', () => {
  document.getElementById('tidakHadirBox').style.display = 'none';
  document.getElementById('absenIdleHint').style.display = 'block';
});
document.getElementById('tidakHadirSearch').addEventListener('input', drawTidakHadirList);
function drawTidakHadirList() {
  const q = (document.getElementById('tidakHadirSearch').value || '').toLowerCase();
  const list = STAF.filter((p) => p.aktif && (p.nama.toLowerCase().includes(q) || p.nip.includes(q))).sort((a, b) => a.nama.localeCompare(b.nama));
  document.getElementById('tidakHadirList').innerHTML =
    list
      .slice(0, 100)
      .map((p) => `<tr style="cursor:pointer;" onclick="pickTidakHadir('${p.id}')"><td style="width:40px;"><div class="staf-avatar" style="width:32px;height:32px;font-size:12px;">${esc(p.nama[0])}</div></td><td><b>${esc(p.nama)}</b><br><span class="muted">${esc(p.jabatan)}</span></td></tr>`)
      .join('') || '<tr><td class="muted">Tidak ditemukan.</td></tr>';
}
let TH_PICKED = null;
window.pickTidakHadir = (id) => {
  TH_PICKED = STAF.find((p) => p.id === id);
  document.getElementById('tidakHadirPickedCard').innerHTML = `<div class="staf-avatar">${esc(TH_PICKED.nama[0])}</div><div><div class="spc-name">${esc(TH_PICKED.nama)}</div><div class="spc-sub">${esc(TH_PICKED.jabatan)} · Gol. ${esc(TH_PICKED.golongan)} <span class="kat ${TH_PICKED.kategori}">${TH_PICKED.kategori}</span></div></div>`;
  const list = TH_PICKED.kategori === 'PPPK' ? STATUS_TIDAK_HADIR : STATUS_TIDAK_HADIR.filter((s) => s !== 'CUTI_P3K');
  document.getElementById('tidakHadirStatusGrid').innerHTML = list.map((s) => `<button type="button" class="status-big-btn st-${s}" data-status="${s}" onclick="pickTidakHadirStatus('${s}')">${STATUS_LABEL_STAF[s]}</button>`).join('');
  TH_STATUS = null;
  document.getElementById('tidakHadirKeterangan').value = '';
  document.getElementById('tidakHadirBox').querySelector('.table-wrap').style.display = 'none';
  document.getElementById('tidakHadirSearch').parentElement.style.display = 'none';
  document.getElementById('tidakHadirCloseWrap').style.display = 'none';
  document.getElementById('tidakHadirPicked').style.display = 'block';
};
let TH_STATUS = null;
window.pickTidakHadirStatus = (s) => {
  TH_STATUS = s;
  document.querySelectorAll('#tidakHadirStatusGrid .status-big-btn').forEach((b) => b.classList.toggle('picked', b.dataset.status === s));
};
document.getElementById('btnBatalTidakHadir').addEventListener('click', () => {
  document.getElementById('tidakHadirPicked').style.display = 'none';
  document.getElementById('tidakHadirBox').querySelector('.table-wrap').style.display = 'block';
  document.getElementById('tidakHadirSearch').parentElement.style.display = 'block';
  document.getElementById('tidakHadirCloseWrap').style.display = 'flex';
});
document.getElementById('btnSimpanTidakHadir').addEventListener('click', async () => {
  if (!TH_STATUS) {
    alert('Pilih alasan tidak hadir terlebih dahulu.');
    return;
  }
  const btn = document.getElementById('btnSimpanTidakHadir');
  btn.disabled = true;
  try {
    await StafDB.upsertKehadiranSatu({
      tanggal: absenTanggalEl.value,
      jenisApel: absenJenisApelEl.value,
      stafId: TH_PICKED.id,
      status: TH_STATUS,
      keterangan: document.getElementById('tidakHadirKeterangan').value || (TH_STATUS === 'TK' ? '-' : ''),
      tandaTangan: null,
      metode: 'MANUAL',
    });
    logSesi(TH_PICKED.nama, TH_STATUS, 'MANUAL');
    toast(`${TH_PICKED.nama} dicatat sebagai ${STATUS_LABEL_STAF[TH_STATUS]}.`);
    renderDashboardStaf();
    document.getElementById('btnBatalTidakHadir').click();
    document.getElementById('tidakHadirSearch').value = '';
    drawTidakHadirList();
  } catch (err) {
    toast('Gagal menyimpan: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
  }
});

// ---------------- DATA PEGAWAI (Admin) ----------------
function renderStafTable() {
  const q = (document.getElementById('searchStaf').value || '').toLowerCase();
  const kat = document.getElementById('filterKategori').value;
  const tbody = document.getElementById('tabelStaf');
  const rows = STAF.filter((p) => (p.nama.toLowerCase().includes(q) || p.nip.includes(q)) && (!kat || p.kategori === kat)).sort((a, b) => (a.urutan || 9999) - (b.urutan || 9999) || a.nama.localeCompare(b.nama));
  tbody.innerHTML =
    rows
      .map(
        (p, i) => `<tr>
      <td>${i + 1}</td><td>${esc(p.nama)}</td><td>${esc(p.nip)}</td><td>${esc(p.golongan)}</td><td><span class="kat ${p.kategori}">${p.kategori}</span></td><td>${esc(p.jabatan)}</td>
      <td>${p.punyaPin ? '✅ Aktif' : '⏳ Belum aktivasi'}</td>
      <td>${p.tandaTangan ? '✔️' : '—'}</td>
      <td><span class="badge ${p.aktif ? 'aktif' : 'nonaktif'}">${p.aktif ? 'Aktif' : 'Tidak Aktif'}</span></td>
      <td>
        <button class="btn small outline" onclick="editStaf('${p.id}')">Edit</button>
        <button class="btn small ${p.aktif ? 'outline' : 'gold'}" onclick="toggleAktifStaf('${p.id}')">${p.aktif ? 'Nonaktifkan' : 'Aktifkan'}</button>
        <button class="btn small danger" onclick="hapusStaf('${p.id}')">Hapus</button>
      </td></tr>`
      )
      .join('') || '<tr><td colspan="10" class="muted">Tidak ada data.</td></tr>';
}
document.getElementById('searchStaf').addEventListener('input', renderStafTable);
document.getElementById('filterKategori').addEventListener('change', renderStafTable);
document.getElementById('btnTambahStaf').addEventListener('click', () => openModalStaf());
document.getElementById('btnBatalStaf').addEventListener('click', () => document.getElementById('modalStaf').classList.add('hidden'));

function openModalStaf(p) {
  document.getElementById('modalStafTitle').textContent = p ? 'Edit Pegawai' : 'Tambah Pegawai';
  document.getElementById('stafId').value = p ? p.id : '';
  document.getElementById('stafNama').value = p ? p.nama : '';
  document.getElementById('stafNip').value = p ? p.nip : '';
  document.getElementById('stafGolongan').value = p ? p.golongan : '';
  document.getElementById('stafKategori').value = p ? p.kategori : 'PNS';
  document.getElementById('stafJabatan').value = p ? p.jabatan : '';
  document.getElementById('stafAktif').value = p ? (p.aktif ? '1' : '0') : '1';
  document.getElementById('btnResetPinModal').style.display = p ? 'inline-flex' : 'none';
  document.getElementById('modalStaf').classList.remove('hidden');
}
window.editStaf = (id) => openModalStaf(STAF.find((p) => p.id === id));
window.toggleAktifStaf = async (id) => {
  const p = STAF.find((x) => x.id === id);
  const next = !p.aktif;
  try {
    await StafDB.setAktifStaf(id, next);
    p.aktif = next;
    renderStafTable();
    toast('Status pegawai diperbarui.');
  } catch (err) {
    toast('Gagal: ' + err.message, 'error');
  }
};
window.hapusStaf = async (id) => {
  if (!confirm('Hapus pegawai ini? Seluruh riwayat kehadiran & tanda tangannya akan ikut terhapus permanen.')) return;
  try {
    await StafDB.deleteStaf(id);
    STAF = STAF.filter((p) => p.id !== id);
    renderStafTable();
    toast('Pegawai dihapus.');
  } catch (err) {
    toast('Gagal menghapus: ' + err.message, 'error');
  }
};
document.getElementById('btnResetPinModal').addEventListener('click', async () => {
  const id = document.getElementById('stafId').value;
  if (!id) return;
  if (!confirm('Reset PIN pegawai ini? Pegawai perlu aktivasi ulang dengan PIN baru.')) return;
  try {
    await StafDB.adminResetPin(id);
    const idx = STAF.findIndex((x) => x.id === id);
    if (idx >= 0) STAF[idx].punyaPin = false;
    renderStafTable();
    toast('PIN pegawai berhasil direset.');
  } catch (err) {
    toast('Gagal: ' + err.message, 'error');
  }
});
document.getElementById('btnSimpanStaf').addEventListener('click', async () => {
  const id = document.getElementById('stafId').value;
  const nama = document.getElementById('stafNama').value.trim();
  const nip = document.getElementById('stafNip').value.trim();
  const golongan = document.getElementById('stafGolongan').value.trim() || '-';
  const kategori = document.getElementById('stafKategori').value;
  const jabatan = document.getElementById('stafJabatan').value.trim();
  if (!nama || !nip || !jabatan) {
    alert('Nama, NIP, dan Jabatan wajib diisi.');
    return;
  }
  const aktif = document.getElementById('stafAktif').value === '1';
  const btn = document.getElementById('btnSimpanStaf');
  btn.disabled = true;
  try {
    if (id) {
      const existing = STAF.find((x) => x.id === id);
      const updated = await StafDB.updateStaf(id, { nama, nip, golongan, kategori, jabatan, aktif, urutan: existing ? existing.urutan : 9999 });
      const idx = STAF.findIndex((x) => x.id === id);
      STAF[idx] = { ...STAF[idx], ...updated };
    } else {
      const urutan = STAF.reduce((max, x) => Math.max(max, x.urutan || 0), 0) + 1;
      const created = await StafDB.insertStaf({ nama, nip, golongan, kategori, jabatan, aktif, urutan });
      STAF.push(created);
    }
    document.getElementById('modalStaf').classList.add('hidden');
    renderStafTable();
    toast('Data pegawai tersimpan.');
  } catch (err) {
    toast('Gagal menyimpan: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
  }
});

// ---------------- REKAP & CETAK (Admin) ----------------
const rekapTglSatuStaf = document.getElementById('rekapTglSatuStaf');
rekapTglSatuStaf.value = todayStr();
document.getElementById('rekapJenisApelStaf').value = defaultJenisApel();
const rekapDariStaf = document.getElementById('rekapDariStaf'),
  rekapSampaiStaf = document.getElementById('rekapSampaiStaf');
{
  const d = new Date();
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  rekapDariStaf.value = monday.toISOString().slice(0, 10);
  rekapSampaiStaf.value = todayStr();
}
document.getElementById('rekapModeStaf').addEventListener('change', (e) => {
  const isRange = e.target.value === 'range';
  document.getElementById('rekapTglSatuWrapStaf').style.display = isRange ? 'none' : 'block';
  document.getElementById('rekapDariWrapStaf').style.display = isRange ? 'block' : 'none';
  document.getElementById('rekapSampaiWrapStaf').style.display = isRange ? 'block' : 'none';
  document.getElementById('btnCetakDaftarHadir').textContent = isRange ? '🖨️ Cetak Rekap' : '🖨️ Cetak Daftar Hadir';
});
async function getRekapDataStaf() {
  const mode = document.getElementById('rekapModeStaf').value;
  const jenisApel = document.getElementById('rekapJenisApelStaf').value;
  let dari, sampai;
  if (mode === 'harian') {
    dari = sampai = rekapTglSatuStaf.value;
  } else {
    dari = rekapDariStaf.value;
    sampai = rekapSampaiStaf.value;
  }
  if (!dari || !sampai) {
    alert('Tanggal belum lengkap.');
    return null;
  }
  const raw = await StafDB.listKehadiranStaf({ dari, sampai, jenisApel: jenisApel || undefined });
  const rows = raw
    .map((k) => ({ ...k, staf: STAF.find((p) => p.id === k.stafId) }))
    .filter((k) => k.staf)
    .map((k) => {
      const hadirFisik = k.status === 'HADIR' || k.status === 'HADIR_P3K';
      return { ...k, tandaTangan: k.tandaTangan || (hadirFisik ? k.staf.tandaTangan : null) || null };
    });
  return { mode, dari, sampai, jenisApel, rows };
}
function renderRekapHarianStaf(data) {
  const rows = data.rows.slice().sort((a, b) => (a.staf.urutan || 9999) - (b.staf.urutan || 9999) || a.staf.nama.localeCompare(b.staf.nama));
  const body =
    rows
      .map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.staf.nama)}</td><td>${esc(r.staf.golongan)}</td><td>${esc(r.staf.jabatan)}</td><td><span class="badge" style="background:${STATUS_COLOR_STAF[r.status]}">${STATUS_LABEL_STAF[r.status]}</span></td><td>${r.tandaTangan ? '✔️ Ada' : '—'}</td></tr>`)
      .join('') || '<tr><td colspan="6" class="muted">Tidak ada data pada periode ini.</td></tr>';
  const c = Object.fromEntries(STATUS_LIST_STAF.map((s) => [s, 0]));
  rows.forEach((r) => c[r.status]++);
  return `<div class="table-wrap"><table><thead><tr><th>No</th><th>Nama</th><th>Gol</th><th>Jabatan</th><th>Status</th><th>Tanda Tangan</th></tr></thead><tbody>${body}</tbody></table></div>
  <div class="grid-cards" style="margin-top:14px;">${statCardsHtmlStaf(c)}</div>`;
}
function renderRekapRangeStaf(data) {
  const byStaf = {};
  data.rows.forEach((r) => {
    if (!byStaf[r.stafId]) byStaf[r.stafId] = { staf: r.staf, ...Object.fromEntries(STATUS_LIST_STAF.map((s) => [s, 0])) };
    byStaf[r.stafId][r.status]++;
  });
  const arr = Object.values(byStaf).sort((a, b) => (a.staf.urutan || 9999) - (b.staf.urutan || 9999) || a.staf.nama.localeCompare(b.staf.nama));
  const head = STATUS_LIST_STAF.map((s) => `<th>${STATUS_LABEL_STAF[s]}</th>`).join('');
  const body = arr.map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.staf.nama)}</td>${STATUS_LIST_STAF.map((s) => `<td>${r[s]}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${2 + STATUS_LIST_STAF.length}" class="muted">Tidak ada data.</td></tr>`;
  const tot = Object.fromEntries(STATUS_LIST_STAF.map((s) => [s, 0]));
  data.rows.forEach((r) => tot[r.status]++);
  return `<div class="table-wrap"><table><thead><tr><th>No</th><th>Nama</th>${head}</tr></thead><tbody>${body}</tbody></table></div>
  <div class="grid-cards" style="margin-top:14px;">${statCardsHtmlStaf(tot)}</div>`;
}
let lastRekapStaf = null;
document.getElementById('btnTampilkanRekapStaf').addEventListener('click', async () => {
  const btn = document.getElementById('btnTampilkanRekapStaf');
  btn.disabled = true;
  document.getElementById('rekapHasilStaf').innerHTML = '<div class="loading-row"><span class="spinner dark"></span>Memuat rekap...</div>';
  try {
    const data = await getRekapDataStaf();
    if (!data) return;
    lastRekapStaf = data;
    document.getElementById('rekapHasilStaf').innerHTML = data.mode === 'harian' ? renderRekapHarianStaf(data) : renderRekapRangeStaf(data);
  } catch (err) {
    document.getElementById('rekapHasilStaf').innerHTML = '<div class="muted">Gagal memuat rekap: ' + esc(err.message) + '</div>';
  } finally {
    btn.disabled = false;
  }
});

// ---------------- CETAK ----------------
function doPrint(html, landscape, printTitle) {
  const area = document.getElementById('printArea');
  area.innerHTML = html;
  area.classList.toggle('landscape', !!landscape);
  // Judul tab browser dipakai sebagian browser sebagai teks header cetak
  // bawaan (bukan bagian dari halaman ini, jadi tidak bisa dimatikan lewat
  // CSS) — diganti sementara agar lebih rapi bila header itu tetap tampil.
  const originalTitle = document.title;
  if (printTitle) document.title = printTitle;
  window.print();
  if (printTitle) setTimeout(() => (document.title = originalTitle), 500);
}
function letterheadKop() {
  return `<div class="print-kop">
    <img src="${LOGO_SULTRA}" alt="Logo Sulawesi Tenggara">
    <div class="kop-text"><h3>PEMERINTAH PROVINSI SULAWESI TENGGARA</h3><h4>SEKRETARIAT DAERAH</h4><div class="kop-addr">${esc(ORG_SETTINGS.namaBiro)}</div></div>
  </div>`;
}
function buildDaftarHadirHtml({ tanggal, jenisApel, rows }) {
  const sorted = rows.slice().sort((a, b) => (a.staf.urutan || 9999) - (b.staf.urutan || 9999) || a.staf.nama.localeCompare(b.staf.nama));
  let no = 0;
  const body = sorted
    .map((r) => {
      no++;
      let ttd;
      if (r.tandaTangan) {
        ttd = `<img src="${r.tandaTangan}">`;
      } else if (r.status && r.status !== 'HADIR' && r.status !== 'HADIR_P3K') {
        const ket = (r.keterangan || '').trim();
        ttd = `<i>${esc(STATUS_LABEL_STAF[r.status])}${ket && ket !== '-' ? ' — ' + esc(ket) : ''}</i>`;
      } else {
        ttd = `<span class="dotline">&nbsp;</span>`;
      }
      return `<tr><td class="dh-no">${no}</td><td class="dh-nama"><span class="n1">${esc(r.staf.nama)}</span><span class="n2">${esc(r.staf.nip)}</span></td><td class="dh-gol">${esc(r.staf.golongan)}</td><td class="dh-jabatan">${esc(r.staf.jabatan)}</td><td class="dh-ttd">${ttd}</td></tr>`;
    })
    .join('');
  const table = `<table class="dh-table"><colgroup><col style="width:5%"><col style="width:24%"><col style="width:8%"><col style="width:28%"><col style="width:35%"></colgroup>
    <thead><tr><th>No</th><th>Nama Pegawai</th><th>Gol</th><th>Jabatan</th><th>Tanda Tangan / Keterangan</th></tr></thead>
    <tbody>${body}</tbody></table>`;
  const c = Object.fromEntries(STATUS_LIST_STAF.map((s) => [s, 0]));
  rows.forEach((r) => {
    if (r.status && c[r.status] !== undefined) c[r.status]++;
  });
  const catatan = `<div class="dh-catatan">
    <div class="col"><b>CATATAN:</b>
      <div>1. Hadir = ${c.HADIR} Orang</div>
      <div>2. Ijin = ${c.IZIN} Orang</div>
      <div>3. Sakit = ${c.SAKIT} Orang</div>
      <div>4. Cuti = ${c.CUTI} Orang</div>
    </div>
    <div class="col"><b>&nbsp;</b>
      <div>5. Tanpa Keterangan = ${c.TK} Orang</div>
      <div>6. Tugas Luar = ${c.TUGAS_LUAR} Orang</div>
      <div>7. Hadir P3K = ${c.HADIR_P3K} Orang</div>
      <div>8. Cuti P3K = ${c.CUTI_P3K} Orang</div>
    </div>
  </div>`;
  const sign = `<div class="dh-ttd-block">
    <div class="jabatan-ttd">KEPALA ${esc(ORG_SETTINGS.namaBiro).toUpperCase()}<br>SETDA PROVINSI SULAWESI TENGGARA</div>
    <div class="dh-ttd-space"></div>
    <div class="nama-ttd">${esc(ORG_SETTINGS.kepalaNama) || '..............................................'}</div>
    <div>${esc(ORG_SETTINGS.kepalaPangkat) || ''}</div>
    <div>NIP. ${esc(ORG_SETTINGS.kepalaNip) || '..............................................'}</div>
  </div>`;
  return `${letterheadKop()}
    <div class="dh-title">DAFTAR HADIR PNS, CPNS DAN PPPK</div><div class="dh-sub">${esc(ORG_SETTINGS.namaBiro).toUpperCase()} SETDA PROV. SULTRA</div>
    <div class="dh-meta-row"><span>HARI/TANGGAL : ${fmtTgl(tanggal)}</span><span>APEL : ${jenisApel === 'Apel Pagi' ? 'PAGI' : 'SORE'}</span></div>
    ${table}${catatan}${sign}`;
}
document.getElementById('btnCetakDaftarHadir').addEventListener('click', async () => {
  const mode = document.getElementById('rekapModeStaf').value;
  if (mode === 'harian') {
    const jenisApel = document.getElementById('rekapJenisApelStaf').value;
    if (!jenisApel) {
      alert('Pilih jenis Apel (Pagi/Sore) untuk mencetak Daftar Hadir.');
      return;
    }
    const tanggal = rekapTglSatuStaf.value;
    try {
      const raw = await StafDB.listKehadiranStaf({ dari: tanggal, sampai: tanggal, jenisApel });
      const rows = STAF.filter((p) => p.aktif).map((p) => {
        const k = raw.find((x) => x.stafId === p.id);
        const status = k ? k.status : null;
        const hadirFisik = status === 'HADIR' || status === 'HADIR_P3K';
        // Utamakan tanda tangan yang tersimpan di catatan kehadiran (snapshot saat
        // scan). Bila kosong tapi statusnya Hadir — misalnya pegawai baru menyimpan
        // tanda tangan SETELAH di-scan hari itu — pakai tanda tangan profil terkini
        // sebagai cadangan, supaya tetap tampil di cetakan.
        const tandaTangan = (k && k.tandaTangan) || (hadirFisik ? p.tandaTangan : null) || null;
        return { staf: p, status, tandaTangan, keterangan: k ? k.keterangan : '' };
      });
      doPrint(buildDaftarHadirHtml({ tanggal, jenisApel, rows }), false, `Daftar Hadir ${jenisApel} ${tanggal}`);
    } catch (err) {
      toast('Gagal menyiapkan cetak: ' + err.message, 'error');
    }
  } else {
    if (!lastRekapStaf) {
      alert('Klik "Tampilkan" terlebih dahulu.');
      return;
    }
    const arr = {};
    lastRekapStaf.rows.forEach((r) => {
      if (!arr[r.stafId]) arr[r.stafId] = { staf: r.staf, ...Object.fromEntries(STATUS_LIST_STAF.map((s) => [s, 0])) };
      arr[r.stafId][r.status]++;
    });
    const list = Object.values(arr).sort((a, b) => (a.staf.urutan || 9999) - (b.staf.urutan || 9999) || a.staf.nama.localeCompare(b.staf.nama));
    const head = STATUS_LIST_STAF.map((s) => `<th>${STATUS_LABEL_STAF[s]}</th>`).join('');
    const body = list.map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.staf.nama)}</td>${STATUS_LIST_STAF.map((s) => `<td class="num">${r[s]}</td>`).join('')}</tr>`).join('');
    const table = `<div class="print-table-wrap"><table class="print-table"><thead><tr><th class="num">No</th><th>Nama</th>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
    const sub = `Periode: ${lastRekapStaf.dari} s.d. ${lastRekapStaf.sampai}`;
    const titleBlock = `${letterheadKop()}<div class="dh-title">REKAPITULASI KEHADIRAN PEGAWAI</div><div class="dh-sub">${esc(ORG_SETTINGS.namaBiro).toUpperCase()} SETDA PROV. SULTRA</div><div class="dh-meta-row"><span>${esc(sub)}</span><span></span></div>`;
    doPrint(titleBlock + table, true, `Rekap Kehadiran ${lastRekapStaf.dari} s.d. ${lastRekapStaf.sampai}`);
  }
});

// ---------------- PENGATURAN (Admin) ----------------
function fillPengaturanForm() {
  document.getElementById('kbNama').value = ORG_SETTINGS.kepalaNama || '';
  document.getElementById('kbPangkat').value = ORG_SETTINGS.kepalaPangkat || '';
  document.getElementById('kbNip').value = ORG_SETTINGS.kepalaNip || '';
}
document.getElementById('btnSimpanKepalaBiro').addEventListener('click', async () => {
  const kepalaNama = document.getElementById('kbNama').value.trim();
  const kepalaPangkat = document.getElementById('kbPangkat').value.trim();
  const kepalaNip = document.getElementById('kbNip').value.trim();
  try {
    await StafDB.updateOrgSettings({ namaBiro: ORG_SETTINGS.namaBiro, kepalaNama, kepalaPangkat, kepalaNip });
    ORG_SETTINGS = { ...ORG_SETTINGS, kepalaNama, kepalaPangkat, kepalaNip };
    toast('Identitas Kepala Biro tersimpan.');
  } catch (err) {
    toast('Gagal menyimpan: ' + err.message, 'error');
  }
});
document.getElementById('btnGantiPwAdmin').addEventListener('click', async () => {
  const oldPw = document.getElementById('oldAdminPw').value;
  const newPw = document.getElementById('newAdminPw').value;
  if (!oldPw || !newPw || newPw.length < 4) {
    alert('Isi password lama dan password baru (minimal 4 karakter).');
    return;
  }
  try {
    const ok = await StafDB.adminSetPassword(ADMIN_USERNAME, oldPw, newPw);
    if (ok) {
      toast('Password admin berhasil diganti.');
      document.getElementById('oldAdminPw').value = '';
      document.getElementById('newAdminPw').value = '';
    } else {
      toast('Password lama salah.', 'error');
    }
  } catch (err) {
    toast('Gagal: ' + err.message, 'error');
  }
});
document.getElementById('btnBackupStaf').addEventListener('click', async () => {
  try {
    const data = await StafDB.exportAllStaf();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'backup_pegawai_' + todayStr() + '.json';
    a.click();
    toast('Backup data berhasil diunduh.');
  } catch (err) {
    toast('Gagal membuat backup: ' + err.message, 'error');
  }
});

// ---------------- REALTIME (Admin) ----------------
function setupRealtime() {
  if (!StafDB.isConfigured()) return;
  try {
    StafDB.subscribeChangesStaf(() => {
      const activePage = document.querySelector('#adminApp .nav-item.active')?.dataset.page;
      if (activePage === 'beranda') renderDashboardStaf();
    });
  } catch (err) {
    console.warn('Realtime tidak aktif:', err.message);
  }
}

// ---------------- BOOT ADMIN ----------------
async function bootAdmin() {
  showScreen('admin');
  document.getElementById('todayLabel').textContent = fmtTgl(todayStr());
  const ok = await checkConnection();
  if (!ok) return;
  syncClock();
  try {
    ORG_SETTINGS = await StafDB.getOrgSettings();
    STAF = await StafDB.listStaf();
    await renderDashboardStaf();
    setupRealtime();
  } catch (err) {
    toast('Gagal memuat data awal: ' + err.message, 'error');
  }
}

// =====================================================================
// PEGAWAI APP
// =====================================================================
document.querySelectorAll('.pg-tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.pg-tab').forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    document.querySelectorAll('.pg-panel').forEach((p) => p.classList.remove('active'));
    document.getElementById('pg-' + tab.dataset.tab).classList.add('active');
    if (tab.dataset.tab === 'qr') startRotatingQr();
    else stopRotatingQr();
    if (tab.dataset.tab === 'ttd') initSignaturePadPegawai();
  });
});

// Tanda tangan HARUS dibuat/di-resize setelah panelnya benar-benar terlihat
// (display:block), karena ukuran canvas dihitung dari ukuran nyata di layar.
// Membuatnya saat panel masih tersembunyi menghasilkan canvas berukuran 0x0
// sehingga coretan tidak pernah muncul.
function initSignaturePadPegawai() {
  const canvas = document.getElementById('sigCanvasPegawai');
  if (sigPadPegawai) sigPadPegawai.destroy();
  sigPadPegawai = createSignaturePad(canvas);
  const ph = document.getElementById('sigPlaceholderPegawai');
  ph.style.display = 'flex';
  canvas.addEventListener(
    'pointerdown',
    () => {
      ph.style.display = 'none';
    },
    { once: true }
  );
}

function fillProfilPegawai(staf) {
  document.getElementById('pgNama').value = staf.nama;
  document.getElementById('pgNip').value = staf.nip;
  document.getElementById('pgGolongan').value = staf.golongan;
  document.getElementById('pgKategori').value = staf.kategori;
  document.getElementById('pgJabatan').value = staf.jabatan;
  const box = document.getElementById('ttdPreviewBox');
  if (staf.tandaTangan) {
    document.getElementById('ttdPreviewImg').src = staf.tandaTangan;
    box.style.display = 'block';
  } else {
    box.style.display = 'none';
  }
}
document.getElementById('btnSimpanProfilPegawai').addEventListener('click', async () => {
  const golongan = document.getElementById('pgGolongan').value.trim() || '-';
  const kategori = document.getElementById('pgKategori').value;
  const jabatan = document.getElementById('pgJabatan').value.trim();
  if (!jabatan) {
    alert('Jabatan wajib diisi.');
    return;
  }
  try {
    const updated = await StafDB.updateStafProfileSelf(PEGAWAI_SESSION.id, { golongan, kategori, jabatan });
    PEGAWAI_SESSION = { ...PEGAWAI_SESSION, ...updated };
    saveSession('pegawai', PEGAWAI_SESSION);
    toast('Profil berhasil disimpan.');
  } catch (err) {
    toast('Gagal menyimpan: ' + err.message, 'error');
  }
});
document.getElementById('btnGantiPinPegawai').addEventListener('click', async () => {
  const pinLama = document.getElementById('pgPinLama').value.trim();
  const pinBaru = document.getElementById('pgPinBaru').value.trim();
  if (pinBaru.length < 4) {
    alert('PIN baru minimal 4 digit.');
    return;
  }
  try {
    const ok = await StafDB.stafSetPin(PEGAWAI_SESSION.nip, pinLama, pinBaru);
    if (ok) {
      toast('PIN berhasil diganti.');
      document.getElementById('pgPinLama').value = '';
      document.getElementById('pgPinBaru').value = '';
    } else {
      toast('PIN lama salah.', 'error');
    }
  } catch (err) {
    toast('Gagal: ' + err.message, 'error');
  }
});

// --- Tanda tangan pegawai ---
document.getElementById('btnClearSigPegawai').addEventListener('click', () => {
  if (sigPadPegawai) sigPadPegawai.clear();
  document.getElementById('sigPlaceholderPegawai').style.display = 'flex';
});
document.getElementById('btnSimpanTtd').addEventListener('click', async () => {
  if (!sigPadPegawai || sigPadPegawai.isEmpty()) {
    alert('Silakan tanda tangan terlebih dahulu.');
    return;
  }
  const dataUrl = sigPadPegawai.toDataURL();
  try {
    const updated = await StafDB.saveStafSignature(PEGAWAI_SESSION.id, dataUrl);
    PEGAWAI_SESSION = { ...PEGAWAI_SESSION, ...updated };
    saveSession('pegawai', PEGAWAI_SESSION);
    document.getElementById('ttdPreviewImg').src = dataUrl;
    document.getElementById('ttdPreviewBox').style.display = 'block';
    toast('Tanda tangan berhasil disimpan.');
  } catch (err) {
    toast('Gagal menyimpan: ' + err.message, 'error');
  }
});

// --- QR Saya (rotating) ---
let lastDrawnSlot = null;
async function drawRotatingQr() {
  if (!PEGAWAI_SESSION) return;
  const c = document.getElementById('rotatingQrCanvas');
  if (!window.QRCode) {
    stopRotatingQr();
    const label = document.getElementById('qrCountdownLabel');
    if (label) label.textContent = 'Pustaka QR gagal dimuat — periksa koneksi internet lalu muat ulang halaman.';
    return;
  }
  const slot = currentTimeSlot();
  lastDrawnSlot = slot; // tandai lebih dulu agar tidak tergambar ganda
  const payload = await computeRotatingPayload(PEGAWAI_SESSION.id, PEGAWAI_SESSION.qrToken, slot);
  // Margin (quiet zone) 4 modul + koreksi kesalahan M = mudah dibaca kamera dari layar HP
  QRCode.toCanvas(c, payload, { width: 260, margin: 4, errorCorrectionLevel: 'M', color: { dark: '#0F2A47', light: '#FFFFFF' } }, () => {});
}
function startRotatingQr() {
  stopRotatingQr();
  lastDrawnSlot = null;
  drawRotatingQr();
  // Samakan jam dengan server lalu gambar ulang bila slot berubah karenanya
  syncClock().then(() => {
    if (qrRotateInterval && currentTimeSlot() !== lastDrawnSlot) drawRotatingQr();
  });
  const circleLen = 100.5;
  qrRotateInterval = setInterval(() => {
    const msIntoSlot = nowMs() % 10000;
    const remaining = Math.ceil((10000 - msIntoSlot) / 1000);
    const label = document.getElementById('qrCountdownLabel');
    if (label) label.textContent = remaining;
    const circle = document.getElementById('qrTimerCircle');
    if (circle) {
      const frac = (10000 - msIntoSlot) / 10000;
      circle.style.strokeDashoffset = (circleLen * (1 - frac)).toFixed(1);
    }
    // Gambar ulang setiap slot berganti (tidak bergantung pada ketepatan timer,
    // karena browser HP sering memperlambat timer)
    if (currentTimeSlot() !== lastDrawnSlot) drawRotatingQr();
  }, 250);
}
function stopRotatingQr() {
  if (qrRotateInterval) clearInterval(qrRotateInterval);
  qrRotateInterval = null;
}
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && qrRotateInterval && currentTimeSlot() !== lastDrawnSlot) drawRotatingQr();
});

async function bootPegawai(staf) {
  PEGAWAI_SESSION = staf;
  showScreen('pegawai');
  fillProfilPegawai(staf);
  // Akun yang berhasil login lewat form (bukan baru aktivasi) berarti sudah
  // aktif sebelumnya — langsung tampilkan QR supaya pegawai bisa langsung
  // menunjukkannya ke kamera Admin tanpa perlu tap tab lagi.
  document.querySelectorAll('.pg-tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === 'qr'));
  document.querySelectorAll('.pg-panel').forEach((p) => p.classList.toggle('active', p.id === 'pg-qr'));
  startRotatingQr();
  // Signature pad sengaja TIDAK dibuat di sini — baru dibuat saat tab
  // "Tanda Tangan" benar-benar dibuka (lihat initSignaturePadPegawai),
  // supaya ukuran canvas terhitung dengan benar.
}

// ---------------- PWA SERVICE WORKER ----------------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

// ---------------- INIT ----------------
async function init() {
  updateOnlineStatus();
  if (!StafDB.isConfigured()) {
    document.getElementById('loginConfigBanner').style.display = 'block';
    document.getElementById('loginConfigBanner').innerHTML = '⚠️ <b>Supabase belum dikonfigurasi.</b> Lengkapi <code>js/config.js</code> lalu muat ulang halaman.';
  }
  const session = loadSession();
  if (session && session.role === 'admin' && session.data) {
    ADMIN_USERNAME = session.data.username;
    await bootAdmin();
    return;
  }
  if (session && session.role === 'pegawai' && session.data) {
    try {
      // Muat ulang profil terbaru dari server (jaga-jaga bila diubah admin)
      const fresh = await StafDB.getStafById(session.data.id).catch(() => null);
      await bootPegawai(fresh || session.data);
      return;
    } catch (err) {
      console.warn(err);
    }
  }
  showScreen('login');
}
init();
