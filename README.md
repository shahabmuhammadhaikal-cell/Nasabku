# Nasabku

Aplikasi web silsilah keluarga: catat anggota keluarga, hubungan orang tua–anak, dan lihat pohon keturunan
maupun leluhurnya.

- **Backend**: Node.js + Express 5 + TypeScript, basis data **Firestore** lewat Firebase Admin SDK
  (`@google-cloud/firestore`).
- **Frontend**: HTML/CSS/JavaScript murni (ES modules), disajikan oleh server yang sama — tanpa framework,
  tanpa langkah build terpisah, tanpa SDK klien.
- **Firestore hanya diakses server.** Kredensial service account tidak pernah dikirim ke peramban, dan
  aturan Firestore bawaan menolak semua akses langsung dari klien.

## Menjalankan

```bash
npm install
npm run dev      # http://localhost:3000, memuat ulang saat berkas berubah
```

Untuk mode produksi:

```bash
npm install
npm run build    # kompilasi TypeScript ke dist/
npm start        # jalankan dist/index.js
```

Butuh **Node.js 22+**; diuji pada Node 26.

Aplikasi butuh kredensial Firestore agar bisa menyimpan data. Tanpa kredensial, server tetap hidup
(`/health/live` 200) tetapi seluruh rute data menjawab **503 `FIRESTORE_BELUM_DIKONFIGURASI`** dengan pesan
yang jelas — bukan 500 yang membingungkan.

### Mendapatkan kredensial

