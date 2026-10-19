# ADR-0001: Backend Firebase sebagai lapisan interim

- **Status:** diterima (Fase 1) · 14 Oktober 2026
- **Keputusan pemilik produk:** “sementara menggunakan Firebase”

## Konteks

Spesifikasi induk menetapkan backend akhir **PostgreSQL + Prisma** dengan
Express terpisah dan autentikasi OIDC/session yang bebas vendor. Namun
kebutuhan iterasi cepat dan pengiriman demo mendorong pemakaian Firebase
sebagai backend sementara tanpa mengunci arsitektur ke vendor.

## Keputusan

1. **Firestore (native mode)** sebagai basis data interim. Aturan domain yang
   biasanya ditopang FK/JOIN/integritas referensial (siklus status,
   anti-duplikasi, versi, keunikan slug) **wajib** ditegakkan di lapisan
   service lewat transaksi Firestore (optimistic concurrency).
2. **Express di Cloud Functions v2** dengan prefix kontrak `/api/v1` yang
   sama seperti server Node mandiri — kontrak API tidak berubah.
3. **Firebase Auth** (email/password lebih dulu) untuk identitas.
4. **Sesi: token acak sisi-server**, disimpan ter-hash (SHA-256) di koleksi
   `sessions`, dibungkus cookie HttpOnly SameSite=Lax — **bukan**
   `createSessionCookie` Firebase Admin. Alasan: (a) pencabutan seketika
   saat logout, (b) tidak bergantung pada dukungan endpoint session-cookie
   di Emulator Suite, (c) TTL & pemeriksaan kedaluwarsa sepenuhnya di
   bawah kendali kita. Token asli tidak pernah disimpan.
5. **Kebijakan otorisasi dua lapis**: Firebase Security Rules (default
   DENY; akses klien langsung dilarang pada Fase 1) **plus** pemeriksaan
   role–izin di service API. Rules saja tidak cukup untuk logika workflow.
6. **Keunikan data via dokumen sentinel** (`workspaceSlugs/{slug}`) dalam
   transaksi — pola yang portabel ke unique index PostgreSQL.
7. **Abstraksi lapisan data**: logika domain tidak memanggil SDK Firestore
   secara tersebar; service adalah batas temporer agar migrasi ke
   PostgreSQL+Prisma (fase akhir) hanya mengganti implementasi service,
   bukan mengganti domain.

## Konsekuensi

**Positif**
- Pengembangan penuh offline dengan Emulator Suite (tanpa akun Firebase).
- Transaksi Firestore memberi ACID untuk operasi formal (mutasi + audit
  atomik).
- Sesi dapat dicabut seketika dan tidak membocorkan klaim apa pun ke
  klien.

**Negatif / risiko**
- Tidak ada JOIN; agregasi dilakukan di service (getAll/batch).
- Rate limit in-memory per-instance (pengganti terdistribusi menyusul).
- Indeks komposit tidak diberlakukan emulator — wajib dideploy saat
  produksi; query berisiko gagal baru di produksi bila lupa.
- Biaya & perilaku produksi Firestore berbeda dari PostgreSQL (hotspot,
  kuota tulis).

## Alternatif yang ditolak

- **Session cookie buatan Firebase Admin (`createSessionCookie`)**:
  bergantung pada dukungan emulator & API tertentu, lebih sulit dicabut.
- **HMAC self-signed token stateless**: tidak dapat dicabut sebelum
  kedaluwarsa; menyulitkan logout otoritatif.
- **Security Rules sebagai satu-satunya kebijakan**: mustahil menampung
  logika workflow (siklus klaim, pemisahan tugas) yang rapi.

## Jalur migrasi ke PostgreSQL + Prisma (Fase akhir)

1. Petakan koleksi → tabel: `users`, `workspaces`, `memberships`
   (unique `(userId, workspaceId)`), `sessions`, `auditEvents`
   (append-only), dst.
2. Ganti implementasi service (mulai dari `services/workspace.ts`) dengan
   Prisma; pertahankan DTO/envelope/RBAC — kontrak API tidak berubah.
3. Dokumen sentinel → unique index. Transaksi Firestore → transaksi SQL.
4. Pertahankan audit sebagai tabel append-only + partisi waktu.
