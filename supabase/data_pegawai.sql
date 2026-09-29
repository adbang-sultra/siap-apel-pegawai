-- =====================================================================
-- SIAP APEL — Impor Data Pegawai Biro Administrasi Pembangunan (52 orang)
-- Sumber: foto Daftar Hadir Apel Pagi, Senin 28/09/2026.
-- Jalankan SETELAH supabase/schema.sql (butuh kolom "urutan").
-- Aman dijalankan berulang: data dicocokkan berdasarkan NIP (upsert), sehingga
-- PIN, tanda tangan, dan kode QR pegawai yang sudah ada TIDAK berubah.
-- =====================================================================

-- 1) Tambah / perbarui 52 pegawai (kunci: NIP)
insert into staf (urutan, nama, nip, golongan, kategori, jabatan, aktif) values
  (1, 'LM. MARTOSISWOYO, SE., M.Si', '19671010 199503 1 006', 'IV/c', 'PNS', 'KEPALA BIRO', true),
  (2, 'H. YAKOB UDI, SE., M.Si', '19690517 199003 1 011', 'IV/c', 'PNS', 'Perencana Ahli Madya', true),
  (3, 'ONI IDRUS, SP., M.Si', '19680908 199703 2 003', 'IV/c', 'PNS', 'Analis Kebijakan Ahli Madya', true),
  (4, 'Dr. NURBIYAH, S.STP, M.Si', '19841002 200212 2 002', 'IV/b', 'PNS', 'Analis Kebijakan Ahli Madya', true),
  (5, 'WA ODE JUSWATI, SH, M.M', '19731231 200804 2 001', 'IV/a', 'PNS', 'Analis Kebijakan Ahli Madya', true),
  (6, 'MURNIATI, S.IP, M.AP', '19750415 201101 2 002', 'III/d', 'PNS', 'Kasubag Tata Usaha', true),
  (7, 'HENDRIK KRESNAWAN, S.IP, M.M', '19880523 200701 1 004', 'III/d', 'PNS', 'Perencana Ahli Madya', true),
  (8, 'SITI SARYANI SAMANDI, SE., M.AP', '19780505 200901 2 001', 'III/d', 'PNS', 'Analis Kebijakan Ahli Muda', true),
  (9, 'ALIF ALFIAN. R, S.STP', '19900620 201010 1 001', 'III/d', 'PNS', 'Analis Kebijakan Ahli Muda', true),
  (10, 'RIAN PUTRA SANJAYA, S.STP., MM', '19910701 201406 1 001', 'III/d', 'PNS', 'Analis Kebijakan Ahli Muda', true),
  (11, 'ASMAWATI SYAMSUDDIN RAGA, SP', '19710604 200604 2 022', 'III/d', 'PNS', 'Penelaah Teknis Kebijakan', true),
  (12, 'LA ODE ARISAN, S.IP.', '19791008 200604 1 008', 'III/d', 'PNS', 'Penelaah Teknis Kebijakan', true),
  (13, 'LA ODE MUH. ULYUN UNGA, S.Sos', '19710206 200801 1 009', 'III/d', 'PNS', 'Penelaah Teknis Kebijakan', true),
  (14, 'SITI KORINA, SE.', '19750612 200801 2 014', 'III/d', 'PNS', 'Penelaah Teknis Kebijakan', true),
  (15, 'IRSANTY JAMAL, S. Sos', '19720706 200701 2 021', 'III/d', 'PNS', 'Penelaah Teknis Kebijakan', true),
  (16, 'NURLINA, SE.', '19800526 201001 2 003', 'III/d', 'PNS', 'Penelaah Teknis Kebijakan', true),
  (17, 'SITTI MARLINA SARANANI, ST, M.M', '19740219 200701 2 013', 'III/d', 'PNS', 'Penelaah Teknis Kebijakan', true),
  (18, 'ANITA HARLIANY, S. Sos, M.M', '19740330 199402 2 003', 'III/d', 'PNS', 'Penelaah Teknis Kebijakan', true),
  (19, 'ANDI DINI SRI MAJAYANTI, S.Pi', '19840807 201001 2 001', 'III/c', 'PNS', 'Penelaah Teknis Kebijakan', true),
  (20, 'BAHTIAR, S. Sos', '19800301 201001 1 001', 'III/c', 'PNS', 'Penelaah Teknis Kebijakan', true),
  (21, 'SITI NURJANNAH, SE.', '19910613 201502 2 002', 'III/c', 'PNS', 'Penelaah Teknis Kebijakan', true),
  (22, 'WAODE MULIANI NIKA, S.IP, M.M', '19830807 200901 2 001', 'III/c', 'PNS', 'Penelaah Teknis Kebijakan', true),
  (23, 'ANSARULLAH, SE.', '19760917 200801 1 007', 'III/c', 'PNS', 'Penelaah Teknis Kebijakan', true),
  (24, 'LIZA NOVITA ARISTA ZALDY, SP', '19770219 201408 2 001', 'III/c', 'PNS', 'Penelaah Teknis Kebijakan', true),
  (25, 'HASNAWATI, SE., M.M', '19840818 201903 2 013', 'III/b', 'PNS', 'Analis Kebijakan Ahli Pertama', true),
  (26, 'AJAL SAPUTRA, SE.', '19920216 201903 1 012', 'III/b', 'PNS', 'Penelaah Teknis Kebijakan', true),
  (27, 'NIRWATI, S.Pd., M.AP', '19800304 201408 2 001', 'III/b', 'PNS', 'Penelaah Teknis Kebijakan', true),
  (28, 'ASTRININGSIH, SH', '19870926 200604 2 005', 'III/b', 'PNS', 'Penelaah Teknis Kebijakan', true),
  (29, 'NURYONO, S.Pd', '19911223 202504 1 002', 'III/a', 'CPNS', 'Perencana Ahli Pertama (CPNS)', true),
  (30, 'LD MUHAMMAD ZULFIKAR S.Pd', '19920212 202504 1 002', 'III/a', 'CPNS', 'Perencana Ahli Pertama (CPNS)', true),
  (31, 'TUTI HAERANI S.Pd', '19961111 202504 2 009', 'III/a', 'CPNS', 'Perencana Ahli Pertama (CPNS)', true),
  (32, 'NUZUL RAHMAT, S.Pd', '19980115 202504 1 005', 'III/a', 'CPNS', 'Perencana Ahli Pertama (CPNS)', true),
  (33, 'SUTARNI S.I.Kom.', '19980606 202504 2 007', 'III/a', 'CPNS', 'Perencana Ahli Pertama (CPNS)', true),
  (34, 'LA ODE MUHAMMAD DZULVICAR BASRI S.T', '19990302 202504 1 003', 'III/a', 'CPNS', 'Perencana Ahli Pertama (CPNS)', true),
  (35, 'RACHMAD ILMAWAN. T S.Pd', '19990518 202504 1 007', 'III/a', 'CPNS', 'Perencana Ahli Pertama (CPNS)', true),
  (36, 'I GUSTI NGURAH PUTU SUTAMA ARI S.Pd', '19990712 202504 1 006', 'III/a', 'CPNS', 'Perencana Ahli Pertama (CPNS)', true),
  (37, 'DINDA NUR ANNA, S.Pd', '20020103 202504 2 003', 'III/a', 'CPNS', 'Perencana Ahli Pertama (CPNS)', true),
  (38, 'FANIA PUTRI FAIZA ATTAMIMI, S.Pd', '20030306 202504 2 002', 'III/a', 'CPNS', 'Perencana Ahli Pertama (CPNS)', true),
  (39, 'LA ODE MUHAMMAD AZIZ RIDAWATAH, S.I.Kom', '19930114 202504 1 001', 'III/a', 'CPNS', 'Analis Kebijakan Ahli Pertama (CPNS)', true),
  (40, 'VALINTIA MONIKA S.I.Kom', '19940702 202504 2 006', 'III/a', 'CPNS', 'Analis Kebijakan Ahli Pertama (CPNS)', true),
  (41, 'MUHAMMAD ADITYA MARYADI S.I.Kom', '19961028 202504 1 003', 'III/a', 'CPNS', 'Analis Kebijakan Ahli Pertama (CPNS)', true),
  (42, 'ALYA PUTRI BALGIS S.Kom', '19980815 202504 2 009', 'III/a', 'CPNS', 'Analis Kebijakan Ahli Pertama (CPNS)', true),
  (43, 'DIDIK RAHMADI S.M.', '19981129 202504 1 005', 'III/a', 'CPNS', 'Analis Kebijakan Ahli Pertama (CPNS)', true),
  (44, 'AFRY ANTO S.I.Kom.', '19980420 202504 1 005', 'III/a', 'CPNS', 'Analis Kebijakan Ahli Pertama (CPNS)', true),
  (45, 'MUH. IRVHAN AL ANSHAR JUNAIT S.T', '19990319 202504 1 003', 'III/a', 'CPNS', 'Analis Kebijakan Ahli Pertama (CPNS)', true),
  (46, 'ARIF ASBULLAH S.M.', '20000911 202504 1 008', 'III/a', 'CPNS', 'Analis Kebijakan Ahli Pertama (CPNS)', true),
  (47, 'I KADEK ADI KUSUMA KENCANA, S.M', '20010424 202504 1 006', 'III/a', 'CPNS', 'Analis Kebijakan Ahli Pertama (CPNS)', true),
  (48, 'NURUL FITRI ARTISYAH, S.I.Kom', '20021116 202504 2 005', 'III/a', 'CPNS', 'Analis Kebijakan Ahli Pertama (CPNS)', true),
  (49, 'HARMAWATI HASANI, SE', '19690408 202521 2 002', '-', 'PPPK', 'Penata Layanan Operasional (PPPK)', true),
  (50, 'HARIYATI, SE., M.M', '19930504 202521 2 030', '-', 'PPPK', 'Penata Layanan Operasional (PPPK)', true),
  (51, 'LIA SELVIANA, SE.', '19930509 202521 2 034', '-', 'PPPK', 'Penata Layanan Operasional (PPPK)', true),
  (52, 'MUH. IKHWANULLAH, SKM', '19770606 202521 1 022', '-', 'PPPK', 'Penata Layanan Operasional (PPPK)', true)
