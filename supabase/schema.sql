-- =====================================================================
-- SIAP APEL — Versi PEGAWAI — Skema Database Supabase (mandiri)
-- Aplikasi ini berdiri sendiri (tidak bergantung pada database/skema
-- aplikasi Versi Pejabat). Jalankan file ini di project Supabase-nya
-- sendiri (boleh project yang sama maupun project Supabase terpisah).
-- =====================================================================
-- Cara pakai: buka project Supabase Anda -> SQL Editor -> New query ->
-- tempel seluruh isi file ini -> Run.
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- Tabel: biro
-- Daftar biro di lingkungan Sekretariat Daerah, termasuk identitas
-- Kepala Biro (dipakai untuk blok tanda tangan pada cetak Daftar Hadir).
-- ---------------------------------------------------------------------
create table if not exists biro (
  id             uuid primary key default gen_random_uuid(),
  nama           text not null unique,
  urutan         integer not null default 0,
  kepala_nama    text,
  kepala_pangkat text,
  kepala_nip     text,
  created_at     timestamptz not null default now()
);

insert into biro (nama, urutan) values
  ('Biro Administrasi Pimpinan', 1),
  ('Biro Umum', 2),
  ('Biro Organisasi', 3),
  ('Biro Pemerintahan', 4),
  ('Biro Kesejahteraan Rakyat', 5),
  ('Biro Hukum', 6),
  ('Biro Perekonomian', 7),
  ('Biro Administrasi Pembangunan', 8),
  ('Biro Pengadaan Barang dan Jasa Pemerintah', 9)
on conflict (nama) do nothing;

update biro set
  kepala_nama = 'LM. Martosiswoyo, SE., M.Si',
  kepala_pangkat = 'Pembina Utama Muda, IV/c',
  kepala_nip = '19671010 199503 1 006'
where nama = 'Biro Administrasi Pembangunan' and kepala_nama is null;

