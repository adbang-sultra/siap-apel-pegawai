// =====================================================================
// SIAP APEL — Lapisan Akses Data (Supabase) — Versi Pegawai
// Memakai client dari js/supabase-init.js (window.SB)
// =====================================================================

const STATUS_LIST_STAF = ['HADIR', 'IZIN', 'SAKIT', 'CUTI', 'TK', 'TUGAS_LUAR', 'HADIR_P3K', 'CUTI_P3K'];
const STATUS_LABEL_STAF = {
  HADIR: 'Hadir',
  IZIN: 'Ijin',
  SAKIT: 'Sakit',
  CUTI: 'Cuti',
  TK: 'Tanpa Keterangan',
  TUGAS_LUAR: 'Tugas Luar',
  HADIR_P3K: 'Hadir P3K',
  CUTI_P3K: 'Cuti P3K',
};
// Status yang hanya boleh tercatat lewat scan QR (kehadiran fisik)
const STATUS_HADIR_FISIK = ['HADIR', 'HADIR_P3K'];
// Status "tidak hadir" yang bisa diinput manual oleh Admin beserta alasannya
const STATUS_TIDAK_HADIR = STATUS_LIST_STAF.filter((s) => !STATUS_HADIR_FISIK.includes(s));

const throwIfErrorStaf = window.throwIfError;
function clientStaf() {
  return window.SB.client();
}

function rowToStaf(r) {
  return { id: r.id, nama: r.nama, nip: r.nip, golongan: r.golongan, kategori: r.kategori, jabatan: r.jabatan, qrToken: r.qr_token, tandaTangan: r.tanda_tangan, aktif: r.aktif, punyaPin: r.punya_pin === true };
}
function rowToKehadiranStaf(r) {
  return { id: r.id, tanggal: r.tanggal, jenisApel: r.jenis_apel, stafId: r.staf_id, status: r.status, keterangan: r.keterangan, tandaTangan: r.tanda_tangan, metode: r.metode, waktuInput: r.waktu_input };
}

