import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

export type Baris = Record<string, unknown>;

export interface PenggunaPublik {
  id: string;
  email: string;
  nama: string;
  dibuatPada: string;
}

export interface RuangKerja {
  id: string;
  nama: string;
  pemilikId: string;
  dibuatPada: string;
}

export type JenisKelamin = "L" | "P" | "U";

export interface Orang {
  id: string;
  ruangKerjaId: string;
  nama: string;
  jenisKelamin: JenisKelamin;
  tahunLahir: number | null;
  tahunWafat: number | null;
  catatan: string | null;
  dibuatPada: string;
  diperbaruiPada: string;
}

export interface Relasi {
  id: string;
  ruangKerjaId: string;
  orangTuaId: string;
  anakId: string;
  dibuatPada: string;
}

const SKEMA = `
CREATE TABLE IF NOT EXISTS pengguna (
  id           TEXT PRIMARY KEY,
  email        TEXT NOT NULL UNIQUE,
  nama         TEXT NOT NULL,
  sandi_hash   TEXT NOT NULL,
  dibuat_pada  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sesi (
  sidik             TEXT PRIMARY KEY,
  pengguna_id       TEXT NOT NULL REFERENCES pengguna(id) ON DELETE CASCADE,
  dibuat_pada       TEXT NOT NULL,
  kedaluwarsa_pada  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sesi_pengguna ON sesi(pengguna_id);

CREATE TABLE IF NOT EXISTS ruang_kerja (
  id          TEXT PRIMARY KEY,
  nama        TEXT NOT NULL,
  pemilik_id  TEXT NOT NULL REFERENCES pengguna(id) ON DELETE CASCADE,
  dibuat_pada TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ruang_pemilik ON ruang_kerja(pemilik_id);

CREATE TABLE IF NOT EXISTS orang (
  id                TEXT PRIMARY KEY,
  ruang_kerja_id    TEXT NOT NULL REFERENCES ruang_kerja(id) ON DELETE CASCADE,
  nama              TEXT NOT NULL,
  jenis_kelamin     TEXT NOT NULL CHECK (jenis_kelamin IN ('L','P','U')),
  tahun_lahir       INTEGER,
  tahun_wafat       INTEGER,
  catatan           TEXT,
  dibuat_pada       TEXT NOT NULL,
  diperbarui_pada   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_orang_ruang ON orang(ruang_kerja_id);

CREATE TABLE IF NOT EXISTS relasi (
  id             TEXT PRIMARY KEY,
  ruang_kerja_id TEXT NOT NULL REFERENCES ruang_kerja(id) ON DELETE CASCADE,
  orang_tua_id   TEXT NOT NULL REFERENCES orang(id) ON DELETE CASCADE,
  anak_id        TEXT NOT NULL REFERENCES orang(id) ON DELETE CASCADE,
  dibuat_pada    TEXT NOT NULL,
  UNIQUE (orang_tua_id, anak_id),
  CHECK (orang_tua_id <> anak_id)
);
CREATE INDEX IF NOT EXISTS idx_relasi_ruang ON relasi(ruang_kerja_id);
CREATE INDEX IF NOT EXISTS idx_relasi_anak ON relasi(anak_id);
`;

/**
 * Membuka basis data SQLite (Node >= 23.4 membawa `node:sqlite`, tanpa modul native).
 * Gunakan ":memory:" untuk pengujian.
 */
export function bukaDatabase(berkas: string): DatabaseSync {
  if (berkas !== ":memory:") {
    mkdirSync(dirname(resolve(berkas)), { recursive: true });
  }
  const db = new DatabaseSync(berkas);
  db.exec("PRAGMA foreign_keys = ON;");
  if (berkas !== ":memory:") {
    db.exec("PRAGMA journal_mode = WAL;");
  }
  db.exec(SKEMA);
  return db;
}

function teks(nilai: unknown): string {
  return typeof nilai === "string" ? nilai : String(nilai ?? "");
}

function angkaAtauNull(nilai: unknown): number | null {
  return typeof nilai === "number" ? nilai : nilai === null || nilai === undefined ? null : Number(nilai);
}

function teksAtauNull(nilai: unknown): string | null {
  return typeof nilai === "string" ? nilai : null;
}

export function kePenggunaPublik(baris: Baris): PenggunaPublik {
  return {
    id: teks(baris.id),
    email: teks(baris.email),
    nama: teks(baris.nama),
    dibuatPada: teks(baris.dibuat_pada),
  };
}

export function keRuangKerja(baris: Baris): RuangKerja {
  return {
    id: teks(baris.id),
    nama: teks(baris.nama),
    pemilikId: teks(baris.pemilik_id),
    dibuatPada: teks(baris.dibuat_pada),
  };
}

export function keOrang(baris: Baris): Orang {
  const jk = teks(baris.jenis_kelamin);
  return {
    id: teks(baris.id),
    ruangKerjaId: teks(baris.ruang_kerja_id),
    nama: teks(baris.nama),
    jenisKelamin: jk === "L" || jk === "P" ? jk : "U",
    tahunLahir: angkaAtauNull(baris.tahun_lahir),
    tahunWafat: angkaAtauNull(baris.tahun_wafat),
    catatan: teksAtauNull(baris.catatan),
    dibuatPada: teks(baris.dibuat_pada),
    diperbaruiPada: teks(baris.diperbarui_pada),
  };
}

export function keRelasi(baris: Baris): Relasi {
  return {
    id: teks(baris.id),
    ruangKerjaId: teks(baris.ruang_kerja_id),
    orangTuaId: teks(baris.orang_tua_id),
    anakId: teks(baris.anak_id),
    dibuatPada: teks(baris.dibuat_pada),
  };
}
