# Nasabku

Platform privat dokumentasi **nasab historis berbasis sumber**. Keputusan
hanya berlaku bila sumber dapat dipertanggungjawabkan; sumber pribadi
dilindungi dengan redaksi, tanda tangan, dan jejak audit.

> **Status: Fase 1 (fondasi & autentikasi)** — backend API + RBAC + audit
> dasar berjalan penuh di Emulator Suite. Backend sementara memakai
> **Firebase** (lihat [ADR-0001](docs/adr/ADR-0001-firebase-interim.md));
> target akhir tetap PostgreSQL + Prisma.

## Struktur monorepo

```
apps/api/            Express 5 + TypeScript (API /api/v1)
packages/shared/     Domain murni: RBAC, kode error/envelope, jenis audit
packages/config/     Skema konfigurasi env (zod) — gagal-loud di startup
firestore.rules      Default DENY (semua akses lewat API/Admin SDK)
firestore.indexes.json
firebase.json        Konfigurasi Emulator Suite (auth :9099, firestore :8080)
docs/adr/            Keputusan arsitektur
```

## Memulai

Prasyarat: Node ≥ 22.12, Java 21 (untuk Firestore Emulator).

```bash
npm install
cp .env.example .env            # bila butuh konfigurasi lokal

# Emulator Suite (proyek demo- tidak memerlukan login)
export JAVA_HOME=$HOME/tools/jre21   # sesuaikan lokasi Java Anda
npm run emulators                  # terminal 1
npm run dev:api                    # terminal 2 (API di :8080)

# Verifikasi
npm run typecheck
npm run lint
npm test                           # unit (tanpa emulator)
npm run test:integration           # 25 tes di Emulator Suite
```

`test:integration` menjalankan `firebase emulators:exec`, sehingga variabel
`FIREBASE_AUTH_EMULATOR_HOST`/`FIRESTORE_EMULATOR_HOST` diset otomatis.

## Kontrak API (ringkas)

Semua respons memakai envelope seragam:

```jsonc
// sukses
{ "data": { "...": "..." }, "meta": { "requestId": "req_..." } }
// gagal
{ "error": { "code": "VALIDATION_ERROR", "message": "...",
             "details": [{ "field": "email", "reason": "INVALID_EMAIL" }],
             "requestId": "req_..." } }
```

Endpoint Fase 1 (prefix `/api/v1`):

| Metode & path | Izin | Keterangan |
|---|---|---|
| `GET /health/live` · `GET /health/ready` | publik | probe; `/ready` cek Firestore (503 bila tak terjangkau) |
| `POST /auth/login` | publik | tukar ID token Firebase → cookie sesi HttpOnly SameSite=Lax |
| `POST /auth/logout` | sesi | cabut sesi secara otoritatif |
| `GET /auth/me` | sesi | profil + daftar keanggotaan |
| `POST /workspaces` | sesi | buat workspace (slug unik atomik, pembuat = PLATFORM_ADMIN) |
| `GET /workspaces` | sesi | workspace milik sendiri |
| `GET/PATCH /workspaces/:id` | `workspace:read` / `workspace:update` | |
| `GET/POST /workspaces/:id/members` | `member:read` / `member:invite` | |
| `PATCH/DELETE /workspaces/:id/members/:uid` | `member:update` / `member:remove` | DELETE = cabut (REVOKED, soft) |
| `GET /audit-events?workspaceId=` | `audit:read` | riwayat audit, kursor, filter aksi |

Aturan keamanan yang ditegakkan:

- **RBAC deny-by-default** (matriks di `packages/shared/src/roles.ts`);
  `PLATFORM_ADMIN` sengaja **tidak** punya `claim:decide` (pemisahan tugas).
- Non-anggota workspace menerima **404**, bukan 403 — keberadaan tidak bocor.
- Metode tulis dengan `Origin` di luar allowlist → 403 (anti-CSRF; plus
  SameSite=Lax).
- Rate limit per-IP (in-memory; interim — lihat batasan di bawah).
- Redaksi rahasia pada log (`cookie`, `authorization`, `password`, token)
  dan metadata audit (kata kunci terlarang dibuang).
- Audit selalu menyertakan `requestId` aktor; mutasi formal + audit dalam
  satu transaksi Firestore.

## Konfigurasi

Lihat [.env.example](.env.example). Skema divalidasi saat startup — bila
gagal, hanya **nama** variabel yang dicetak (tanpa nilai). Di production,
`USE_FIREBASE_EMULATORS=false` wajib (ditegakkan skema).

## Rencana fase berikutnya

2. Data domain (orang, sumber, dokumen + signed URL, versi, redaksi)
3. Klaim & bukti (anti-duplikat, versi, penelaahan)
4. Sertifikat & penandatanganan
5. Banding, notifikasi, PII/kebijakan retensi
6. API klien eksternal (token berskup, idempotency-key)
7. Keras: backup/restore, pemulihan, observability, optimasi
8. Web UI (Next.js App Router) + QA menyeluruh

## Batasan interim (jujur)

- Rate limit in-memory: per-instance, tidak berlaku lintas instance.
- Belum ada fitur lupa/reset kata sandi (butuh penyedia email transaksional —
  keputusan produk).
- Belum ada pengindeksan data; `firestore.indexes.json` harus dideploy ke
  produksi (`firebase deploy --only firestore:indexes`) — emulator tidak
  memberlakukan indeks komposit.
