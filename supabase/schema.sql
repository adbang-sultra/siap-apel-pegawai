-- =====================================================================
-- SIAP APEL — Versi PEGAWAI — Skema Database Supabase (mandiri)
-- Khusus untuk Biro Administrasi Pembangunan Setda Provinsi Sulawesi
-- Tenggara. Jalankan file ini di SQL Editor project Supabase Anda.
-- =====================================================================
-- CATATAN KEAMANAN: login Admin & Pegawai pada skema ini adalah GERBANG
-- LEVEL APLIKASI (PIN/password diverifikasi lewat fungsi database, bukan
-- lewat Supabase Auth/JWT). Cocok untuk pemakaian internal di jaringan
-- terbatas/terpercaya. Untuk keamanan tingkat lebih tinggi (mis. dapat
-- diakses dari internet terbuka), pertimbangkan menambahkan Supabase
-- Auth + Row Level Security berbasis auth.uid().
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- Pengaturan organisasi (satu baris tetap) — identitas biro & Kepala Biro
-- dipakai untuk kop surat & blok tanda tangan pada cetak Daftar Hadir.
-- ---------------------------------------------------------------------
create table if not exists org_settings (
  id             int primary key default 1,
  nama_biro      text not null default 'Biro Administrasi Pembangunan',
  kepala_nama    text,
  kepala_pangkat text,
  kepala_nip     text,
  constraint org_settings_singleton check (id = 1)
);
insert into org_settings (id, nama_biro, kepala_nama, kepala_pangkat, kepala_nip)
values (1, 'Biro Administrasi Pembangunan', 'LM. Martosiswoyo, SE., M.Si', 'Pembina Utama Muda, IV/c', '19671010 199503 1 006')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- Akun Admin (aplikasi, bukan Supabase Auth)
-- ---------------------------------------------------------------------
create table if not exists admin_users (
  id            uuid primary key default gen_random_uuid(),
  username      text not null unique,
  password_hash text not null,
  created_at    timestamptz not null default now()
);
-- Akun admin bawaan: username "admin", password "admin123"
-- ***WAJIB DIGANTI*** lewat menu Pengaturan setelah login pertama kali.
insert into admin_users (username, password_hash)
values ('admin', crypt('admin123', gen_salt('bf')))
on conflict (username) do nothing;

