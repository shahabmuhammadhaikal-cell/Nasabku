import { galat } from "./kesalahan.js";
import { parseTanggal } from "./tanggal.js";

const POLA_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function badanObjek(nilai: unknown): Record<string, unknown> {
  if (typeof nilai !== "object" || nilai === null || Array.isArray(nilai)) {
    throw galat(400, "BADAN_TIDAK_VALID", "Badan permintaan harus berupa objek JSON.");
  }
  return nilai as Record<string, unknown>;
}

function tolak(label: string, kunci: string, pesan: string): never {
  throw galat(422, "VALIDASI_GAGAL", `${label} ${pesan}`, { field: kunci });
}

export function teksWajib(
  badan: Record<string, unknown>,
  kunci: string,
  label: string,
  min = 1,
  max = 200,
): string {
  const nilai = badan[kunci];
  if (typeof nilai !== "string") tolak(label, kunci, "wajib berupa teks.");
  const bersih = nilai.trim();
  if (bersih.length < min) tolak(label, kunci, `wajib diisi minimal ${min} karakter.`);
  if (bersih.length > max) tolak(label, kunci, `maksimal ${max} karakter.`);
  return bersih;
}

/** Mengembalikan undefined bila kunci tidak dikirim (untuk PATCH), null bila dikosongkan. */
export function teksOpsional(
  badan: Record<string, unknown>,
  kunci: string,
  label: string,
  max = 2000,
): string | null | undefined {
  if (!(kunci in badan) || badan[kunci] === undefined) return undefined;
  const nilai = badan[kunci];
  if (nilai === null) return null;
  if (typeof nilai !== "string") tolak(label, kunci, "harus berupa teks atau null.");
  const bersih = nilai.trim();
  if (bersih.length > max) tolak(label, kunci, `maksimal ${max} karakter.`);
  return bersih.length === 0 ? null : bersih;
}

export function tanggalOpsional(
  badan: Record<string, unknown>,
  kunci: string,
  label: string,
): string | null | undefined {
  if (!(kunci in badan) || badan[kunci] === undefined) return undefined;
  const nilai = badan[kunci];
  if (nilai === null || nilai === "") return null;
  if (typeof nilai !== "string") {
    tolak(label, kunci, "harus berupa teks tanggal (1954, 1954-06, atau 1954-06-12).");
  }
  const tanggal = parseTanggal(nilai);
  if (!tanggal) {
    tolak(label, kunci, "harus berformat 1954, 1954-06, atau 1954-06-12 yang valid.");
  }
  return tanggal;
}

export function emailWajib(badan: Record<string, unknown>, kunci = "email"): string {
  const nilai = teksWajib(badan, kunci, "Email", 3, 200).toLowerCase();
  if (!POLA_EMAIL.test(nilai)) tolak("Email", kunci, "tidak valid.");
  return nilai;
}

export function kataSandiWajib(badan: Record<string, unknown>, kunci = "sandi"): string {
  const nilai = badan[kunci];
  if (typeof nilai !== "string") tolak("Kata sandi", kunci, "wajib diisi.");
  if (nilai.length < 8) tolak("Kata sandi", kunci, "minimal 8 karakter.");
  if (nilai.length > 200) tolak("Kata sandi", kunci, "maksimal 200 karakter.");
  return nilai;
}

export function jenisKelaminWajib(badan: Record<string, unknown>, kunci = "jenisKelamin"): "L" | "P" | "U" {
  const nilai = badan[kunci] ?? "U";
  if (nilai !== "L" && nilai !== "P" && nilai !== "U") {
    tolak("Jenis kelamin", kunci, 'harus salah satu dari "L", "P", atau "U".');
  }
  return nilai;
}