1. Buka [Firebase Console](https://console.firebase.google.com/) → proyek `nasabku-prod` → **Project settings**
   → **Service accounts** → **Generate new private key**. Berkas JSON itulah yang dibutuhkan.
2. Simpan isinya (seluruh JSON, satu baris) di variabel lingkungan `FIREBASE_SERVICE_ACCOUNT_JSON`.
   Di lokal, letakkan di `.env` yang tidak di-commit; di Render, masukkan sebagai **Secret**.
3. Setel `FIREBASE_PROJECT_ID=nasabku-prod` (boleh juga dibaca dari `project_id` di dalam JSON).

> Jangan pernah menempelkan isi service account di chat, commit, atau berkas yang dilacak git.

### Emulator lokal (opsional, tanpa kredensial)

```bash
export FIRESTORE_EMULATOR_HOST=localhost:8080
npm run dev
```

Bila `FIRESTORE_EMULATOR_HOST` disetel, klien otomatis memakai emulator dan tidak memerlukan service account.

## Konfigurasi

| Variabel | Bawaan | Keterangan |
| --- | --- | --- |
| `PORT` | `3000` | Port HTTP. |
| `NODE_ENV` | `development` | `production` saat deploy. |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | — | JSON service account (wajib untuk data). |
| `FIREBASE_PROJECT_ID` | dari JSON | Id proyek Firestore. |
| `FIRESTORE_EMULATOR_HOST` | — | Arahkan ke emulator untuk pengembangan lokal. |
| `SESSION_TTL_HARI` | `30` | Umur sesi. |
| `COOKIE_SECURE` | `false` | Setel `true` bila dilayani lewat HTTPS. |

## Skema Firestore

```
pengguna/{penggunaId}            { email, nama, sandiHash, dibuatPada }
emailIndex/{email}               { penggunaId }              ← keunikan email
sesi/{sha256(token)}             { penggunaId, dibuatPada, kedaluwarsaPada }
ruangKerja/{ruangKerjaId}        { nama, pemilikId, dibuatPada }
ruangKerja/{id}/orang/{orangId}  { nama, jenisKelamin, tahunLahir, tahunWafat, catatan, ... }
ruangKerja/{id}/relasi/{orangTuaId_anakId}  { orangTuaId, anakId, dibuatPada }
```

- Token sesi tidak pernah disimpan mentah: hanya sidik SHA-256 yang menjadi id dokumen `sesi`.
- Id dokumen relasi deterministik (`orangTuaId_anakId`) sehingga relasi ganda ditolak oleh Firestore sendiri.
- Kata sandi disimpan sebagai `scrypt$<garam>$<kunci>` (modul `node:crypto`, tanpa dependensi native).
- Semua kueri memakai kesetaraan satu field, jadi **tidak perlu indeks komposit**.

Aturan keamanan (`firestore.rules`) menolak seluruh akses klien; hanya Admin SDK di server yang melewatinya.
Terapkan dengan:

```bash
npx firebase-tools deploy --only firestore:rules --project nasabku-prod
```

## API

Semua di bawah `/api/v1`. Sesi memakai cookie `HttpOnly` `nasabku_sesi`.

| Metode | Jalur | Keterangan |
| --- | --- | --- |
| GET | `/health/live` | Liveness, tidak menyentuh Firestore. |
| GET | `/health/ready` | Selalu 200, menyatakan `database: tersedia \| tidak tersedia \| belum dikonfigurasi`. |
| POST | `/auth/register` | `{ email, nama, sandi }` → 201 + cookie sesi. |
| POST | `/auth/login` | `{ email, sandi }` → 200 + cookie sesi. |
| POST | `/auth/logout` | 204, sesi dihapus dan cookie dibersihkan. |
| GET | `/auth/me` | Profil pengguna pemilik sesi. |
| GET/POST | `/workspaces` | Daftar / buat ruang kerja. |
| GET/PATCH/DELETE | `/workspaces/:id` | Detail / ubah nama / hapus. |
| GET/POST | `/workspaces/:id/persons` | Daftar (dukungan `?q=` dan `?limit=`) / tambah orang. |
| GET/PATCH/DELETE | `/workspaces/:id/persons/:orangId` | Detail / ubah / hapus. |
| GET/POST | `/workspaces/:id/relations` | Daftar (`?orangId=`) / catat relasi orang tua–anak. |
| DELETE | `/workspaces/:id/relations/:relasiId` | Lepas relasi. |
| GET | `/workspaces/:id/tree/:orangId` | `?arah=turun\|naik&kedalaman=1..10` → pohon silsilah. |

Galat selalu berbentuk `{ "error": { "kode", "pesan", "rincian?" }, "idPermintaan" }`.

### Aturan yang dijaga server

- Setiap ruang kerja hanya dapat diakses pemiliknya; milik orang lain dijawab **404** agar tidak bocor.
- Relasi tidak boleh menunjuk diri sendiri, tidak boleh ganda, dan **tidak boleh membentuk lingkaran**
  (mis. A → B → C lalu C → A) — dijaga dengan penelusuran keturunan sebelum penyimpanan.
- Tahun wafat tidak boleh lebih awal daripada tahun lahir.
- Nama kosong, email tidak sah, dan kata sandi di bawah 8 karakter ditolak dengan 422.

## Pengujian

```bash
npm run typecheck   # TypeScript strict, tanpa keluaran = lulus
npm test            # unit pustaka inti + integrasi seluruh alur API
```

Uji integrasi menjalankan aplikasi Express sungguhan (lewat supertest) di atas **penyimpanan memori** yang
memenuhi antarmuka dokumen yang sama dengan Firestore. Artinya seluruh alur HTTP, validasi, isolasi antar
pengguna, deteksi siklus, dan penelusuran pohon diuji tanpa menyentuh data Firestore Anda. Adapter Firestore
sendiri diverifikasi terpisah lewat uji pemetaan jalur koleksi, dan secara live setelah kredensial terpasang.

## Deploy

`render.yaml` menyiapkan layanan web Node dengan health check di `/api/v1/health/live`. Health check
**tidak** memakai Firestore, sehingga deploy tidak pernah tertahan oleh masalah kredensial; `/health/ready`
tetap melaporkan keterjangkauan Firestore tanpa menggagalkan promosi.

Secret yang perlu diisi di dashboard Render: `FIREBASE_SERVICE_ACCOUNT_JSON` (dan `FIREBASE_PROJECT_ID`
bila tidak memakai proyek dari JSON). Data tersimpan di Firestore, jadi tidak ada disk permanen yang
dibutuhkan dan data tidak hilang saat deploy ulang.
