// =====================================================================
// SIAP APEL — Lapisan Akses Data (Supabase) — Versi Pegawai
// Memakai client bersama dari js/supabase-init.js (window.SB)
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
// Status yang menandakan pegawai hadir secara fisik (perlu / boleh tanda tangan)
const STATUS_HADIR_FISIK = ['HADIR', 'HADIR_P3K'];

const throwIfErrorStaf = window.throwIfError;
function clientStaf() {
  return window.SB.client();
}

function rowToStaf(r) {
  return { id: r.id, nama: r.nama, nip: r.nip, golongan: r.golongan, kategori: r.kategori, biro: r.biro, jabatan: r.jabatan, qrToken: r.qr_token, aktif: r.aktif };
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

  // ---------------- BIRO (dengan info Kepala Biro) ----------------
  async listBiroFull() {
    const { data, error } = await clientStaf().from('biro').select('*').order('urutan', { ascending: true });
    throwIfErrorStaf(error);
    return data.map((b) => ({ nama: b.nama, kepalaNama: b.kepala_nama || '', kepalaPangkat: b.kepala_pangkat || '', kepalaNip: b.kepala_nip || '' }));
  },
  async updateKepalaBiro(nama, { kepalaNama, kepalaPangkat, kepalaNip }) {
    const { error } = await clientStaf().from('biro').update({ kepala_nama: kepalaNama, kepala_pangkat: kepalaPangkat, kepala_nip: kepalaNip }).eq('nama', nama);
    throwIfErrorStaf(error);
  },

  // ---------------- STAF ----------------
  async listStaf() {
    const { data, error } = await clientStaf().from('staf').select('*').order('nama', { ascending: true });
    throwIfErrorStaf(error);
    return data.map(rowToStaf);
  },
  async getStafByToken(token) {
    const { data, error } = await clientStaf().from('staf').select('*').eq('qr_token', token).maybeSingle();
    throwIfErrorStaf(error);
    return data ? rowToStaf(data) : null;
  },
  async insertStaf(s) {
    const { data, error } = await clientStaf()
      .from('staf')
      .insert({ nama: s.nama, nip: s.nip, golongan: s.golongan, kategori: s.kategori, biro: s.biro, jabatan: s.jabatan, aktif: s.aktif })
      .select()
      .single();
    throwIfErrorStaf(error);
    return rowToStaf(data);
  },
  async updateStaf(id, s) {
    const { data, error } = await clientStaf()
      .from('staf')
      .update({ nama: s.nama, nip: s.nip, golongan: s.golongan, kategori: s.kategori, biro: s.biro, jabatan: s.jabatan, aktif: s.aktif })
      .eq('id', id)
      .select()
      .single();
    throwIfErrorStaf(error);
    return rowToStaf(data);
  },
  async regenerateQrToken(id) {
    const newToken = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random()).replace(/-/g, '');
    const { data, error } = await clientStaf().from('staf').update({ qr_token: newToken }).eq('id', id).select().single();
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
  // Simpan satu entri kehadiran (dipakai oleh alur scan QR & tanda-tangan individual)
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
  // Simpan banyak entri sekaligus (dipakai oleh Input Kehadiran manual massal)
  async upsertKehadiranBatchStaf(tanggal, jenisApel, entries) {
    const del = await clientStaf().from('kehadiran_staf').delete().eq('tanggal', tanggal).eq('jenis_apel', jenisApel);
    throwIfErrorStaf(del.error);
    const rows = entries.map((e) => ({
      tanggal,
      jenis_apel: jenisApel,
      staf_id: e.stafId,
      status: e.status,
      keterangan: e.keterangan || '',
      tanda_tangan: e.tandaTangan || null,
      metode: e.metode || 'MANUAL',
    }));
    const { error } = await clientStaf().from('kehadiran_staf').insert(rows);
    throwIfErrorStaf(error);
  },

  // ---------------- BACKUP / RESTORE ----------------
  async exportAllStaf() {
    const [staf, kehadiran] = await Promise.all([this.listStaf(), this.listKehadiranStaf()]);
    return { staf, kehadiran, exportedAt: new Date().toISOString() };
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
