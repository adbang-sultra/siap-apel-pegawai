// =====================================================================
// SIAP APEL — Logika Aplikasi Versi Pegawai
// =====================================================================

const LOGO_SULTRA = 'assets/logo.png';
let BIRO_LIST = [];
let BIRO_FULL = [];
let STAF = [];
let sigPad = null;
let html5QrCode = null;

const todayStr = () => new Date().toISOString().slice(0, 10);
const fmtTgl = (iso) => {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
};
function biroIndex(b) {
  const i = BIRO_LIST.indexOf(b);
  return i < 0 ? 999 : i;
}
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
document.getElementById('todayLabel').textContent = fmtTgl(todayStr());

// ---------------- OFFLINE BANNER ----------------
function updateOnlineStatus() {
  document.getElementById('offlineBanner').classList.toggle('show', !navigator.onLine);
}
window.addEventListener('online', updateOnlineStatus);
window.addEventListener('offline', updateOnlineStatus);
updateOnlineStatus();

// ---------------- CONNECTION STATUS ----------------
async function checkConnection() {
  const banner = document.getElementById('configBanner');
  const badge = document.getElementById('connBadge');
  const badgeText = document.getElementById('connBadgeText');
  const dot = document.getElementById('liveDot');
  const connText = document.getElementById('connText');
  const pengInfo = document.getElementById('pengaturanConnInfoStaf');

  if (!StafDB.isConfigured()) {
    banner.style.display = 'block';
    badge.classList.add('off');
    badgeText.textContent = 'Belum dikonfigurasi';
    dot.classList.add('off');
    connText.textContent = 'Supabase belum dikonfigurasi';
    pengInfo.innerHTML = '⚠️ Aplikasi belum terhubung ke Supabase. Lengkapi <code>js/config.js</code> lalu muat ulang halaman.';
    return false;
  }
  try {
    await StafDB.listBiroFull();
    banner.style.display = 'none';
    badge.classList.remove('off');
    badgeText.textContent = 'Terhubung';
    dot.classList.remove('off');
    connText.textContent = 'Terhubung ke Supabase';
    pengInfo.innerHTML = '✅ Terhubung ke database Supabase.';
    return true;
  } catch (err) {
    banner.style.display = 'block';
    banner.innerHTML =
      '⚠️ <b>Gagal terhubung ke Supabase.</b> Pastikan <code>supabase/schema.sql</code> sudah dijalankan di SQL Editor Supabase, dan periksa <code>js/config.js</code>. Detail: ' + esc(err.message);
    badge.classList.add('off');
    badgeText.textContent = 'Terputus';
    dot.classList.add('off');
    connText.textContent = 'Gagal terhubung';
    pengInfo.innerHTML = '❌ Gagal terhubung: ' + esc(err.message);
    return false;
  }
}

// ---------------- SIDEBAR (mobile) ----------------
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

