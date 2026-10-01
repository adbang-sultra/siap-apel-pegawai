# SIAP APEL — Versi Pegawai (Biro Administrasi Pembangunan)

Aplikasi absensi Apel Pagi/Sore khusus pegawai **Biro Administrasi Pembangunan**, Sekretariat Daerah Provinsi Sulawesi Tenggara. Dua level akses (Admin & Pegawai), absen lewat kode QR yang **berputar setiap 10 detik**, tanda tangan digital tersimpan di profil pegawai, dan siap dipasang sebagai aplikasi mobile (PWA).

Situs statis (HTML/CSS/JS, tanpa proses build) yang terhubung langsung ke **Supabase**, siap di-deploy ke **Vercel**. Berdiri sendiri — tidak bergantung pada aplikasi/proyek lain.

## Struktur folder

```
siap-apel-pegawai/
├─ index.html             Halaman utama (login + panel Admin + panel Pegawai)
├─ manifest.webmanifest    Manifest PWA
├─ sw.js                   Service worker (app-shell caching)
├─ css/
│  ├─ styles.css            Styling inti
│  └─ staf.css              Login, panel Admin/Pegawai, QR berputar, cetak Daftar Hadir
├─ js/
│  ├─ config.js              Kredensial koneksi Supabase (WAJIB diisi)
│  ├─ supabase-init.js       Inisialisasi client Supabase
│  ├─ staf-db.js              Lapisan akses data + fungsi login
│  ├─ signature-pad.js         Komponen tanda tangan digital (canvas)
│  └─ staf-app.js              Logika UI, QR berputar (HMAC), scan kontinu
├─ assets/                  Logo & ikon aplikasi
├─ supabase/
│  ├─ schema.sql             Tabel, RLS, dan fungsi login (security definer)
│  └─ data_pegawai.sql        Impor 52 pegawai Biro Administrasi Pembangunan (opsional)
├─ vercel.json              Konfigurasi deploy Vercel
└─ README.md
```

## 1. Menyiapkan database Supabase

