import type { DatabaseSync } from "node:sqlite";
import type { Baris, Orang } from "../db.js";
import { keOrang } from "../db.js";

export type Arah = "turun" | "naik";

export interface SimpulSilsilah {
  orang: Orang;
  kedalaman: number;
  /** Rantai id dari akar sampai simpul ini. */
  lewat: string[];
}

export interface HasilSilsilah {
  akar: Orang;
  arah: Arah;
  kedalaman: number;
  simpul: SimpulSilsilah[];
}

export function ambilOrang(db: DatabaseSync, ruangKerjaId: string, id: string): Orang | null {
  const baris = db
    .prepare("SELECT * FROM orang WHERE id = ? AND ruang_kerja_id = ?")
    .get(id, ruangKerjaId) as Baris | undefined;
  return baris ? keOrang(baris) : null;
}

/**
 * Menelusuri keturunan (turun) atau leluhur (naik) dari satu orang.
 * Mengembalikan null bila orang tidak ada di ruang kerja tersebut.
 */
export function telusuriSilsilah(
  db: DatabaseSync,
  ruangKerjaId: string,
  akarId: string,
  arah: Arah,
  kedalamanMaks: number,
): HasilSilsilah | null {
  const akar = ambilOrang(db, ruangKerjaId, akarId);
  if (!akar) return null;

  const simpul: SimpulSilsilah[] = [{ orang: akar, kedalaman: 0, lewat: [akar.id] }];
  const rantai = new Map<string, string[]>([[akar.id, [akar.id]]]);
  const terlihat = new Set<string>([akar.id]);

  let batas: string[] = [akar.id];
  for (let kedalaman = 1; kedalaman <= kedalamanMaks && batas.length > 0; kedalaman += 1) {
    const tanda = batas.map(() => "?").join(",");
    const sql =
      arah === "turun"
        ? `SELECT o.*, r.orang_tua_id AS induk
             FROM relasi r JOIN orang o ON o.id = r.anak_id
            WHERE r.ruang_kerja_id = ? AND r.orang_tua_id IN (${tanda})`
        : `SELECT o.*, r.anak_id AS induk
             FROM relasi r JOIN orang o ON o.id = r.orang_tua_id
            WHERE r.ruang_kerja_id = ? AND r.anak_id IN (${tanda})`;

    const baris = db.prepare(sql).all(ruangKerjaId, ...batas) as Baris[];
    const berikut: string[] = [];

    for (const b of baris) {
      const orang = keOrang(b);
      if (terlihat.has(orang.id)) continue;
      terlihat.add(orang.id);
      berikut.push(orang.id);
      const induk = String(b.induk ?? "");
      const lewat = [...(rantai.get(induk) ?? [akar.id]), orang.id];
      rantai.set(orang.id, lewat);
      simpul.push({ orang, kedalaman, lewat });
    }

    batas = berikut;
  }

  return { akar, arah, kedalaman: kedalamanMaks, simpul };
}

/**
 * Benar bila `calonOrangTua` adalah keturunan `calonAnak` (atau orang yang sama),
 * sehingga menambahkan relasi orang tua→anak akan membentuk lingkaran.
 * Penelusuran dimulai dari calon anak, lalu dicari apakah calon orang tua ada di dalamnya.
 */
export function akanMembentukSiklus(
  db: DatabaseSync,
  calonOrangTuaId: string,
  calonAnakId: string,
): boolean {
  if (calonOrangTuaId === calonAnakId) return true;
  const baris = db
    .prepare(
      `WITH RECURSIVE turunan(id) AS (
         SELECT anak_id FROM relasi WHERE orang_tua_id = ?
         UNION
         SELECT r.anak_id FROM relasi r JOIN turunan t ON r.orang_tua_id = t.id
       )
       SELECT 1 AS ada FROM turunan WHERE id = ? LIMIT 1`,
    )
    .get(calonAnakId, calonOrangTuaId) as Baris | undefined;
  return Boolean(baris);
}