on conflict (nip) do update set
  urutan   = excluded.urutan,
  nama     = excluded.nama,
  golongan = excluded.golongan,
  kategori = excluded.kategori,
  jabatan  = excluded.jabatan,
  aktif    = true;

-- 2) Bersihkan data CONTOH lama yang tidak ada di daftar di atas.
--    Hanya menghapus baris yang BELUM dipakai sama sekali (belum punya PIN,
--    belum punya tanda tangan, belum ada riwayat kehadiran) — aman.
delete from staf s
where s.nip not in ('19671010 199503 1 006', '19690517 199003 1 011', '19680908 199703 2 003', '19841002 200212 2 002', '19731231 200804 2 001', '19750415 201101 2 002', '19880523 200701 1 004', '19780505 200901 2 001', '19900620 201010 1 001', '19910701 201406 1 001', '19710604 200604 2 022', '19791008 200604 1 008', '19710206 200801 1 009', '19750612 200801 2 014', '19720706 200701 2 021', '19800526 201001 2 003', '19740219 200701 2 013', '19740330 199402 2 003', '19840807 201001 2 001', '19800301 201001 1 001', '19910613 201502 2 002', '19830807 200901 2 001', '19760917 200801 1 007', '19770219 201408 2 001', '19840818 201903 2 013', '19920216 201903 1 012', '19800304 201408 2 001', '19870926 200604 2 005', '19911223 202504 1 002', '19920212 202504 1 002', '19961111 202504 2 009', '19980115 202504 1 005', '19980606 202504 2 007', '19990302 202504 1 003', '19990518 202504 1 007', '19990712 202504 1 006', '20020103 202504 2 003', '20030306 202504 2 002', '19930114 202504 1 001', '19940702 202504 2 006', '19961028 202504 1 003', '19980815 202504 2 009', '19981129 202504 1 005', '19980420 202504 1 005', '19990319 202504 1 003', '20000911 202504 1 008', '20010424 202504 1 006', '20021116 202504 2 005', '19690408 202521 2 002', '19930504 202521 2 030', '19930509 202521 2 034', '19770606 202521 1 022')
  and s.pin_hash is null
  and s.tanda_tangan is null
  and not exists (select 1 from kehadiran_staf k where k.staf_id = s.id);

-- 3) Identitas Kepala Biro (untuk blok tanda tangan cetak Daftar Hadir)
update org_settings set
  nama_biro      = 'Biro Administrasi Pembangunan',
  kepala_nama    = 'LM. MARTOSISWOYO, SE., M.Si',
  kepala_pangkat = 'Pembina Utama Muda, IV/c',
  kepala_nip     = '19671010 199503 1 006'
where id = 1;

-- Cek hasil: harus 52 baris
-- select count(*) from staf;