-- ---------------------------------------------------------------------
-- Fungsi bantu: auto-update kolom updated_at
-- ---------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ---------------------------------------------------------------------
-- Tabel: staf
-- Pegawai umum: PNS, CPNS, dan PPPK.
-- ---------------------------------------------------------------------
create table if not exists staf (
  id             uuid primary key default gen_random_uuid(),
  nama           text not null,
  nip            text not null unique,
  golongan       text not null default '-',
  kategori       text not null check (kategori in ('PNS','CPNS','PPPK')) default 'PNS',
  biro           text not null,
  jabatan        text not null,
  qr_token       text not null unique default encode(gen_random_bytes(12), 'hex'),
  aktif          boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists idx_staf_biro on staf (biro);
create index if not exists idx_staf_aktif on staf (aktif);
create index if not exists idx_staf_nama on staf (nama);
create unique index if not exists idx_staf_qr_token on staf (qr_token);

drop trigger if exists trg_staf_updated_at on staf;
create trigger trg_staf_updated_at
  before update on staf
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------
-- Tabel: kehadiran_staf
-- Status mengikuti legenda pada Daftar Hadir manual:
-- Hadir, Ijin, Sakit, Cuti, Tanpa Keterangan, Tugas Luar, Hadir P3K, Cuti P3K
-- ---------------------------------------------------------------------
create table if not exists kehadiran_staf (
  id            uuid primary key default gen_random_uuid(),
  tanggal       date not null,
  jenis_apel    text not null check (jenis_apel in ('Apel Pagi','Apel Sore')),
  staf_id       uuid not null references staf(id) on delete cascade,
  status        text not null check (status in ('HADIR','IZIN','SAKIT','CUTI','TK','TUGAS_LUAR','HADIR_P3K','CUTI_P3K')),
  keterangan    text default '',
  tanda_tangan  text,                 -- data URI PNG tanda tangan digital (opsional)
  metode        text not null default 'MANUAL' check (metode in ('MANUAL','QR')),
  waktu_input   timestamptz not null default now(),
  unique (tanggal, jenis_apel, staf_id)
);

create index if not exists idx_kehstaf_tanggal on kehadiran_staf (tanggal);
create index if not exists idx_kehstaf_staf on kehadiran_staf (staf_id);
create index if not exists idx_kehstaf_jenis on kehadiran_staf (jenis_apel);

-- ---------------------------------------------------------------------
-- Row Level Security
-- Dibuka untuk anon key (aplikasi internal tanpa login). Tambahkan
-- Supabase Auth bila akses perlu dibatasi lebih ketat.
-- ---------------------------------------------------------------------
alter table biro enable row level security;
alter table staf enable row level security;
alter table kehadiran_staf enable row level security;

drop policy if exists "biro_select" on biro;
create policy "biro_select" on biro for select using (true);
drop policy if exists "biro_write" on biro;
create policy "biro_write" on biro for all using (true) with check (true);

drop policy if exists "staf_select" on staf;
create policy "staf_select" on staf for select using (true);
drop policy if exists "staf_write" on staf;
create policy "staf_write" on staf for all using (true) with check (true);

drop policy if exists "kehstaf_select" on kehadiran_staf;
create policy "kehstaf_select" on kehadiran_staf for select using (true);
drop policy if exists "kehstaf_write" on kehadiran_staf;
create policy "kehstaf_write" on kehadiran_staf for all using (true) with check (true);

-- ---------------------------------------------------------------------
-- Data awal: Staf (contoh — silakan sesuaikan/hapus lewat aplikasi)
-- ---------------------------------------------------------------------
insert into staf (nama, nip, golongan, kategori, biro, jabatan, aktif) values
  ('LM. Martosiswoyo, SE., M.Si', '19671010 199503 1 006', 'IV/c', 'PNS', 'Biro Administrasi Pembangunan', 'Kepala Biro', true),
  ('H. Yakob Udi, SE., M.Si', '19690517 199003 1 011', 'IV/c', 'PNS', 'Biro Administrasi Pembangunan', 'Perencana Ahli Madya', true),
  ('Oni Iidrus, SP., M.Si', '19680908 199703 2 003', 'IV/c', 'PNS', 'Biro Administrasi Pembangunan', 'Analis Kebijakan Ahli Madya', true),
  ('Wa Ode Juswati, SH, MM', '19731231 200804 2 001', 'IV/a', 'PNS', 'Biro Administrasi Pembangunan', 'Analis Kebijakan Ahli Madya', true),
  ('Siti Saryani Samandi, SE., M.AP', '19780505 200901 2 001', 'III/d', 'PNS', 'Biro Administrasi Pembangunan', 'Analis Kebijakan Ahli Muda', true),
  ('La Ode Arisan, S.IP.', '19791008 200604 1 008', 'III/d', 'PNS', 'Biro Administrasi Pembangunan', 'Penelaah Teknis Kebijakan', true),
  ('Nurlina, SE.', '19800526 201001 2 003', 'III/d', 'PNS', 'Biro Administrasi Pembangunan', 'Penelaah Teknis Kebijakan', true),
  ('Bahtiar, S.Sos', '19800301 201001 1 001', 'III/c', 'PNS', 'Biro Administrasi Pembangunan', 'Penelaah Teknis Kebijakan', true),
  ('Nuryono, S.Pd', '19911223 202504 1 002', 'III/a', 'CPNS', 'Biro Administrasi Pembangunan', 'Perencana Ahli Pertama (CPNS)', true),
  ('LD Muhammad Zulfikar S.Pd', '19920212 202504 1 002', 'III/a', 'CPNS', 'Biro Administrasi Pembangunan', 'Perencana Ahli Pertama (CPNS)', true),
  ('Valintta Monika S.I.Kom', '19940702 202504 2 006', 'III/a', 'CPNS', 'Biro Administrasi Pembangunan', 'Analis Kebijakan Ahli Pertama (CPNS)', true),
  ('Muhammad Aditya Maryadi S.I.Kom', '19961028 202504 1 003', 'III/a', 'CPNS', 'Biro Administrasi Pembangunan', 'Analis Kebijakan Ahli Pertama (CPNS)', true),
  ('Alya Putri Balqis S.Kom', '19980815 202504 2 009', 'III/a', 'CPNS', 'Biro Administrasi Pembangunan', 'Analis Kebijakan Ahli Pertama (CPNS)', true),
  ('Didik Rahmadi S.M', '19981129 202504 1 005', 'III/a', 'CPNS', 'Biro Administrasi Pembangunan', 'Analis Kebijakan Ahli Pertama (CPNS)', true),
  ('Afry Anto S.I.Kom', '19980423 202504 1 005', 'III/a', 'CPNS', 'Biro Administrasi Pembangunan', 'Analis Kebijakan Ahli Pertama (CPNS)', true),
  ('Muh. Irvhan Al Anshar Junait S.T', '19990319 202504 1 003', 'III/a', 'CPNS', 'Biro Administrasi Pembangunan', 'Analis Kebijakan Ahli Pertama (CPNS)', true),
  ('Arif Asbullah S.M', '20000911 202504 1 008', 'III/a', 'CPNS', 'Biro Administrasi Pembangunan', 'Analis Kebijakan Ahli Pertama (CPNS)', true),
  ('I Kadek Adi Kusuma Kencana S.M', '20010424 202504 1 006', 'III/a', 'CPNS', 'Biro Administrasi Pembangunan', 'Analis Kebijakan Ahli Pertama (CPNS)', true),
  ('Nurul Fitri Artisyah, S.I.Kom', '19990408 202504 2 002', 'III/a', 'CPNS', 'Biro Administrasi Pembangunan', 'Analis Kebijakan Ahli Pertama (CPNS)', true),
  ('Harmawanti Hasani, SE', '19990406 202504 1 006', 'III/a', 'CPNS', 'Biro Administrasi Pembangunan', 'Analis Kebijakan Ahli Pertama (CPNS)', true),
  ('Hariyati, SE., MM', '19930509 202521 2 030', 'III/a', 'PPPK', 'Biro Administrasi Pembangunan', 'Penata Layanan Operasional (PPPK)', true),
  ('Lia Selviana, SE', '19930504 202521 2 034', 'III/a', 'PPPK', 'Biro Administrasi Pembangunan', 'Penata Layanan Operasional (PPPK)', true),
  ('Muh. Ikhwanullah, SKM', '19770906 202521 1 022', 'III/a', 'PPPK', 'Biro Administrasi Pembangunan', 'Penata Layanan Operasional (PPPK)', true)
on conflict (nip) do nothing;
