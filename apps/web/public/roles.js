/**
 * Konstanta peran — tiruan terkontrol dari packages/shared/src/roles.ts
 * agar UI tidak perlu bundler. Sumber kebenaran tetap backend (server yang
 * memutuskan izin); di sini hanya untuk tampilan.
 */
export const ROLES = [
  "PLATFORM_ADMIN",
  "RESEARCHER",
  "SUBMITTER",
  "REVIEWER",
  "AUTHORITY_SIGNER",
  "AUDITOR",
];
