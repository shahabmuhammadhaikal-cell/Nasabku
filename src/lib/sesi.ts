import { createHash, randomBytes } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { kePenggunaPublik, type PenggunaPublik } from "../db.js";

export const NAMA_KUE_SESI = "nasabku_sesi";

/** Token acak yang dikirim ke peramban; hanya sidiknya yang disimpan di basis data. */
export function buatTokenSesi(): string {
  return randomBytes(32).toString("base64url");
}

export function sidikToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface SesiAktif {
  pengguna: PenggunaPublik;
  kedaluwarsaPada: string;
}

export function simpanSesi(db: DatabaseSync, penggunaId: string, umurHari: number): string {
  const token = buatTokenSesi();
  const sekarang = new Date();
  const kedaluwarsa = new Date(sekarang.getTime() + umurHari * 24 * 60 * 60 * 1000);
  db.prepare(
    "INSERT INTO sesi (sidik, pengguna_id, dibuat_pada, kedaluwarsa_pada) VALUES (?, ?, ?, ?)",
  ).run(sidikToken(token), penggunaId, sekarang.toISOString(), kedaluwarsa.toISOString());
  return token;
}

export function ambilSesi(db: DatabaseSync, token: string): SesiAktif | null {
  const baris = db
    .prepare(
      `SELECT p.id, p.email, p.nama, p.dibuat_pada, s.kedaluwarsa_pada
         FROM sesi s
         JOIN pengguna p ON p.id = s.pengguna_id
        WHERE s.sidik = ?`,
    )
    .get(sidikToken(token)) as Record<string, unknown> | undefined;
  if (!baris) return null;
  const kedaluwarsaPada = String(baris.kedaluwarsa_pada ?? "");
  if (Date.parse(kedaluwarsaPada) <= Date.now()) {
    db.prepare("DELETE FROM sesi WHERE sidik = ?").run(sidikToken(token));
    return null;
  }
  return { pengguna: kePenggunaPublik(baris), kedaluwarsaPada };
}

export function hapusSesi(db: DatabaseSync, token: string): void {
  db.prepare("DELETE FROM sesi WHERE sidik = ?").run(sidikToken(token));
}