-- ---------------------------------------------------------------------
-- Tabel: staf (pegawai Biro Administrasi Pembangunan)
-- qr_token dipakai sebagai kunci rahasia HMAC untuk kode QR yang
-- berputar setiap 10 detik (lihat js/staf-app.js: computeRotatingCode).
-- tanda_tangan: tanda tangan digital TERSIMPAN pada profil pegawai,
-- otomatis disalin ke catatan kehadiran saat QR berhasil di-scan.
-- ---------------------------------------------------------------------
create table if not exists staf (
  id             uuid primary key default gen_random_uuid(),
  nama           text not null,
  nip            text not null unique,
  golongan       text not null default '-',
  kategori       text not null check (kategori in ('PNS','CPNS','PPPK')) default 'PNS',
  jabatan        text not null,
  urutan         integer not null default 9999,   -- nomor urut sesuai Daftar Hadir
  qr_token       text not null unique default encode(gen_random_bytes(16), 'hex'),
  pin_hash       text,                 -- null = akun pegawai belum diaktifkan
  tanda_tangan   text,                 -- data URI PNG tanda tangan tersimpan
  aktif          boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists idx_staf_aktif on staf (aktif);
create index if not exists idx_staf_nama on staf (nama);
create unique index if not exists idx_staf_qr_token on staf (qr_token);
create unique index if not exists idx_staf_nip on staf (nip);

-- Migrasi aman dari versi skema sebelumnya (yang punya kolom "biro" wajib
-- diisi dan belum punya pin_hash/tanda_tangan) — aman dijalankan berkali-kali.
alter table staf add column if not exists pin_hash text;
alter table staf add column if not exists tanda_tangan text;
alter table staf add column if not exists urutan integer not null default 9999;
do $$
begin
  if exists (select 1 from information_schema.columns where table_name = 'staf' and column_name = 'biro') then
    execute 'alter table staf alter column biro drop not null';
    execute 'alter table staf alter column biro set default ''Biro Administrasi Pembangunan''';
  end if;
end $$;

-- Kolom turunan aman-diakses klien: TRUE/FALSE saja, tanpa pernah
-- mengekspos isi pin_hash (hash bcrypt) itu sendiri ke browser.
do $$
begin
  if not exists (select 1 from information_schema.columns where table_name = 'staf' and column_name = 'punya_pin') then
    alter table staf add column punya_pin boolean generated always as (pin_hash is not null) stored;
  end if;
end $$;

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_staf_updated_at on staf;
create trigger trg_staf_updated_at
  before update on staf
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------
-- Tabel: kehadiran_staf
-- HADIR / HADIR_P3K hanya tercatat lewat scan QR (metode='QR') dengan
-- tanda tangan otomatis tersalin dari profil. Status lain (tidak hadir)
-- diinput manual oleh Admin beserta alasannya, tanpa tanda tangan.
-- ---------------------------------------------------------------------
create table if not exists kehadiran_staf (
  id            uuid primary key default gen_random_uuid(),
  tanggal       date not null,
  jenis_apel    text not null check (jenis_apel in ('Apel Pagi','Apel Sore')),
  staf_id       uuid not null references staf(id) on delete cascade,
  status        text not null check (status in ('HADIR','IZIN','SAKIT','CUTI','TK','TUGAS_LUAR','HADIR_P3K','CUTI_P3K')),
  keterangan    text default '',
  tanda_tangan  text,
  metode        text not null default 'MANUAL' check (metode in ('MANUAL','QR')),
  waktu_input   timestamptz not null default now(),
  unique (tanggal, jenis_apel, staf_id)
);

create index if not exists idx_kehstaf_tanggal on kehadiran_staf (tanggal);
create index if not exists idx_kehstaf_staf on kehadiran_staf (staf_id);
create index if not exists idx_kehstaf_jenis on kehadiran_staf (jenis_apel);

-- ---------------------------------------------------------------------
-- Row Level Security
-- Tabel dibuka untuk anon key (akses sebenarnya diatur oleh gerbang
-- login level aplikasi). password_hash & pin_hash TIDAK PERNAH dibaca
-- langsung oleh klien — hanya diverifikasi lewat fungsi security definer
-- di bawah, yang mengembalikan hasil boolean/record tanpa hash-nya.
-- ---------------------------------------------------------------------
alter table org_settings enable row level security;
alter table staf enable row level security;
alter table kehadiran_staf enable row level security;
alter table admin_users enable row level security;

drop policy if exists "org_select" on org_settings;
create policy "org_select" on org_settings for select using (true);
drop policy if exists "org_write" on org_settings;
create policy "org_write" on org_settings for all using (true) with check (true);

drop policy if exists "staf_select" on staf;
create policy "staf_select" on staf for select using (true);
drop policy if exists "staf_write" on staf;
create policy "staf_write" on staf for all using (true) with check (true);

drop policy if exists "kehstaf_select" on kehadiran_staf;
create policy "kehstaf_select" on kehadiran_staf for select using (true);
drop policy if exists "kehstaf_write" on kehadiran_staf;
create policy "kehstaf_write" on kehadiran_staf for all using (true) with check (true);

-- admin_users: TIDAK ADA select/write policy untuk anon — tabel ini hanya
-- bisa diakses lewat fungsi security definer di bawah (RLS default: tolak semua).

-- ---------------------------------------------------------------------
-- Fungsi login & aktivasi (security definer — dipanggil dengan anon key,
-- tapi berjalan dengan hak akses pemilik fungsi sehingga bisa membaca
-- password_hash/pin_hash secara aman tanpa mengeksposnya ke klien).
-- ---------------------------------------------------------------------

-- Login Admin
create or replace function admin_login(p_username text, p_password text)
returns table(ok boolean, username text)
language plpgsql security definer as $$
begin
  if exists (
    select 1 from admin_users au
    where au.username = p_username and au.password_hash = crypt(p_password, au.password_hash)
  ) then
    return query select true, p_username;
  else
    return query select false, null::text;
  end if;
end;
$$;
revoke all on function admin_login(text,text) from public;
grant execute on function admin_login(text,text) to anon, authenticated;

-- Ganti password Admin
create or replace function admin_set_password(p_username text, p_old_password text, p_new_password text)
returns boolean
language plpgsql security definer as $$
begin
  if exists (
    select 1 from admin_users
    where username = p_username and password_hash = crypt(p_old_password, password_hash)
  ) then
    update admin_users set password_hash = crypt(p_new_password, gen_salt('bf')) where username = p_username;
    return true;
  end if;
  return false;
end;
$$;
revoke all on function admin_set_password(text,text,text) from public;
grant execute on function admin_set_password(text,text,text) to anon, authenticated;

-- Login Pegawai (NIP + PIN). Mengembalikan data profil (tanpa pin_hash).
create or replace function staf_login(p_nip text, p_pin text)
returns table(id uuid, nama text, nip text, golongan text, kategori text, jabatan text, aktif boolean, qr_token text, tanda_tangan text)
language plpgsql security definer as $$
begin
  return query
    select s.id, s.nama, s.nip, s.golongan, s.kategori, s.jabatan, s.aktif, s.qr_token, s.tanda_tangan
    from staf s
    where s.nip = p_nip and s.pin_hash is not null and s.pin_hash = crypt(p_pin, s.pin_hash);
end;
$$;
revoke all on function staf_login(text,text) from public;
grant execute on function staf_login(text,text) to anon, authenticated;

-- Cek status NIP untuk layar aktivasi (tanpa membocorkan data pegawai lain)
create or replace function staf_check_nip(p_nip text)
returns table(found boolean, nama text, sudah_aktif boolean)
language plpgsql security definer as $$
begin
  if exists (select 1 from staf where nip = p_nip) then
    return query select true, s.nama, (s.pin_hash is not null) from staf s where s.nip = p_nip;
  else
    return query select false, null::text, false;
  end if;
end;
$$;
revoke all on function staf_check_nip(text) from public;
grant execute on function staf_check_nip(text) to anon, authenticated;

-- Aktivasi akun pegawai: set PIN pertama kali (hanya jika belum aktif)
create or replace function staf_activate(p_nip text, p_pin text)
returns boolean
language plpgsql security definer as $$
begin
  update staf set pin_hash = crypt(p_pin, gen_salt('bf'))
  where nip = p_nip and pin_hash is null;
  return found;
end;
$$;
revoke all on function staf_activate(text,text) from public;
grant execute on function staf_activate(text,text) to anon, authenticated;

-- Ganti PIN pegawai (perlu PIN lama)
create or replace function staf_set_pin(p_nip text, p_pin_lama text, p_pin_baru text)
returns boolean
language plpgsql security definer as $$
begin
  if exists (select 1 from staf where nip = p_nip and pin_hash = crypt(p_pin_lama, pin_hash)) then
    update staf set pin_hash = crypt(p_pin_baru, gen_salt('bf')) where nip = p_nip;
    return true;
  end if;
  return false;
end;
$$;
revoke all on function staf_set_pin(text,text,text) from public;
grant execute on function staf_set_pin(text,text,text) to anon, authenticated;

-- Admin: reset PIN pegawai (mis. pegawai lupa PIN) — mengosongkan pin_hash
-- supaya pegawai bisa aktivasi ulang lewat layar "Aktivasi Akun".
create or replace function admin_reset_pin(p_staf_id uuid)
returns boolean
language plpgsql security definer as $$
begin
  update staf set pin_hash = null where id = p_staf_id;
  return found;
end;
$$;
revoke all on function admin_reset_pin(uuid) from public;
grant execute on function admin_reset_pin(uuid) to anon, authenticated;

-- Waktu server (milidetik epoch). Dipakai kedua sisi (HP pegawai & perangkat
-- Admin) untuk menyamakan jam, sehingga kode QR berputar tetap valid walaupun
-- jam HP dan jam komputer berbeda.
create or replace function server_time_ms()
returns bigint
language sql stable as $$
  select (extract(epoch from clock_timestamp()) * 1000)::bigint;
$$;
revoke all on function server_time_ms() from public;
grant execute on function server_time_ms() to anon, authenticated;

-- ---------------------------------------------------------------------
-- Data awal: 52 pegawai Biro Administrasi Pembangunan
-- (sesuai Daftar Hadir; kolom "urutan" menjaga urutan seperti di formulir)
-- ---------------------------------------------------------------------
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
on conflict (nip) do nothing;
