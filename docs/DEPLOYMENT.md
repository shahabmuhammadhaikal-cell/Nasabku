# Deployment — Nasabku online (Render + Firebase production)

Tujuan: mengganti Emulator Suite lokal dengan **Firebase produksi** nyata dan
meng-online-kan API di **Render** sehingga bisa diakses lewat link publik.

> Catatan jujur: fase saat ini baru backend API. Belum ada UI web, jadi yang
> "terbuka lewat link" adalah endpoint API (mis. `GET /health/live` yang
> mengembalikan JSON status).

---

## Langkah 0 — Yang sudah disiapkan di repo

- `apps/api/src/lib/firebase.ts` menerima `FIREBASE_SERVICE_ACCOUNT_JSON`
  (env var berisi **JSON service account penuh**) untuk host non-GCP.
  Bila kosong, Admin SDK jatuh ke Application Default Credentials.
- Skema env (`packages/config/src/env.ts`) sudah mendukung variabel baru
  tersebut (`default: ""` → aman dipakai bersama emulator lokal).
- Blueprint `render.yaml`: layanan web Node, build `npm ci && npm run build`,
  start `node apps/api/dist/server.js`, health check `/api/v1/health/ready`.
- Kredensial **tidak pernah** masuk repo: `.gitignore` memblokir
  `service-account*.json`, `.env`, `.firebase/`; nilai rahasia hanya lewat
  Secrets (Freebuff dan Render env var).

## Langkah 1 — Buat proyek Firebase produksi

1. Buka <https://console.firebase.google.com> → **Tambahkan proyek**
   — nama bebas, mis. `nasabku-prod`. Google Analytics boleh dinonaktifkan.
2. **Firestore Database**: `Build → Firestore Database → Create database`
   → mode **production** → lokasi `asia-southeast2` (Jakarta).
   Database wajib dibuat sebelum API start.
3. **Authentication**: `Build → Authentication → Get started`, lalu
   aktifkan metode masuk yang akan dipakai (mis. **Email/Password**).
   Endpoint `POST /auth/login` menukar ID token yang berisi dari sini.
4. **Service account**: `Project settings` (ikon roda gigi) → tab
   **Service accounts** → pilih runtime `Node.js` → tombol
   **Generate new private key** → unduh file JSON.
   ⚠️ File itu adalah kunci total atas proyek: jangan di-commit,
   jangan dikirim ke chat — simpan langsung ke Secrets (langkah 2).

## Langkah 2 — Simpan kredensial ke Secrets proyek (bukan chat/repo)

Di aplikasi Freebuff ini: **Settings → Secrets**, buat variabel-variabel ini:

| Nama variabel | Isi |
|---|---|
| `FIREBASE_PROJECT_ID` | ID proyek Firebase produksi (mis. `nasabku-prod`) |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Seluruh isi file JSON service account dari langkah 1.4 |
| `RENDER_API_KEY` | API key Render — dashboard Render → Team settings → API Keys → Create API key |
| `FIREBASE_TOKEN` (opsional) | Untuk deploy aturan/indeks Firestore dari CLI — buat lewat `firebase login:ci` di terminal Anda sendiri |

Setelah disimpan, katakan saja **"sudah"** — saya akan push kode dan deploy.

## Langkah 3 — Deploy repo ke Render

Otomatis (saya yang lakukan bila `RENDER_API_KEY` sudah di Secrets):

1. Saya push branch ini (dengan `render.yaml`) ke GitHub Anda.
2. Layanan dibuat lewat Render Blueprint API dari repo. Pertama kali,
   Render meminta otorisasi akses GitHub untuk repo `Nasabku`
   (satu tombol konfirmasi di dashboard Render).
3. Variabel `sync: false` di render.yaml diisi dari Secrets:
   `FIREBASE_PROJECT_ID`, `FIREBASE_SERVICE_ACCOUNT_JSON`, dan
   `APP_ORIGIN` (mula-mula perkiraan URL, diperbaiki setelah URL
   Render aktualnya diketahui).

Manual (tanpa API): dashboard Render → `New + → Blueprint` → pilih repo
`Nasabku` → isi nilai variabel yang `sync: false` di layar → **Deploy**.

## Langkah 4 — Verifikasi

Setelah deploy selesai (URL tampil di dashboard Render, format
`https://nasabku-api-xxxx.onrender.com`):

```bash
curl https://nasabku-api-xxxx.onrender.com/api/v1/health/live   # 200 {"data":...}
curl https://nasabku-api-xxxx.onrender.com/api/v1/health/ready  # 200 bila Firestore terjangkau
```

Bila `health/ready` 503: pastikan Firestore sudah dibuat (langkah 1.2) dan
`FIREBASE_SERVICE_ACCOUNT_JSON` tersalin utuh. Log tingkat lanjut ada di
dashboard Render → Events/Logs.

Catatan plan free Render: instance tidur setelah ~15 menit tanpa request
dan request pertama setelah tidur lambat beberapa detik. Ganti
`plan: starter` di `render.yaml` bila ingin selalu aktif.

## Langkah 5 — Deploy aturan & indeks Firestore (opsional)

Aturan Firestore (`firestore.rules`, default DENY — semua akses lewat Admin
SDK) tidak wajib di-deploy, tetapi **indeks komposit wajib** di produksi
(query `audit-events` memakai rentang kursor): jalankan di komputer Anda

```bash
sed -i 's/demo-nasabku/nasabku-prod/' .firebaserc   # atau: beri tahu saya ID proyeknya agar saya ganti
firebase deploy --only firestore:rules,firestore:indexes
```

## Referensi

- [ADR-0001 Firebase interim](adr/ADR-0001-firebase-interim.md)
- [Blueprint spec Render](https://render.com/docs/blueprint-spec)
- [Render API](https://api-docs.render.com/reference/create-service)
- [Panduan Firebase Admin SDK](https://firebase.google.com/docs/admin/setup)