const StafDB = {
  isConfigured() {
    return window.SB.isConfigured();
  },
  configError() {
    return window.SB.configError();
  },

  // ---------------- AUTH ----------------
  async adminLogin(username, password) {
    const { data, error } = await clientStaf().rpc('admin_login', { p_username: username, p_password: password });
    throwIfErrorStaf(error);
    return !!(data && data[0] && data[0].ok);
  },
  async adminSetPassword(username, oldPassword, newPassword) {
    const { data, error } = await clientStaf().rpc('admin_set_password', { p_username: username, p_old_password: oldPassword, p_new_password: newPassword });
    throwIfErrorStaf(error);
    return !!data;
  },
  async stafCheckNip(nip) {
    const { data, error } = await clientStaf().rpc('staf_check_nip', { p_nip: nip });
    throwIfErrorStaf(error);
    const row = data && data[0];
    return row ? { found: row.found, nama: row.nama, sudahAktif: row.sudah_aktif } : { found: false };
  },
  async stafActivate(nip, pin) {
    const { data, error } = await clientStaf().rpc('staf_activate', { p_nip: nip, p_pin: pin });
    throwIfErrorStaf(error);
    return !!data;
  },
  async stafLogin(nip, pin) {
    const { data, error } = await clientStaf().rpc('staf_login', { p_nip: nip, p_pin: pin });
    throwIfErrorStaf(error);
    const row = data && data[0];
    return row ? rowToStaf(row) : null;
  },
  async stafSetPin(nip, pinLama, pinBaru) {
    const { data, error } = await clientStaf().rpc('staf_set_pin', { p_nip: nip, p_pin_lama: pinLama, p_pin_baru: pinBaru });
    throwIfErrorStaf(error);
    return !!data;
  },
  async adminResetPin(stafId) {
    const { data, error } = await clientStaf().rpc('admin_reset_pin', { p_staf_id: stafId });
    throwIfErrorStaf(error);
    return !!data;
  },

  // ---------------- ORG SETTINGS ----------------
  async getOrgSettings() {
    const { data, error } = await clientStaf().from('org_settings').select('*').eq('id', 1).maybeSingle();
    throwIfErrorStaf(error);
    return data ? { namaBiro: data.nama_biro, kepalaNama: data.kepala_nama || '', kepalaPangkat: data.kepala_pangkat || '', kepalaNip: data.kepala_nip || '' } : { namaBiro: 'Biro Administrasi Pembangunan', kepalaNama: '', kepalaPangkat: '', kepalaNip: '' };
  },
  async updateOrgSettings({ namaBiro, kepalaNama, kepalaPangkat, kepalaNip }) {
    const { error } = await clientStaf().from('org_settings').update({ nama_biro: namaBiro, kepala_nama: kepalaNama, kepala_pangkat: kepalaPangkat, kepala_nip: kepalaNip }).eq('id', 1);
    throwIfErrorStaf(error);
  },

  // ---------------- STAF ----------------
  // Catatan: kolom "pin_hash" SENGAJA tidak pernah di-select di sini,
  // supaya hash PIN tidak pernah terkirim ke browser sama sekali. Status
  // aktivasi akun dibaca lewat kolom turunan aman "punya_pin" (boolean).
  async listStaf() {
    const { data, error } = await clientStaf().from('staf').select('id, nama, nip, golongan, kategori, jabatan, qr_token, tanda_tangan, aktif, punya_pin').order('nama', { ascending: true });
    throwIfErrorStaf(error);
    return data.map(rowToStaf);
  },
  async getStafById(id) {
    const { data, error } = await clientStaf().from('staf').select('id, nama, nip, golongan, kategori, jabatan, qr_token, tanda_tangan, aktif, punya_pin').eq('id', id).maybeSingle();
    throwIfErrorStaf(error);
    return data ? rowToStaf(data) : null;
  },
  async insertStaf(s) {
    const { data, error } = await clientStaf()
      .from('staf')
      .insert({ nama: s.nama, nip: s.nip, golongan: s.golongan, kategori: s.kategori, jabatan: s.jabatan, aktif: s.aktif })
      .select('id, nama, nip, golongan, kategori, jabatan, qr_token, tanda_tangan, aktif, punya_pin')
      .single();
    throwIfErrorStaf(error);
    return rowToStaf(data);
  },
  async updateStaf(id, s) {
    const { data, error } = await clientStaf()
      .from('staf')
      .update({ nama: s.nama, nip: s.nip, golongan: s.golongan, kategori: s.kategori, jabatan: s.jabatan, aktif: s.aktif })
      .eq('id', id)
      .select('id, nama, nip, golongan, kategori, jabatan, qr_token, tanda_tangan, aktif, punya_pin')
      .single();
    throwIfErrorStaf(error);
    return rowToStaf(data);
  },
  // Profil terbatas yang boleh diubah pegawai sendiri (tanpa nama/NIP/status aktif)
  async updateStafProfileSelf(id, { golongan, kategori, jabatan }) {
    const { data, error } = await clientStaf()
      .from('staf')
      .update({ golongan, kategori, jabatan })
      .eq('id', id)
      .select('id, nama, nip, golongan, kategori, jabatan, qr_token, tanda_tangan, aktif, punya_pin')
      .single();
    throwIfErrorStaf(error);
    return rowToStaf(data);
  },
  async saveStafSignature(id, dataUrl) {
    const { data, error } = await clientStaf()
      .from('staf')
      .update({ tanda_tangan: dataUrl })
      .eq('id', id)
      .select('id, nama, nip, golongan, kategori, jabatan, qr_token, tanda_tangan, aktif, punya_pin')
      .single();
    throwIfErrorStaf(error);
    return rowToStaf(data);
  },
  async regenerateQrToken(id) {
    const newToken = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random()).replace(/-/g, '');
    const { data, error } = await clientStaf()
      .from('staf')
      .update({ qr_token: newToken })
      .eq('id', id)
      .select('id, nama, nip, golongan, kategori, jabatan, qr_token, tanda_tangan, aktif, punya_pin')
      .single();
    throwIfErrorStaf(error);
    return rowToStaf(data);
  },
  async setAktifStaf(id, aktif) {
    const { error } = await clientStaf().from('staf').update({ aktif }).eq('id', id);
    throwIfErrorStaf(error);
  },
  async deleteStaf(id) {
    const { error } = await clientStaf().from('staf').delete().eq('id', id);
    throwIfErrorStaf(error);
  },

  // ---------------- KEHADIRAN STAF ----------------
  async listKehadiranStaf({ dari, sampai, jenisApel, stafId } = {}) {
    let q = clientStaf().from('kehadiran_staf').select('*');
    if (dari) q = q.gte('tanggal', dari);
    if (sampai) q = q.lte('tanggal', sampai);
    if (jenisApel) q = q.eq('jenis_apel', jenisApel);
    if (stafId) q = q.eq('staf_id', stafId);
    const { data, error } = await q;
    throwIfErrorStaf(error);
    return data.map(rowToKehadiranStaf);
  },
  async getKehadiranStafSatu(tanggal, jenisApel, stafId) {
    const { data, error } = await clientStaf().from('kehadiran_staf').select('*').eq('tanggal', tanggal).eq('jenis_apel', jenisApel).eq('staf_id', stafId).maybeSingle();
    throwIfErrorStaf(error);
    return data ? rowToKehadiranStaf(data) : null;
  },
  async upsertKehadiranSatu(entry) {
    const row = {
      tanggal: entry.tanggal,
      jenis_apel: entry.jenisApel,
      staf_id: entry.stafId,
      status: entry.status,
      keterangan: entry.keterangan || '',
      tanda_tangan: entry.tandaTangan || null,
      metode: entry.metode || 'MANUAL',
    };
    const { data, error } = await clientStaf().from('kehadiran_staf').upsert(row, { onConflict: 'tanggal,jenis_apel,staf_id' }).select().single();
    throwIfErrorStaf(error);
    return rowToKehadiranStaf(data);
  },

  // ---------------- BACKUP ----------------
  async exportAllStaf() {
    const [staf, kehadiran] = await Promise.all([this.listStaf(), this.listKehadiranStaf()]);
    return { staf: staf.map((s) => ({ ...s, tandaTangan: s.tandaTangan ? '[tersimpan]' : null })), kehadiran, exportedAt: new Date().toISOString() };
  },

  // ---------------- REALTIME ----------------
  subscribeChangesStaf(onChange) {
    return clientStaf()
      .channel('siap-apel-staf-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'staf' }, onChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'kehadiran_staf' }, onChange)
      .subscribe();
  },
};

window.StafDB = StafDB;
window.STATUS_LIST_STAF = STATUS_LIST_STAF;
window.STATUS_LABEL_STAF = STATUS_LABEL_STAF;
window.STATUS_HADIR_FISIK = STATUS_HADIR_FISIK;
window.STATUS_TIDAK_HADIR = STATUS_TIDAK_HADIR;
