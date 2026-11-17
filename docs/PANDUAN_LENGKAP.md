# PANDUAN KONFIGURASI, DEPLOYMENT, PENGUJIAN & BUILD APK ANDROID — BENGKEL MOTOR

## 1. Struktur Proyek
- `index.html` + `src/styles/main.css` + `src/main.js` + `src/views/*.js`: Aplikasi Web HTML5, CSS3, dan JavaScript Murni (Chart.js terintegrasi).
- `server.ts` + `server/db.ts` + `server/routes.ts` + `server/seed.ts`: Server Express + database 39 tabel dengan proteksi password `scrypt`, RBAC, Lock mutex, dan idempotency key.
- `gas/Code.gs`, `gas/appsscript.json`, `gas/Index.html`: Paket siap-pasang untuk Google Apps Script + Google Sheets (39 sheet terpisah) + Google Drive.
- `android-webview/`: Paket Android Studio WebView (`AndroidManifest.xml`, `build.gradle`, `MainActivity.java`, `activity_main.xml`).

---

## 2. Konfigurasi & Deployment ke Google Apps Script + Google Sheets + Google Drive
1. Buka Google Drive dan buat **Google Sheets baru** bernama `DATABASE_BENGKEL_MOTOR`.
2. Dari menu Google Sheets, buka **Extensions -> Apps Script**.
3. Salin isi `gas/appsscript.json` ke manifest proyek (aktifkan tampilan file manifest di *Project Settings -> Show "appsscript.json"*).
4. Salin isi `gas/Code.gs` ke `Code.gs`.
5. Buat file HTML baru bernama `Index`, `Styles`, dan `Scripts`, lalu tempelkan konten HTML/CSS/JS aplikasi.
6. Di editor Apps Script, pilih fungsi `setupDatabase` lalu klik **Run**. Berikan izin akses **Google Sheets** dan **Google Drive**.
   - Fungsi `setupDatabase()` otomatis membuat **39 Sheet** beserta header kolom, peran RBAC default, dan akun `superadmin` (password awal: `bengkel123`).
7. Klik **Deploy -> New deployment -> Web app**:
   - Execute as: **Me**
   - Who has access: **Anyone** (autentikasi tetap aman karena memakai sistem login internal + SHA-256 + session token).
8. Salin URL Web App (`https://script.google.com/macros/s/.../exec`).

---

## 3. Pengujian Alur Bisnis End-to-End
1. **Login & RBAC**: Uji login menggunakan `superadmin`, `owner`, `admin`, `kasir`, `mekanik`, dan `pelanggan` (kata sandi: `bengkel123`). Pastikan Mekanik hanya melihat WO miliknya dan Pelanggan hanya melihat data kendaraan/servis miliknya.
2. **Penerimaan Kendaraan & Work Order**: Buat penerimaan servis baru -> cek nomor WO & Antrean terbuat otomatis -> ubah status WO & tambahkan sparepart/bahan -> konfirmasi pemakaian part (stok sparepart berkurang 1x).
3. **Kasir POS (Tunai & QRIS)**: Muat WO tadi ke POS -> verifikasi stok part WO TIDAK terpotong dua kali -> uji pembayaran **TUNAI** (kembalian / sebagian piutang) dan **QRIS** (status awal wajib *Menunggu Pembayaran*, baru lunas setelah dikonfirmasi).
4. **Pembelian & Penerimaan Barang**: Buat PO status `Dipesan` (stok belum bertambah) -> buka Riwayat Pembelian -> klik **Terima Barang** (stok bertambah sesuai jumlah diterima dan sisa kredit masuk ke Utang Supplier).
5. **Tutup Kas & Laba Rugi**: Buka `Tutup Kas`, hitung selisih kas, lalu buka `Laporan -> Laba Rugi` dan uji ekspor CSV, Excel, serta Cetak PDF.

---

## 4. Mengemas Menjadi APK Android (Android Studio WebView)
1. Buka **Android Studio** -> *New Project -> Empty Views Activity* (Java).
2. Atur Application Name: **BENGKEL MOTOR**, Package name: `id.bengkelmotor.pos`, Minimum SDK: API 24.
3. Ganti file proyek dengan berkas dari folder `android-webview/`:
   - `app/src/main/AndroidManifest.xml`
   - `app/build.gradle`
   - `app/src/main/res/layout/activity_main.xml`
   - `app/src/main/java/id/bengkelmotor/pos/MainActivity.java`
4. Pada `MainActivity.java`, ganti nilai `APP_URL` dengan URL Web App Google Apps Script (`/exec`) atau URL server hosting Anda.
5. Klik **Build -> Build Bundle(s) / APK(s) -> Build APK(s)** untuk mode debug, atau **Generate Signed Bundle / APK** untuk rilis Play Store / distribusi internal bengkel.
