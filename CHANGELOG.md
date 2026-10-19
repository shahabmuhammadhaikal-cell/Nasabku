# Changelog

Semua perubahan penting tercatat di sini. Format mengikuti
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); proyek memakai
versioning semantik.

## [0.1.0] — 2026-10-14

### Fase 1 — Fondasi, autentikasi, RBAC, workspace, audit

#### Ditambahkan
- Monorepo npm workspaces: `apps/api`, `packages/shared`, `packages/config`
  dengan TypeScript strict, ESLint flat config, dan Vitest.
- **Domain `@nasabku/shared`**: matriks role–izin (7 peran, deny-by-default,
  pemisahan tugas — PLATFORM_ADMIN tanpa `claim:decide`), kode error +
  envelope seragam (`data/meta` · `error.code/message/details/requestId`),
  jenis aksi audit + redaksi metadata.
- **`@nasabku/config`**: skema env zod (gagal-loud saat startup; hanya nama
  variabel dicetak; emulator dilarang di production).
- **API Express 5** (`/api/v1`): health live/ready, login (tukar ID token
  Firebase → cookie sesi HttpOnly SameSite=Lax, token tersimpan ter-hash di
  Firestore + pencabutan otoritatif), logout, `/auth/me`, workspace (buat
  atomik dengan slug unik, baca/ubah), anggota (tambah/ubah/cabut soft-revoke
  dengan guard admin terakhir & larangan modifikasi diri), riwayat audit
  (kursor, filter aksi, permission `audit:read`).
- Middleware: request-ID (header masuk diverifikasi), logger pino dengan
  redaksi rahasia, CORS allowlist + penjaga Origin anti-CSRF, rate limit
  jendela tetap per-IP (umum + khusus autentikasi), penangan error terpusat.
- Aturan Firestore default DENY + indeks komposit (auditEvents) dan
  collection-group override (memberships.userId).
- **41 unit test** + **25 tes integrasi Emulator Suite** (alur login/logout,
  isolasi workspace 404, RBAC 403, self-modification, audit requestId,
  rate limit 429, CSRF 403, pagination kursor).

#### Diketahui / batasan interim
- Rate limit in-memory (per-instance).
- Reset kata sandi memerlukan keputusan produk penyedia email.
- Indeks Firestore harus dideploy terpisah ke produksi.