// ---------------- NAVIGATION ----------------
const PAGE_TITLES = { beranda: 'Beranda', absen: 'Absen Kehadiran', qr: 'Kartu QR Pegawai', pegawai: 'Data Pegawai', rekap: 'Rekap & Cetak', pengaturan: 'Pengaturan' };
function gotoPage(page) {
  document.querySelectorAll('.nav-item').forEach((b) => b.classList.remove('active'));
  const navBtn = document.querySelector(`.nav-item[data-page="${page}"]`);
  if (navBtn) navBtn.classList.add('active');
  document.querySelectorAll('.page').forEach((p) => p.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');
  document.getElementById('pageTitle').textContent = PAGE_TITLES[page];
  closeSidebar();
  if (page === 'beranda') renderDashboardStaf();
  if (page === 'pegawai') renderStafTable();
  if (page === 'qr') renderQrGrid();
  if (page === 'absen') resetAbsenFlow();
  if (page === 'pengaturan') fillKepalaBiroForm();
  if (page !== 'absen') stopScanner();
}
document.querySelectorAll('.nav-item[data-page]').forEach((btn) => {
  btn.addEventListener('click', () => gotoPage(btn.dataset.page));
});
document.querySelectorAll('[data-go]').forEach((btn) => {
  btn.addEventListener('click', () => gotoPage(btn.dataset.go));
});

// ---------------- BIRO DROPDOWNS ----------------
function fillBiroDropdowns() {
  const opts = BIRO_LIST.map((b) => `<option value="${esc(b)}">${esc(b)}</option>`).join('');
  document.getElementById('filterBiroStaf').innerHTML = '<option value="">Semua Biro</option>' + opts;
  document.getElementById('rekapBiroStaf').innerHTML = '<option value="">Semua Biro</option>' + opts;
  document.getElementById('qrFilterBiro').innerHTML = '<option value="">Semua Biro</option>' + opts;
  document.getElementById('stafBiro').innerHTML = opts;
  document.getElementById('kbBiro').innerHTML = opts;
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

// ---------------- ABSEN FLOW ----------------
let AB = { tanggal: null, jenisApel: null, metode: null, staf: null, status: null };

function resetAbsenFlow() {
  document.getElementById('absenTanggal').value = todayStr();
  document.getElementById('absenJenisApel').value = defaultJenisApel();
  AB = { tanggal: null, jenisApel: null, metode: null, staf: null, status: null };
  showAbsenStep(1);
}
function showAbsenStep(target) {
  const map = { 1: 'absenStep1', 2: 'absenStep2', scan: 'absenScanBox', manual: 'absenManualBox', 34: 'absenStep34', success: 'absenSuccessBox' };
  Object.values(map).forEach((id) => (document.getElementById(id).style.display = 'none'));
  document.getElementById(map[target]).style.display = 'block';
  if (target !== 'scan') stopScanner();
  const stepNum = target === 1 ? 1 : target === 2 ? 2 : target === 'scan' || target === 'manual' ? 3 : 4;
  ['stepInd1', 'stepInd2', 'stepInd3', 'stepInd4'].forEach((id, i) => {
    const el = document.getElementById(id);
    el.classList.remove('active', 'done');
    if (i + 1 < stepNum) el.classList.add('done');
    else if (i + 1 === stepNum) el.classList.add('active');
  });
}
document.getElementById('btnLanjutStep1').addEventListener('click', () => {
  AB.tanggal = document.getElementById('absenTanggal').value;
  AB.jenisApel = document.getElementById('absenJenisApel').value;
  if (!AB.tanggal) {
    alert('Pilih tanggal terlebih dahulu.');
    return;
  }
  showAbsenStep(2);
});
document.getElementById('btnBackStep2').addEventListener('click', () => showAbsenStep(1));

// --- Scan QR ---
document.getElementById('cardScanQr').addEventListener('click', () => {
  showAbsenStep('scan');
  startScanner();
});
document.getElementById('btnBatalScan').addEventListener('click', () => showAbsenStep(2));
function startScanner() {
  const hint = document.getElementById('scanHint');
  hint.textContent = 'Meminta izin kamera...';
  if (typeof Html5Qrcode === 'undefined') {
    hint.textContent = 'Pustaka pemindai QR gagal dimuat. Periksa koneksi internet.';
    return;
  }
  html5QrCode = new Html5Qrcode('qrReader');
  html5QrCode
    .start({ facingMode: 'environment' }, { fps: 10, qrbox: 230 }, onScanSuccess, () => {})
    .then(() => (hint.textContent = 'Arahkan kamera ke kartu QR pegawai'))
    .catch((err) => {
      hint.textContent = 'Gagal mengakses kamera: ' + err;
    });
}
function stopScanner() {
  if (html5QrCode) {
    const inst = html5QrCode;
    html5QrCode = null;
    inst
      .stop()
      .then(() => inst.clear())
      .catch(() => {});
  }
}
async function onScanSuccess(decodedText) {
  stopScanner();
  try {
    const staf = await StafDB.getStafByToken(decodedText.trim());
    if (!staf) {
      toast('QR tidak dikenali / pegawai tidak ditemukan.', 'error');
      showAbsenStep(2);
      return;
    }
    if (!staf.aktif) {
      toast('Pegawai ini berstatus tidak aktif.', 'error');
      showAbsenStep(2);
      return;
    }
    AB.staf = staf;
    AB.metode = 'QR';
    await enterStep34();
  } catch (err) {
    toast('Gagal memproses QR: ' + err.message, 'error');
    showAbsenStep(2);
  }
}

// --- Manual ---
document.getElementById('cardManual').addEventListener('click', () => {
  showAbsenStep('manual');
  drawAbsenStafList();
  document.getElementById('absenSearchStaf').value = '';
  document.getElementById('absenSearchStaf').focus();
});
document.getElementById('btnBatalManual').addEventListener('click', () => showAbsenStep(2));
document.getElementById('absenSearchStaf').addEventListener('input', drawAbsenStafList);
function drawAbsenStafList() {
  const q = (document.getElementById('absenSearchStaf').value || '').toLowerCase();
  const list = STAF.filter((p) => p.aktif && (p.nama.toLowerCase().includes(q) || p.nip.includes(q))).sort((a, b) => a.nama.localeCompare(b.nama));
  document.getElementById('absenStafList').innerHTML =
    list
      .slice(0, 100)
      .map((p) => `<tr style="cursor:pointer;" onclick="pickStafManual('${p.id}')"><td style="width:40px;"><div class="staf-avatar" style="width:32px;height:32px;font-size:12px;">${esc(p.nama[0])}</div></td><td><b>${esc(p.nama)}</b><br><span class="muted">${esc(p.jabatan)} — ${esc(p.biro)}</span></td></tr>`)
      .join('') || '<tr><td class="muted">Tidak ditemukan.</td></tr>';
}
window.pickStafManual = async (id) => {
  AB.staf = STAF.find((p) => p.id === id);
  AB.metode = 'MANUAL';
  await enterStep34();
};

// --- Step 3/4: pilih status + ttd ---
async function enterStep34() {
  const p = AB.staf;
  document.getElementById('stafPickedCard').innerHTML = `
    <div class="staf-avatar">${esc(p.nama[0])}</div>
    <div>
      <div class="spc-name">${esc(p.nama)}</div>
      <div class="spc-sub">${esc(p.jabatan)} · Gol. ${esc(p.golongan)} <span class="kat ${p.kategori}">${p.kategori}</span></div>
      <div class="spc-sub">${esc(p.biro)} — NIP ${esc(p.nip)}</div>
    </div>`;

  const notice = document.getElementById('absenExistingNotice');
  notice.style.display = 'none';
  try {
    const existing = await StafDB.getKehadiranStafSatu(AB.tanggal, AB.jenisApel, p.id);
    if (existing) {
      notice.style.display = 'block';
      notice.textContent = `Sudah tercatat sebelumnya: ${STATUS_LABEL_STAF[existing.status]} (${new Date(existing.waktuInput).toLocaleTimeString('id-ID')}). Menyimpan lagi akan memperbarui data ini.`;
    }
  } catch (err) {
    console.warn(err);
  }

  const statusList = p.kategori === 'PPPK' ? STATUS_LIST_STAF : STATUS_LIST_STAF.filter((s) => s !== 'HADIR_P3K' && s !== 'CUTI_P3K');
  document.getElementById('statusGridBig').innerHTML = statusList.map((s) => `<button type="button" class="status-big-btn st-${s}" data-status="${s}" onclick="pickStatus('${s}')">${STATUS_LABEL_STAF[s]}</button>`).join('');
  AB.status = null;
  document.getElementById('sigBox').style.display = 'none';
  document.getElementById('ketBox').style.display = 'none';
  document.getElementById('absenKeterangan').value = '';
  showAbsenStep(34);
}
window.pickStatus = (status) => {
  AB.status = status;
  document.querySelectorAll('.status-big-btn').forEach((b) => b.classList.toggle('picked', b.dataset.status === status));
  const needSig = STATUS_HADIR_FISIK.includes(status);
  document.getElementById('sigBox').style.display = needSig ? 'block' : 'none';
  document.getElementById('ketBox').style.display = needSig ? 'none' : 'block';
  if (needSig) {
    if (sigPad) sigPad.destroy();
    const canvas = document.getElementById('sigCanvas');
    sigPad = createSignaturePad(canvas);
    const ph = document.getElementById('sigPlaceholder');
    ph.style.display = 'flex';
    canvas.addEventListener(
      'pointerdown',
      () => {
        ph.style.display = 'none';
      },
      { once: true }
    );
  }
};
document.getElementById('btnClearSig').addEventListener('click', () => {
  if (sigPad) sigPad.clear();
  document.getElementById('sigPlaceholder').style.display = 'flex';
});
document.getElementById('btnBatalStep34').addEventListener('click', () => showAbsenStep(2));

document.getElementById('btnSimpanAbsen').addEventListener('click', async () => {
  if (!AB.status) {
    alert('Pilih status kehadiran terlebih dahulu.');
    return;
  }
  const needSig = STATUS_HADIR_FISIK.includes(AB.status);
  if (needSig && (!sigPad || sigPad.isEmpty())) {
    alert('Mohon tanda tangan terlebih dahulu.');
    return;
  }
  const btn = document.getElementById('btnSimpanAbsen');
  const original = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Menyimpan...';
  try {
    const entry = {
      tanggal: AB.tanggal,
      jenisApel: AB.jenisApel,
      stafId: AB.staf.id,
      status: AB.status,
      keterangan: needSig ? '' : document.getElementById('absenKeterangan').value || (AB.status === 'TK' ? '-' : ''),
      tandaTangan: needSig ? sigPad.toDataURL() : null,
      metode: AB.metode || 'MANUAL',
    };
    await StafDB.upsertKehadiranSatu(entry);
    document.getElementById('successDetail').textContent = `${AB.staf.nama} — ${STATUS_LABEL_STAF[AB.status]} — ${AB.jenisApel} — ${fmtTgl(AB.tanggal)}`;
    showAbsenStep('success');
    renderDashboardStaf();
  } catch (err) {
    toast('Gagal menyimpan: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = original;
  }
});
document.getElementById('btnAbsenLagi').addEventListener('click', () => {
  AB.staf = null;
  AB.status = null;
  showAbsenStep(2);
});

// ---------------- KARTU QR ----------------
async function renderQrGrid() {
  const q = (document.getElementById('qrSearch').value || '').toLowerCase();
  const biro = document.getElementById('qrFilterBiro').value;
  const list = STAF.filter((p) => p.aktif && (p.nama.toLowerCase().includes(q) || p.nip.includes(q)) && (!biro || p.biro === biro)).sort((a, b) => a.nama.localeCompare(b.nama));
  const grid = document.getElementById('qrGrid');
  grid.innerHTML =
    list.map((p) => `<div class="qr-card" data-id="${p.id}" style="cursor:pointer;"><canvas id="qrc_${p.id}"></canvas><div class="qn">${esc(p.nama)}</div><div class="qj">${esc(p.jabatan)}</div></div>`).join('') ||
    '<p class="muted">Tidak ada data.</p>';
  list.forEach((p) => {
    const c = document.getElementById('qrc_' + p.id);
    if (c && window.QRCode) QRCode.toCanvas(c, p.qrToken, { width: 120, margin: 1, color: { dark: '#0F2A47', light: '#FFFFFF' } }, () => {});
  });
  grid.querySelectorAll('.qr-card').forEach((card) => card.addEventListener('click', () => openQrSatu(card.dataset.id)));
}
document.getElementById('qrSearch').addEventListener('input', renderQrGrid);
document.getElementById('qrFilterBiro').addEventListener('change', renderQrGrid);

let qrSatuId = null;
async function openQrSatu(id) {
  const p = STAF.find((x) => x.id === id);
  if (!p) return;
  qrSatuId = id;
  document.getElementById('qrSatuContent').innerHTML = `<canvas id="qrSatuCanvas"></canvas><div class="qn" style="font-size:14px;">${esc(p.nama)}</div><div class="qj">${esc(p.jabatan)} — ${esc(p.biro)}</div><div class="qj">NIP ${esc(p.nip)}</div>`;
  document.getElementById('modalQrSatu').classList.remove('hidden');
  const c = document.getElementById('qrSatuCanvas');
  if (window.QRCode) QRCode.toCanvas(c, p.qrToken, { width: 200, margin: 1, color: { dark: '#0F2A47', light: '#FFFFFF' } }, () => {});
}
document.getElementById('btnTutupQrSatu').addEventListener('click', () => document.getElementById('modalQrSatu').classList.add('hidden'));
document.getElementById('btnRegenQr').addEventListener('click', async () => {
  if (!confirm('Buat ulang kode QR untuk pegawai ini? Kartu QR lama tidak akan berfungsi lagi.')) return;
  try {
    const updated = await StafDB.regenerateQrToken(qrSatuId);
    const idx = STAF.findIndex((x) => x.id === qrSatuId);
    STAF[idx] = updated;
    openQrSatu(qrSatuId);
    renderQrGrid();
    toast('Kode QR berhasil diperbarui.');
  } catch (err) {
    toast('Gagal membuat ulang QR: ' + err.message, 'error');
  }
});
document.getElementById('btnCetakSemuaQr').addEventListener('click', async () => {
  const q = (document.getElementById('qrSearch').value || '').toLowerCase();
  const biro = document.getElementById('qrFilterBiro').value;
  const list = STAF.filter((p) => p.aktif && (p.nama.toLowerCase().includes(q) || p.nip.includes(q)) && (!biro || p.biro === biro)).sort((a, b) => a.nama.localeCompare(b.nama));
  if (!list.length) {
    alert('Tidak ada data untuk dicetak.');
    return;
  }
  toast('Menyiapkan kartu QR untuk dicetak...');
  try {
    const cards = await Promise.all(
      list.map(async (p) => {
        const url = await QRCode.toDataURL(p.qrToken, { width: 200, margin: 1 });
        return `<div class="print-qr-card"><img src="${url}"><div class="pqn">${esc(p.nama)}</div><div class="pqj">${esc(p.jabatan)}</div><div class="pqnip">NIP ${esc(p.nip)}</div></div>`;
      })
    );
    doPrint(`<div class="print-qr-sheet">${cards.join('')}</div>`, false);
  } catch (err) {
    toast('Gagal membuat kartu QR: ' + err.message, 'error');
  }
});

// ---------------- DATA PEGAWAI ----------------
function renderStafTable() {
  const q = (document.getElementById('searchStaf').value || '').toLowerCase();
  const biroFilter = document.getElementById('filterBiroStaf').value;
  const kat = document.getElementById('filterKategori').value;
  const tbody = document.getElementById('tabelStaf');
  const rows = STAF.filter((p) => (p.nama.toLowerCase().includes(q) || p.nip.includes(q)) && (!biroFilter || p.biro === biroFilter) && (!kat || p.kategori === kat));
  const biros = biroFilter ? [biroFilter] : BIRO_LIST.filter((b) => rows.some((p) => p.biro === b));
  let no = 0,
    html = '';
  biros.forEach((biro) => {
    const list = rows.filter((p) => p.biro === biro).sort((a, b) => a.nama.localeCompare(b.nama));
    if (!list.length) return;
    html += `<tr class="group-row"><td colspan="8">${esc(biro)} <span class="muted" style="font-weight:400;">(${list.length} pegawai)</span></td></tr>`;
    html += list
      .map((p) => {
        no++;
        return `<tr>
      <td>${no}</td><td>${esc(p.nama)}</td><td>${esc(p.nip)}</td><td>${esc(p.golongan)}</td><td><span class="kat ${p.kategori}">${p.kategori}</span></td><td>${esc(p.jabatan)}</td>
      <td><span class="badge ${p.aktif ? 'aktif' : 'nonaktif'}">${p.aktif ? 'Aktif' : 'Tidak Aktif'}</span></td>
      <td>
        <button class="btn small outline" onclick="editStaf('${p.id}')">Edit</button>
        <button class="btn small outline" onclick="openQrSatu('${p.id}')">QR</button>
        <button class="btn small ${p.aktif ? 'outline' : 'gold'}" onclick="toggleAktifStaf('${p.id}')">${p.aktif ? 'Nonaktifkan' : 'Aktifkan'}</button>
        <button class="btn small danger" onclick="hapusStaf('${p.id}')">Hapus</button>
      </td></tr>`;
      })
      .join('');
  });
  tbody.innerHTML = html || '<tr><td colspan="8" class="muted">Tidak ada data.</td></tr>';
}
document.getElementById('searchStaf').addEventListener('input', renderStafTable);
document.getElementById('filterBiroStaf').addEventListener('change', renderStafTable);
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
  document.getElementById('stafBiro').value = p ? p.biro : BIRO_LIST[0];
  document.getElementById('stafJabatan').value = p ? p.jabatan : '';
  document.getElementById('stafAktif').value = p ? (p.aktif ? '1' : '0') : '1';
  document.getElementById('modalStaf').classList.remove('hidden');
}
window.editStaf = (id) => openModalStaf(STAF.find((p) => p.id === id));
window.toggleAktifStaf = async (id) => {
  const p = STAF.find((x) => x.id === id);
  const next = !p.aktif;
  await StafDB.setAktifStaf(id, next).catch((err) => toast('Gagal: ' + err.message, 'error'));
  p.aktif = next;
  renderStafTable();
  toast('Status pegawai diperbarui.');
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
document.getElementById('btnSimpanStaf').addEventListener('click', async () => {
  const id = document.getElementById('stafId').value;
  const nama = document.getElementById('stafNama').value.trim();
  const nip = document.getElementById('stafNip').value.trim();
  const golongan = document.getElementById('stafGolongan').value.trim() || '-';
  const kategori = document.getElementById('stafKategori').value;
  const biro = document.getElementById('stafBiro').value;
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
      const updated = await StafDB.updateStaf(id, { nama, nip, golongan, kategori, biro, jabatan, aktif });
      const idx = STAF.findIndex((x) => x.id === id);
      STAF[idx] = updated;
    } else {
      const created = await StafDB.insertStaf({ nama, nip, golongan, kategori, biro, jabatan, aktif });
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

// ---------------- REKAP & CETAK ----------------
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
  const biro = document.getElementById('rekapBiroStaf').value;
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
  const rows = raw.map((k) => ({ ...k, staf: STAF.find((p) => p.id === k.stafId) })).filter((k) => k.staf && (!biro || k.staf.biro === biro));
  return { mode, dari, sampai, jenisApel, biro, rows };
}
function renderRekapHarianStaf(data) {
  const rows = data.rows.slice().sort((a, b) => biroIndex(a.staf.biro) - biroIndex(b.staf.biro) || a.staf.nama.localeCompare(b.staf.nama));
  const body =
    rows
      .map(
        (r, i) =>
          `<tr><td>${i + 1}</td><td>${esc(r.staf.biro)}</td><td>${esc(r.staf.nama)}</td><td>${esc(r.staf.golongan)}</td><td>${esc(r.staf.jabatan)}</td><td><span class="badge" style="background:${STATUS_COLOR_STAF[r.status]}">${STATUS_LABEL_STAF[r.status]}</span></td><td>${r.tandaTangan ? '✔️ Sudah TTD' : '—'}</td></tr>`
      )
      .join('') || '<tr><td colspan="7" class="muted">Tidak ada data pada periode ini.</td></tr>';
  const c = Object.fromEntries(STATUS_LIST_STAF.map((s) => [s, 0]));
  rows.forEach((r) => c[r.status]++);
  return `<div class="table-wrap"><table><thead><tr><th>No</th><th>Biro</th><th>Nama</th><th>Gol</th><th>Jabatan</th><th>Status</th><th>Tanda Tangan</th></tr></thead><tbody>${body}</tbody></table></div>
  <div class="grid-cards" style="margin-top:14px;">${statCardsHtmlStaf(c)}</div>`;
}
function renderRekapRangeStaf(data) {
  const byStaf = {};
  data.rows.forEach((r) => {
    if (!byStaf[r.stafId]) byStaf[r.stafId] = { staf: r.staf, ...Object.fromEntries(STATUS_LIST_STAF.map((s) => [s, 0])), total: 0 };
    byStaf[r.stafId][r.status]++;
    byStaf[r.stafId].total++;
  });
  const arr = Object.values(byStaf).sort((a, b) => biroIndex(a.staf.biro) - biroIndex(b.staf.biro) || a.staf.nama.localeCompare(b.staf.nama));
  const head = STATUS_LIST_STAF.map((s) => `<th>${STATUS_LABEL_STAF[s]}</th>`).join('');
  const body =
    arr
      .map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.staf.biro)}</td><td>${esc(r.staf.nama)}</td>${STATUS_LIST_STAF.map((s) => `<td>${r[s]}</td>`).join('')}</tr>`)
      .join('') || `<tr><td colspan="${3 + STATUS_LIST_STAF.length}" class="muted">Tidak ada data pada periode ini.</td></tr>`;
  const tot = Object.fromEntries(STATUS_LIST_STAF.map((s) => [s, 0]));
  data.rows.forEach((r) => tot[r.status]++);
  return `<div class="table-wrap"><table><thead><tr><th>No</th><th>Biro</th><th>Nama</th>${head}</tr></thead><tbody>${body}</tbody></table></div>
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
function doPrint(html, landscape) {
  const area = document.getElementById('printArea');
  area.innerHTML = html;
  area.classList.toggle('landscape', !!landscape);
  window.print();
}
function letterheadGeneric(title, sub) {
  return `<div class="print-kop">
    <img src="${LOGO_SULTRA}" alt="Logo Sulawesi Tenggara">
    <div class="kop-text"><h3>PEMERINTAH PROVINSI SULAWESI TENGGARA</h3><h4>SEKRETARIAT DAERAH</h4><div class="kop-addr">Jl. Ahmad Yani No. 1, Kendari, Sulawesi Tenggara</div></div>
  </div><div class="print-doctitle"><div class="t1">${title}</div><div class="t2">${sub}</div></div>`;
}
function buildDaftarHadirHtml({ tanggal, jenisApel, biro, rows }) {
  const biroInfo = BIRO_FULL.find((b) => b.nama === biro) || {};
  const sorted = rows.slice().sort((a, b) => a.staf.nama.localeCompare(b.staf.nama));
  let no = 0;
  const body = sorted
    .map((r) => {
      no++;
      let ttd;
      if (r.tandaTangan) ttd = `<img src="${r.tandaTangan}">`;
      else if (r.status && r.status !== 'HADIR' && r.status !== 'HADIR_P3K') ttd = `<i>${STATUS_LABEL_STAF[r.status]}</i>`;
      else ttd = `<span class="dotline">&nbsp;</span>`;
      return `<tr><td class="dh-no">${no}</td><td class="dh-nama"><span class="n1">${esc(r.staf.nama)}</span><span class="n2">${esc(r.staf.nip)}</span></td><td class="dh-gol">${esc(r.staf.golongan)}</td><td class="dh-jabatan">${esc(r.staf.jabatan)}</td><td class="dh-ttd">${ttd}</td></tr>`;
    })
    .join('');
  const table = `<table class="dh-table"><colgroup><col style="width:5%"><col style="width:26%"><col style="width:8%"><col style="width:31%"><col style="width:30%"></colgroup>
    <thead><tr><th>No</th><th>Nama Pegawai</th><th>Gol</th><th>Jabatan</th><th>Tanda Tangan</th></tr></thead>
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
    <div class="jabatan-ttd">KEPALA ${esc(biro).toUpperCase()}<br>SETDA PROVINSI SULAWESI TENGGARA</div>
    <div class="dh-ttd-space"></div>
    <div class="nama-ttd">${esc(biroInfo.kepalaNama) || '..............................................'}</div>
    <div>${esc(biroInfo.kepalaPangkat) || ''}</div>
    <div>NIP. ${esc(biroInfo.kepalaNip) || '..............................................'}</div>
  </div>`;
  return `<div class="dh-title">DAFTAR HADIR PNS, CPNS DAN PPPK</div><div class="dh-sub">${esc(biro).toUpperCase()} SETDA PROV. SULTRA</div>
    <div class="dh-meta-row"><span>HARI/TANGGAL : ${fmtTgl(tanggal)}</span><span>APEL : ${jenisApel === 'Apel Pagi' ? 'PAGI' : 'SORE'}</span></div>
    ${table}${catatan}${sign}`;
}
document.getElementById('btnCetakDaftarHadir').addEventListener('click', async () => {
  const mode = document.getElementById('rekapModeStaf').value;
  const biro = document.getElementById('rekapBiroStaf').value;
  if (mode === 'harian') {
    const jenisApel = document.getElementById('rekapJenisApelStaf').value;
    if (!biro) {
      alert('Pilih Biro terlebih dahulu — formulir Daftar Hadir dicetak per-biro.');
      return;
    }
    if (!jenisApel) {
      alert('Pilih jenis Apel (Pagi/Sore) untuk mencetak Daftar Hadir.');
      return;
    }
    const tanggal = rekapTglSatuStaf.value;
    try {
      const raw = await StafDB.listKehadiranStaf({ dari: tanggal, sampai: tanggal, jenisApel });
      const stafBiro = STAF.filter((p) => p.aktif && p.biro === biro);
      const rows = stafBiro.map((p) => {
        const k = raw.find((x) => x.stafId === p.id);
        return { staf: p, status: k ? k.status : null, tandaTangan: k ? k.tandaTangan : null };
      });
      doPrint(buildDaftarHadirHtml({ tanggal, jenisApel, biro, rows }), false);
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
    const list = Object.values(arr).sort((a, b) => biroIndex(a.staf.biro) - biroIndex(b.staf.biro) || a.staf.nama.localeCompare(b.staf.nama));
    const head = STATUS_LIST_STAF.map((s) => `<th>${STATUS_LABEL_STAF[s]}</th>`).join('');
    const body = list.map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.staf.biro)}</td><td>${esc(r.staf.nama)}</td>${STATUS_LIST_STAF.map((s) => `<td class="num">${r[s]}</td>`).join('')}</tr>`).join('');
    const table = `<div class="print-table-wrap"><table class="print-table"><thead><tr><th class="num">No</th><th>Biro</th><th>Nama</th>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
    const sub = `Periode: ${lastRekapStaf.dari} s.d. ${lastRekapStaf.sampai}${lastRekapStaf.biro ? ' — ' + lastRekapStaf.biro : ''}`;
    doPrint(letterheadGeneric('REKAPITULASI KEHADIRAN PEGAWAI', sub) + table, true);
  }
});

// ---------------- PENGATURAN: KEPALA BIRO ----------------
function fillKepalaBiroForm() {
  const sel = document.getElementById('kbBiro');
  const setForm = () => {
    const info = BIRO_FULL.find((b) => b.nama === sel.value) || {};
    document.getElementById('kbNama').value = info.kepalaNama || '';
    document.getElementById('kbPangkat').value = info.kepalaPangkat || '';
    document.getElementById('kbNip').value = info.kepalaNip || '';
  };
  sel.onchange = setForm;
  setForm();
}
document.getElementById('btnSimpanKepalaBiro').addEventListener('click', async () => {
  const biro = document.getElementById('kbBiro').value;
  const kepalaNama = document.getElementById('kbNama').value.trim();
  const kepalaPangkat = document.getElementById('kbPangkat').value.trim();
  const kepalaNip = document.getElementById('kbNip').value.trim();
  try {
    await StafDB.updateKepalaBiro(biro, { kepalaNama, kepalaPangkat, kepalaNip });
    const idx = BIRO_FULL.findIndex((b) => b.nama === biro);
    if (idx >= 0) BIRO_FULL[idx] = { ...BIRO_FULL[idx], kepalaNama, kepalaPangkat, kepalaNip };
    toast('Data Kepala Biro tersimpan.');
  } catch (err) {
    toast('Gagal menyimpan: ' + err.message, 'error');
  }
});

// ---------------- BACKUP ----------------
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

// ---------------- REALTIME ----------------
function setupRealtime() {
  if (!StafDB.isConfigured()) return;
  try {
    StafDB.subscribeChangesStaf(() => {
      const activePage = document.querySelector('.nav-item.active')?.dataset.page;
      if (activePage === 'beranda') renderDashboardStaf();
    });
  } catch (err) {
    console.warn('Realtime tidak aktif:', err.message);
  }
}

// ---------------- PWA SERVICE WORKER ----------------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

// ---------------- INIT ----------------
async function bootstrap() {
  let ok = false;
  try {
    ok = await checkConnection();
  } catch (err) {
    console.error(err);
  }
  if (!ok) {
    document.getElementById('tabelStaf').innerHTML = '<tr><td colspan="8" class="muted">Menunggu konfigurasi Supabase...</td></tr>';
    return;
  }
  try {
    BIRO_FULL = await StafDB.listBiroFull();
    BIRO_LIST = BIRO_FULL.map((b) => b.nama);
    STAF = await StafDB.listStaf();
    fillBiroDropdowns();
    await renderDashboardStaf();
    setupRealtime();
  } catch (err) {
    toast('Gagal memuat data awal: ' + err.message, 'error');
    document.getElementById('tabelStaf').innerHTML = '<tr><td colspan="8" class="muted">Gagal memuat data: ' + esc(err.message) + '</td></tr>';
  }
}
bootstrap().catch((err) => {
  console.error('Bootstrap gagal total:', err);
  toast('Aplikasi gagal memuat: ' + err.message, 'error');
});
