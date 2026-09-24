# SIAP APEL — Versi Pegawai

Aplikasi absensi Apel Pagi/Sore untuk pegawai PNS, CPNS, dan PPPK — Sekretariat Daerah Provinsi Sulawesi Tenggara. Dilengkapi tanda tangan digital, absen via scan QR, dan siap dipasang sebagai aplikasi mobile (PWA).

Situs statis (HTML/CSS/JS, tanpa proses build) yang terhubung langsung ke **Supabase**, siap di-deploy ke **Vercel**. Aplikasi ini berdiri sendiri — tidak bergantung pada aplikasi/proyek lain.

## Struktur folder

```
siap-apel-pegawai/
├─ index.html             Halaman utama aplikasi
├─ manifest.webmanifest    Manifest PWA (agar bisa di-install ke HP)
├─ sw.js                   Service worker (app-shell caching)
├─ css/
│  ├─ styles.css            Styling inti
│  └─ staf.css              Komponen khusus: scanner, tanda tangan, kartu QR, cetak Daftar Hadir
├─ js/
│  ├─ config.js              Kredensial koneksi Supabase (WAJIB diisi)
│  ├─ supabase-init.js       Inisialisasi client Supabase
│  ├─ staf-db.js              Lapisan akses data
│  ├─ signature-pad.js         Komponen tanda tangan digital (canvas)
│  └─ staf-app.js              Logika UI aplikasi
├─ assets/                  Logo & ikon aplikasi
├─ supabase/schema.sql      Skrip SQL pembuatan tabel + data awal
├─ vercel.json              Konfigurasi deploy Vercel
└─ README.md
```

## 1. Menyiapkan database Supabase

1. Buat akun/project baru di [supabase.com](https://supabase.com) (boleh project yang sama dengan aplikasi lain, boleh juga terpisah — aplikasi ini tidak bergantung pada skema apa pun selain miliknya sendiri).
2. Masuk ke project Anda → **SQL Editor** → **New query**.
3. Salin seluruh isi file `supabase/schema.sql`, tempel, lalu **Run**.
   - Membuat tabel `biro` (termasuk identitas Kepala Biro untuk cetak), `staf`, `kehadiran_staf` (dengan kolom tanda tangan digital & kode QR unik per pegawai), RLS, dan data contoh.
4. Buka **Project Settings → API**. Catat **Project URL** dan **anon / public key**.

## 2. Menghubungkan aplikasi ke Supabase

Buka `js/config.js` dan isi:

```js
window.SIAP_APEL_CONFIG = {
  SUPABASE_URL: 'https://xxxxxxxx.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOi........',
};
```

## 3. Menjalankan secara lokal (opsional)

```bash
npx serve .
```
Buka `http://localhost:3000`. Catatan: fitur **scan kamera QR** butuh konteks aman (`https://` atau `localhost`) — pada `localhost` biasanya sudah otomatis diizinkan browser.

## 4. Deploy ke Vercel

```bash
npm install -g vercel
cd siap-apel-pegawai
vercel
vercel --prod
```
Atau import folder ini sebagai project baru lewat dashboard Vercel (preset **Other**, tanpa build command). Vercel otomatis menyediakan HTTPS, yang diperlukan agar fitur kamera/scan QR berfungsi.

## 5. Menyiapkan data setelah deploy

1. Buka **Data Pegawai** → tambahkan/sesuaikan daftar pegawai (nama, NIP, golongan, kategori PNS/CPNS/PPPK, biro, jabatan).
2. Kode QR tiap pegawai otomatis dibuat oleh database. Cetak lewat **Kartu QR Pegawai → Cetak Semua Kartu**, lalu bagikan/laminating ke masing-masing pegawai.
3. Isi identitas Kepala Biro di **Pengaturan → Identitas Kepala Biro** (nama, pangkat/golongan, NIP) agar blok tanda tangan pada cetak Daftar Hadir terisi otomatis.

## 6. Fitur utama

- **Tanda tangan digital** — pegawai menandatangani kehadirannya langsung di layar (canvas, mendukung jari/mouse) saat status Hadir / Hadir P3K.
- **Absen via QR Code** — tiap pegawai punya kartu QR unik. Saat apel, buka **Absen Kehadiran → Scan Kartu QR**, kamera mengenali pegawai secara otomatis, tinggal pilih status & tanda tangan.
- **Absen manual** tetap tersedia (cari nama dari daftar) sebagai alternatif bila kamera tidak dipakai.
- **Aplikasi mobile (PWA)** — bisa "Add to Home Screen" di HP (Android/iOS) dan terbuka seperti aplikasi native, lengkap dengan ikon.
- **Cetak Daftar Hadir** mengikuti format formulir fisik "DAFTAR HADIR PNS, CPNS DAN PPPK" per-biro: kop surat, baris Hari/Tanggal & Apel, tabel No/Nama+NIP/Gol/Jabatan/Tanda Tangan (menampilkan tanda tangan digital jika sudah absen, atau titik-titik kosong jika belum), rekap jumlah per status, dan blok tanda tangan Kepala Biro.
- **Rekap rentang tanggal** + cetak rekap ringkas.
- Perubahan data dari perangkat lain otomatis memperbarui Dashboard (Supabase Realtime).

## 7. Keamanan & catatan

- RLS pada `schema.sql` mengizinkan baca & tulis oleh siapa pun yang memegang anon key — cocok untuk aplikasi internal tanpa login. Untuk akses lebih luas, tambahkan Supabase Auth dan sesuaikan kebijakan RLS.
- Menghapus data pegawai akan ikut menghapus seluruh riwayat kehadiran & tanda tangannya (`ON DELETE CASCADE`). Gunakan tombol **Nonaktifkan** bila hanya ingin menghentikan pencatatan tanpa kehilangan riwayat.
- Kode QR (`qr_token`) bisa dibuat ulang kapan saja dari menu Kartu QR / Data Pegawai bila kartu hilang atau ingin dinonaktifkan — kartu lama otomatis tidak berlaku lagi setelah token diganti.
