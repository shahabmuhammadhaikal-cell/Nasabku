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
ruangKerja/{id}/orang/{orangId}  { nama, namaLain, jenisKelamin, tanggalLahir, tempatLahir,
                                   tanggalWafat, tempatWafat, pekerjaan, tempatPemakaman,
                                   catatan, sumber, ... }
ruangKerja/{id}/relasi/{orangTuaId_anakId}  { orangTuaId, anakId, dibuatPada }
ruangKerja/{id}/pasangan/{idA_idB}          { orangAId, orangBId, tanggalMenikah,
                                             status, tanggalBerakhir, dibuatPada }
```

Tanggal disimpan **bertingkat** — `"1954"`, `"1954-06"`, atau `"1954-06-12"` — supaya leluhur yang tanggal
lengkapnya belum diketahui tetap tercatat jujur, tanpa mengarang tanggal. Dokumen lama yang hanya berisi
angka `tahunLahir`/`tahunWafat` tetap terbaca.

- Token sesi tidak pernah disimpan mentah: hanya sidik SHA-256 yang menjadi id dokumen `sesi`.
- Id dokumen relasi deterministik (`orangTuaId_anakId`) sehingga relasi ganda ditolak oleh Firestore sendiri.
- Kata sandi disimpan sebagai `scrypt$<garam>$<kunci>` (modul `node:crypto`, tanpa dependensi native).
- Semua kueri memakai kesetaraan satu field, jadi **tidak perlu indeks komposit**.

Aturan keamanan (`firestore.rules`) menolak seluruh akses klien; hanya Admin SDK di server yang melewatinya.

### Menerapkan aturan keamanan ke `nasabku-prod`

Aturan ini **belum pernah terpasang**, jadi proyek masih memakai aturan bawaan Console (bila database dibuat
dalam mode uji, klien mana pun yang punya API key masih bisa membaca/menulis sampai masa ujinya habis).
Langkah berikut dijalankan **di komputer Anda**, bukan di lingkungan tanpa peramban.

1. **Prasyarat.** Node.js 22+ dan akun Google yang punya akses ke proyek `nasabku-prod` dengan peran
   *Owner*, *Editor*, atau *Firebase Rules Admin*. Tanpa peran itu deploy akan ditolak `403`.
2. **Masuk ke Firebase.**

   ```bash
   npx firebase-tools@latest login
   ```

   Peramban terbuka; pilih akun yang punya akses proyek lalu **Allow**. Bila mesin tanpa peramban
   (SSH/server): jalankan `npx firebase-tools@latest login --no-localhost`, buka URL yang dicetak, lalu
   tempelkan kode balasan (boleh juga langsung sebagai argumen: `... login --no-localhost <kode>`).
   Untuk CI: setel `GOOGLE_APPLICATION_CREDENTIALS` ke berkas service account dan tambahkan
   `--non-interactive` (flag global, boleh diletakkan sebelum atau sesudah subperintah).
3. **Pastikan akun dan proyeknya benar.**

   ```bash
   npx firebase-tools@latest projects:list          # 'nasabku-prod' harus muncul
   npx firebase-tools@latest use nasabku-prod       # set proyek aktif untuk direktori ini
   ```

   Alias proyek sudah tersimpan di `.firebaserc` (`default: nasabku-prod`) dan `firebase.json` sudah
   menunjuk `firestore.rules`, jadi tidak perlu `firebase init` — jangan dijalankan karena bisa menimpa
   konfigurasi ini.
4. **Lihat dulu isi aturan yang akan dipasang.** `firestore.rules` sengaja menolak semua akses klien
   (`allow read, write: if false`) karena browser tidak pernah bicara langsung ke Firestore.
5. **Terapkan.**

   ```bash
   npm run deploy:rules
   ```

   Skrip itu menjalankan `npx firebase-tools@latest deploy --only firestore:rules --project nasabku-prod`
   (lihat `package.json`), jadi proyek dan berkas aturannya tidak perlu diketik ulang.

   Keluaran yang diharapkan: `✔ firestore: released rules firestore.rules to cloud.firestore`.
6. **Periksa hasilnya.**
   - **Console:** [Firebase Console](https://console.firebase.google.com/) → proyek `nasabku-prod` →
     **Firestore Database** → tab **Rules**. Isinya harus `rules_version = '2';` dengan
     `allow read, write: if false;`, dan ada keterangan waktu publikasi terbaru. Banner “mode uji” harus hilang.
   - **Lewat Rules API (opsional, butuh `gcloud`):** pastikan yang aktif benar-benar berkas di repo.
     `rulesetName` pada respons `releases` sudah berupa nama resource lengkap
     (`projects/nasabku-prod/rulesets/<uuid>`), jadi jangan menambahkan awalan proyek lagi.

     ```bash
     TOKEN="$(gcloud auth print-access-token)"
     NAMA="$(curl -s -H "Authorization: Bearer $TOKEN" \
       https://firebaserules.googleapis.com/v1/projects/nasabku-prod/releases \
       | grep -o '"rulesetName": "[^"]*"' | head -1 | cut -d'"' -f4)"
     curl -s -H "Authorization: Bearer $TOKEN" \
       "https://firebaserules.googleapis.com/v1/$NAMA" \
       | grep -c 'allow read, write: if false'   # hasil 1
     ```
   - **Aplikasi tetap jalan:** `curl -sS https://nasabku.onrender.com/api/v1/health/ready` menjawab
     `"database":"tersedia"`, lalu masuk ke aplikasi dan buka satu ruang kerja. Server memakai Admin SDK,
     yang memang melewati rules, jadi aturan ketat tidak boleh mengubah perilaku aplikasi.
   - **Catatan verifikasi:** permintaan REST tanpa kredensial ke Firestore selalu `403` baik aturan ketat
     maupun longgar, jadi `403` saja bukan bukti. Bukti yang sah adalah isi ruleset (langkah di atas) atau
     tampilan tab **Rules**.

   Perubahan aturan berlaku hingga sekitar satu menit setelah deploy.

Bila ingin menguji aturan sebelum menyentuh produksi, jalankan emulator (`firebase emulators:start --only
firestore`) dan arahkan aplikasi dengan `FIRESTORE_EMULATOR_HOST=localhost:8080`.

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
| GET/POST | `/workspaces/:id/persons` | Daftar (dukungan `?q=` yang mencari nama, nama panggilan, dan pekerjaan; juga `?limit=`) / tambah orang. |
| GET/PATCH/DELETE | `/workspaces/:id/persons/:orangId` | Detail / ubah / hapus. |
| GET/POST | `/workspaces/:id/relations` | Daftar (`?orangId=`) / catat relasi orang tua–anak. |
| DELETE | `/workspaces/:id/relations/:relasiId` | Lepas relasi. |
| GET/POST | `/workspaces/:id/partners` | Daftar (`?orangId=`) / catat pernikahan: `{ orangAId, orangBId, tanggalMenikah?, status?, tanggalBerakhir? }`. |
| PATCH | `/workspaces/:id/partners/:pasanganId` | Ubah tanggal menikah, status, atau tanggal berakhir. |
| DELETE | `/workspaces/:id/partners/:pasanganId` | Lepas hubungan pasangan. |
| GET | `/workspaces/:id/stats` | Ringkasan jumlah orang, angkatan, akar/daun, rentang tahun lahir. |
| GET | `/workspaces/:id/export` | Unduh seluruh data sebagai JSON; `?format=gedcom` untuk GEDCOM 5.5.1. |
| POST | `/workspaces/:id/import` | `{ gedcom }` → menambah orang dan relasi dari berkas GEDCOM. |
| GET | `/workspaces/:id/tree/:orangId` | `?arah=turun\|naik&kedalaman=1..10` → pohon silsilah. |

Galat selalu berbentuk `{ "error": { "kode", "pesan", "rincian?" }, "idPermintaan" }`.

### GEDCOM

Ekspor `?format=gedcom` menghasilkan berkas **GEDCOM 5.5.1** (`.ged`) yang bisa dibuka di aplikasi silsilah
lain: individu (nama, nama panggilan, jenis kelamin, lahir/wafat beserta tempat, pemakaman, pekerjaan,
catatan, sumber), keluarga (HUSB/WIFE/CHIL), serta tanggal bertingkat yang dipetakan ke `1954`,
`JUN 1954`, dan `12 JUN 1954`.

Impor menerima berkas GEDCOM dengan aturan yang sama: maksimal 2000 orang per impor, tanggal yang tidak
sah **diabaikan** (tidak dikarang), relasi yang membentuk lingkaran dilewati, dan hasilnya dilaporkan di
`{ impor: { orang, digabung, relasi, relasiDilewati, tanggalDiabaikan, namaDiabaikan } }`.

Pernikahan ikut diekspor sebagai `FAM` dengan `HUSB`/`WIFE` dan `MARR`/`DATE` — termasuk pasangan yang belum
memiliki anak tercatat — lalu dikembalikan menjadi hubungan pasangan beserta tanggal menikahnya saat diimpor.
`FAM` diurutkan menurut tanggal pernikahan.

Status pernikahan ditulis sebagai tag khusus `_STAT` (`menikah`, `cerai`, `meninggal`) yang diabaikan dengan
aman oleh aplikasi lain. Perceraian memakai tag baku `DIV` beserta `DATE` tanggal berakhirnya, sedangkan
pernikahan yang berakhir karena kematian memakai `_END`/`DATE` (kematiannya sendiri tetap tercatat sebagai
`DEAT` pada individu). Saat impor, `DIV` selalu dibaca sebagai status `cerai`, dan `_STAT` menentukan sisanya.

### Status pernikahan

Setiap hubungan pasangan menyimpan `status` (`menikah`, `cerai`, atau `meninggal`) dan `tanggalBerakhir`
(bertingkat seperti tanggal lain, boleh kosong). Status `menikah` selalu berarti belum berakhir, sehingga
tanggal berakhir yang dikirim untuk status itu dibuang; tanggal berakhir tidak boleh lebih awal dari tanggal
menikah. Data lama tanpa kolom ini dibaca sebagai `menikah`.

### Urutan pernikahan

Urutan pernikahan **tidak disimpan**; dihitung per orang dari tanggal pernikahannya
(`src/lib/pernikahan.ts`). Hal ini penting karena satu pernikahan bisa menjadi pernikahan ke-2 bagi suami tetapi
ke-1 bagi istri. Setiap pasangan dalam respons `/partners` membawa `urutanA` dan `urutanB` — nomor dari sisi
masing-masing orang — sehingga antarmuka bisa menampilkan keduanya. Pernikahan tanpa tanggal diletakkan paling
akhir, dan urutan yang sudah pasti tidak terpengaruh. GEDCOM 5.5.1 tidak punya tag untuk nomor pernikahan,
sehingga nomor dihitung ulang saat impor berdasarkan tanggal yang dibaca.

Impor **tidak menduplikasi**: orang yang namanya sama (tanpa peduli huruf besar/kecil, aksen, dan tanda
baca), jenis kelaminnya tidak bertentangan, dan tahun lahirnya sama dianggap orang yang sudah tercatat.
Data yang ada dipertahankan; hanya kolom yang masih kosong yang diisi dari berkas — dan tanggal yang lebih
teliti (`1954-06-12` mengalahkan `1954`) dipakai bila tahunnya sama. Jumlah yang digabung dilaporkan di
`impor.digabung`, sehingga mengimpor berkas yang sama dua kali tidak menggandakan silsilah.

### Aturan yang dijaga server

- Setiap ruang kerja hanya dapat diakses pemiliknya; milik orang lain dijawab **404** agar tidak bocor.
- Relasi tidak boleh menunjuk diri sendiri, tidak boleh ganda, dan **tidak boleh membentuk lingkaran**
  (mis. A → B → C lalu C → A) — dijaga dengan penelusuran keturunan sebelum penyimpanan.
- Tanggal wafat tidak boleh lebih awal daripada tanggal lahir; format tanggal harus tanggal kalender yang nyata.
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
