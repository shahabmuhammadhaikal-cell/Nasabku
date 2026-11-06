# Nasabku

Aplikasi web silsilah keluarga: catat anggota keluarga, hubungan orang tua–anak, dan lihat pohon keturunan
maupun leluhurnya.

- **Backend**: Node.js + Express 5 + TypeScript, basis data SQLite lewat modul bawaan `node:sqlite`.
- **Frontend**: HTML/CSS/JavaScript murni (ES modules), disajikan oleh server yang sama — tanpa framework,
  tanpa langkah build terpisah, tanpa SDK klien.
- **Tanpa layanan eksternal**: tidak ada Firebase, tidak ada kunci GCP, tidak ada basis data terkelola.
  Cukup `npm install`, dan aplikasi langsung berjalan.

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

Basis data dibuat otomatis di `./data/nasabku.db` (diabaikan git). Butuh **Node.js 23.4+**
(`node:sqlite` tersedia tanpa flag sejak versi itu); diuji pada Node 26.

## Konfigurasi

Semua opsional; lihat `.env.example`.

| Variabel | Bawaan | Keterangan |
| --- | --- | --- |
| `PORT` | `3000` | Port HTTP. |
| `NODE_ENV` | `development` | `production` saat deploy. |
| `DATABASE_PATH` | `./data/nasabku.db` | Lokasi berkas SQLite. |
| `SESSION_TTL_HARI` | `30` | Umur sesi. |
| `COOKIE_SECURE` | `false` | Setel `true` bila dilayani lewat HTTPS. |

## API

Semua di bawah `/api/v1`. Sesi memakai cookie `HttpOnly` `nasabku_sesi` (token hanya disimpan sebagai
sidik SHA-256 di basis data).

| Metode | Jalur | Keterangan |
| --- | --- | --- |
| GET | `/health/live` | Liveness, tidak menyentuh basis data. |
| GET | `/health/ready` | Selalu 200, menyatakan `database: tersedia \| tidak tersedia`. |
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
  (mis. A → B → C lalu C → A) — dijaga dengan penelusuran rekursif sebelum penyimpanan.
- Tahun wafat tidak boleh lebih awal daripada tahun lahir.
- Nama kosong, email tidak sah, dan kata sandi di bawah 8 karakter ditolak dengan 422.

## Pengujian

```bash
npm run typecheck   # TypeScript strict, tanpa keluaran = lulus
npm test            # 45 uji: unit pustaka inti + integrasi seluruh alur API
```

Uji integrasi menjalankan aplikasi Express sungguhan di atas basis data `:memory:`, sehingga tidak
menyentuh berkas data Anda.

## Deploy

`render.yaml` sudah menyiapkan layanan web Node dengan health check di `/api/v1/health/live`.
Health check **tidak** memakai basis data, sehingga deploy tidak pernah tertahan oleh masalah database;
`/health/ready` tetap melaporkan keterjangkauan database tanpa menggagalkan promosi.

> **Penting soal data**: paket gratis Render tidak menyediakan disk permanen. Tanpa Persistent Disk,
> `./data/nasabku.db` hilang setiap deploy/restart. Untuk data sungguhan, pasang Persistent Disk dan
> arahkan `DATABASE_PATH` ke sana (mis. `/var/data/nasabku.db`).