1. Buat/pakai project di [supabase.com](https://supabase.com).
2. **SQL Editor → New query** → salin seluruh isi `supabase/schema.sql` → **Run**.
   - Membuat tabel `org_settings`, `admin_users`, `staf`, `kehadiran_staf`, RLS, fungsi login, fungsi `server_time_ms()` (penyamaan jam untuk QR berputar), dan **52 data pegawai Biro Administrasi Pembangunan** langsung terisi (sesuai Daftar Hadir fisik).
   - **Aman dijalankan ulang / di project yang sudah pernah dipakai versi sebelumnya** — skrip ini memakai `IF NOT EXISTS` dan migrasi otomatis untuk kolom baru (termasuk kolom urutan pegawai).
3. **Sudah pernah pakai versi sebelumnya dan tidak ingin data lama tertimpa?** Jalankan `supabase/data_pegawai.sql` sebagai gantinya (setelah `schema.sql`) — file ini meng-**upsert** 52 pegawai berdasarkan NIP (tidak mengubah PIN/tanda tangan/QR yang sudah dipakai pegawai) dan otomatis membersihkan data contoh lama yang belum pernah dipakai sama sekali.
4. **Project Settings → API** → catat **Project URL** dan **anon / public key**.

## 2. Menghubungkan aplikasi ke Supabase

Isi `js/config.js`:
```js
window.SIAP_APEL_CONFIG = {
  SUPABASE_URL: 'https://xxxxxxxx.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOi........',
};
```

## 3. Deploy ke Vercel

```bash
npm install -g vercel
cd siap-apel-pegawai
vercel
vercel --prod
```
Atau import folder ini sebagai project baru lewat dashboard Vercel (preset **Other**, tanpa build command). Vercel otomatis menyediakan **HTTPS**, wajib untuk fitur kamera (scan QR).

## 4. Login pertama kali

**Admin** — akun bawaan:
- Username: `admin`
- Password: `admin123`

⚠️ **Segera ganti password ini** lewat menu *Pengaturan → Ganti Password Admin* setelah login pertama kali.

**Pegawai** — setiap pegawai yang sudah didaftarkan Admin di *Data Pegawai* perlu **mengaktifkan akun** sendiri sekali saja:
1. Buka tab **Pegawai** di halaman login → **"Belum punya PIN? Aktivasi akun pertama kali"**.
2. Masukkan NIP → sistem mengenali nama pegawai (harus sudah didaftarkan Admin lebih dulu) → buat PIN (angka, minimal 4 digit).
3. Setelah aktif, pegawai login dengan NIP + PIN tersebut kapan pun.

## 5. Alur pemakaian

**Pegawai** (login sendiri, di HP masing-masing):
1. Tab **Profil** — lengkapi/perbarui golongan, kategori, jabatan; ganti PIN bila perlu.
2. Tab **Tanda Tangan** — tanda tangan sekali dan simpan. Tanda tangan ini otomatis dipakai setiap hari saat QR di-scan — **tidak perlu tanda tangan ulang setiap apel**.
3. Tab **QR Saya** — tunjukkan QR yang tampil di layar ke kamera Admin saat apel. QR ini **berganti otomatis setiap 10 detik** (ada lingkaran hitung mundur), sehingga screenshot/foto QR tidak bisa dipakai untuk titip absen di lain waktu.

**Admin** (mengoperasikan apel, biasanya di tablet/laptop/HP di lokasi apel):
1. Menu **Absen (Scan QR)** → pilih tanggal & jenis Apel → **Mulai Scan QR**.
2. Kamera tetap menyala dan otomatis mencatat **Hadir** setiap kali berhasil membaca QR pegawai (dengan tanda tangan tersimpan pegawai ikut tersalin), lalu siap memindai pegawai berikutnya tanpa perlu dibuka ulang.
3. Untuk pegawai yang tidak hadir (izin/sakit/cuti/tugas luar/dsb.), gunakan tombol **Tandai Tidak Hadir** → cari nama → pilih alasan → Simpan.
4. Menu **Data Pegawai** — tambah/edit pegawai, lihat status aktivasi akun & status tanda tangan, reset PIN bila pegawai lupa.
5. Menu **Rekap & Cetak** — rekap harian (format Daftar Hadir resmi, siap cetak/PDF) atau rentang tanggal.

## 6. Tentang kode QR yang berputar

Kode QR dibuat dari kombinasi `id pegawai + slot waktu (10 detik) + tanda HMAC-SHA256`, dihitung langsung di browser pegawai (Web Crypto API) dan diverifikasi di browser Admin saat scan — cocok untuk mencegah kecurangan sederhana seperti memfoto/screenshot QR untuk dipakai orang lain atau di waktu lain, karena kode kedaluwarsa dalam hitungan detik. Jam HP pegawai dan perangkat Admin **otomatis disamakan lewat waktu server** (fungsi `server_time_ms()`) setiap kali layar Scan/QR dibuka, supaya kode tidak salah dianggap kedaluwarsa hanya karena jam kedua perangkat berbeda.

**Jika kamera tidak berhasil membaca QR:**
- Pastikan situs dibuka lewat **HTTPS** (bukan `http://`) — Vercel sudah otomatis HTTPS.
- Di layar "Absen → Mulai Scan QR", ada baris kecil abu-abu (`scanDebug`) yang menampilkan status pemindaian terakhir (mis. "DITOLAK: QR kedaluwarsa…") — berguna untuk mendiagnosis kalau ada masalah.
- Naikkan kecerahan layar HP pegawai saat menunjukkan QR ke kamera.
- Di komputer/laptop tanpa kamera belakang, aplikasi otomatis memakai kamera yang tersedia (webcam depan) — tidak perlu diatur manual.
- Kode QR berganti setiap 10 detik; bila pegawai baru saja login dan langsung memindahkan HP terlalu cepat sebelum QR sempat digambar ulang, cukup tunggu QR berikutnya muncul (ada hitung mundur di layar pegawai).

## 7. Tentang hasil cetak

- **Daftar Hadir** (mode harian) dan **Rekapitulasi** (mode rentang tanggal) dicetak lengkap dengan kop surat dan blok tanda tangan Kepala Biro.
- Pada kolom **Tanda Tangan**: jika pegawai hadir (lewat scan QR), tanda tangan tersimpannya otomatis ditampilkan sebagai gambar — termasuk bila tanda tangan baru disimpan pegawai *setelah* jam absen hari itu. Jika tidak hadir, kolom menampilkan **keterangan yang diketik Admin** (bila diisi) atau nama status (Izin/Sakit/Cuti/dst.) bila keterangan dikosongkan.
- "Headers and footers" (judul halaman/URL di atas, tanggal & nomor halaman di bawah) yang muncul otomatis di sebagian hasil cetak/PDF adalah pengaturan **dialog cetak browser**, bukan bagian dari halaman ini — matikan lewat "Lainnya"/"More settings" pada jendela cetak bila tidak diinginkan.

## 8. Urutan pegawai pada daftar & cetak

Daftar pegawai (di Data Pegawai, Rekap, maupun cetak Daftar Hadir) diurutkan otomatis berdasarkan:
1. **Kategori kepegawaian** — PNS lebih dulu, lalu CPNS, lalu PPPK.
2. **Jabatan Kepala** — pemegang jabatan yang mengandung kata "Kepala" selalu ditempatkan paling atas dalam kategorinya.
3. **Golongan** — golongan lebih tinggi (mis. IV/c) lebih dulu dari yang lebih rendah (mis. III/a).
4. **Usia** — dibaca dari 8 digit pertama NIP (format tanggal lahir `YYYYMMDD`); yang lebih senior/tua lebih dulu bila golongannya sama.

Urutan ini dihitung otomatis setiap kali data ditampilkan — tidak perlu diatur manual, dan pegawai baru akan otomatis masuk ke posisi yang sesuai.

## 9. Menghapus data kehadiran

Catatan kehadiran yang salah (mis. salah scan, salah pilih status) bisa dihapus dari dua tempat:
- **Absen → Riwayat Sesi Ini** — tombol "Hapus" di samping catatan yang baru saja dibuat pada sesi berjalan.
- **Rekap & Cetak → mode Harian** — setelah klik "Tampilkan", setiap baris punya tombol "Hapus" untuk mengoreksi data hari apa pun (tidak terbatas sesi hari ini).

Penghapusan bersifat permanen (termasuk tanda tangan yang tersimpan di catatan tersebut) dan akan meminta konfirmasi terlebih dahulu.

## 10. Keamanan & catatan penting

- **Login Admin & Pegawai adalah gerbang level aplikasi**, diverifikasi lewat fungsi database (`security definer`) yang membandingkan hash bcrypt tanpa pernah mengirim hash tersebut ke browser. Ini cocok untuk pemakaian internal satu biro. Untuk akses dari jaringan terbuka/publik, pertimbangkan menambah Supabase Auth.
- Menghapus data pegawai akan ikut menghapus seluruh riwayat kehadirannya (`ON DELETE CASCADE`). Gunakan **Nonaktifkan** bila hanya ingin menghentikan pencatatan tanpa kehilangan riwayat.
- Admin dapat **reset PIN** pegawai (mis. lupa PIN) dari menu Data Pegawai — pegawai kemudian aktivasi ulang dengan PIN baru.
- Kode QR (`qr_token`) adalah rahasia per pegawai; tidak perlu dan tidak bisa dicetak sebagai kartu statis karena kodenya selalu berubah — cukup ditampilkan lewat sesi login pegawai sendiri.
- **Batasan yang perlu diketahui** tentang QR berputar: karena aplikasi ini murni statis (tanpa server backend selain Supabase), kunci rahasia di balik kode QR (`qr_token`) tersimpan di tabel `staf` yang bisa diakses lewat anon key. Ini cukup untuk mencegah kecurangan kasual (foto/screenshot QR dipakai ulang), tapi bukan pengamanan kriptografis tingkat tinggi terhadap pihak yang punya akses teknis ke anon key. Untuk kebutuhan keamanan lebih tinggi, pertimbangkan menambahkan Supabase Auth + Edge Function untuk menyimpan rahasia sepenuhnya di sisi server.
- Fitur kamera (scan QR) **memerlukan HTTPS** — otomatis tersedia di Vercel, tapi tidak akan berfungsi bila diakses lewat `http://` biasa (kecuali `localhost`).
