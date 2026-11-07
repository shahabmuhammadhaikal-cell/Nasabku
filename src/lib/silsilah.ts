import type { Orang, Relasi } from "../data/tipe.js";

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

function urutNama(a: Orang, b: Orang): number {
  return a.nama.localeCompare(b.nama, "id", { sensitivity: "base" }) || a.id.localeCompare(b.id);
}

/**
 * Menelusuri keturunan (turun) atau leluhur (naik) dari satu orang, lapis demi lapis.
 * Murni: menerima daftar orang dan relasi ruang kerja, tanpa menyentuh basis data.
 */
export function telusuriSilsilah(
  akar: Orang,
  semuaOrang: readonly Orang[],
  semuaRelasi: readonly Relasi[],
  arah: Arah,
  kedalamanMaks: number,
): HasilSilsilah {
  const peta = new Map(semuaOrang.map((orang) => [orang.id, orang]));
  const tetangga = new Map<string, string[]>();
  for (const relasi of semuaRelasi) {
    const dari = arah === "turun" ? relasi.orangTuaId : relasi.anakId;
    const ke = arah === "turun" ? relasi.anakId : relasi.orangTuaId;
    const daftar = tetangga.get(dari) ?? [];
    daftar.push(ke);
    tetangga.set(dari, daftar);
  }

  const simpul: SimpulSilsilah[] = [{ orang: akar, kedalaman: 0, lewat: [akar.id] }];
  const terlihat = new Set<string>([akar.id]);
  let batas: { id: string; lewat: string[] }[] = [{ id: akar.id, lewat: [akar.id] }];

  for (let kedalaman = 1; kedalaman <= kedalamanMaks && batas.length > 0; kedalaman += 1) {
    const berikut: { id: string; lewat: string[] }[] = [];
    for (const induk of batas) {
      const kerabat = (tetangga.get(induk.id) ?? [])
        .map((id) => peta.get(id))
        .filter((orang): orang is Orang => Boolean(orang))
        .sort(urutNama);

      for (const orang of kerabat) {
        if (terlihat.has(orang.id)) continue;
        terlihat.add(orang.id);
        const lewat = [...induk.lewat, orang.id];
        simpul.push({ orang, kedalaman, lewat });
        berikut.push({ id: orang.id, lewat });
      }
    }
    batas = berikut;
  }

  return { akar, arah, kedalaman: kedalamanMaks, simpul };
}

/**
 * Benar bila `calonOrangTua` sudah menjadi keturunan `calonAnak` (atau orang yang sama),
 * sehingga menambahkan relasi orang tua→anak akan membentuk lingkaran silsilah.
 * Penelusuran dimulai dari calon anak, lalu dicari apakah calon orang tua ada di dalamnya.
 */
export function akanMembentukSiklus(
  semuaRelasi: readonly Relasi[],
  calonOrangTuaId: string,
  calonAnakId: string,
): boolean {
  if (calonOrangTuaId === calonAnakId) return true;

  const turunan = new Map<string, string[]>();
  for (const relasi of semuaRelasi) {
    const daftar = turunan.get(relasi.orangTuaId) ?? [];
    daftar.push(relasi.anakId);
    turunan.set(relasi.orangTuaId, daftar);
  }

  const antre = [calonAnakId];
  const terlihat = new Set<string>();
  while (antre.length > 0) {
    const sekarang = antre.shift();
    if (sekarang === undefined) break;
    if (sekarang === calonOrangTuaId) return true;
    if (terlihat.has(sekarang)) continue;
    terlihat.add(sekarang);
    antre.push(...(turunan.get(sekarang) ?? []));
  }
  return false;
}
