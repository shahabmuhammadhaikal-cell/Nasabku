import type { Dokumen } from "./port.js";

export interface PenggunaPublik {
  id: string;
  email: string;
  nama: string;
  dibuatPada: string;
}

/** Pengguna beserta hash sandi; tidak pernah dikirim ke klien. */
export interface PenggunaTersimpan extends PenggunaPublik {
  sandiHash: string;
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
  /** Tanggal bertingkat: "1954", "1954-06", atau "1954-06-12". */
  tanggalLahir: string | null;
  tempatLahir: string | null;
  tanggalWafat: string | null;
  tempatWafat: string | null;
  catatan: string | null;
  dibuatPada: string;
  diperbaruiPada: string;
}

export interface DataOrang {
  nama: string;
  jenisKelamin: JenisKelamin;
  tanggalLahir: string | null;
  tempatLahir: string | null;
  tanggalWafat: string | null;
  tempatWafat: string | null;
  catatan: string | null;
}

export interface Relasi {
  id: string;
  ruangKerjaId: string;
  orangTuaId: string;
  anakId: string;
  dibuatPada: string;
}

export function teks(nilai: unknown): string {
  return typeof nilai === "string" ? nilai : String(nilai ?? "");
}

export function teksAtauNull(nilai: unknown): string | null {
  return typeof nilai === "string" ? nilai : null;
}

export function kePengguna(dokumen: Dokumen): PenggunaPublik {
  const { data } = dokumen;
  return {
    id: dokumen.id,
    email: teks(data.email),
    nama: teks(data.nama),
    dibuatPada: teks(data.dibuatPada),
  };
}

export function kePenggunaTersimpan(dokumen: Dokumen): PenggunaTersimpan {
  return { ...kePengguna(dokumen), sandiHash: teks(dokumen.data.sandiHash) };
}

export function keRuangKerja(dokumen: Dokumen): RuangKerja {
  const { data } = dokumen;
  return {
    id: dokumen.id,
    nama: teks(data.nama),
    pemilikId: teks(data.pemilikId),
    dibuatPada: teks(data.dibuatPada),
  };
}

export function keOrang(dokumen: Dokumen): Orang {
  const { data } = dokumen;
  const jk = teks(data.jenisKelamin);
  // Dokumen lama hanya menyimpan tahun (angka); dibaca sebagai tanggal bertingkat.
  const tahunLama = (nilai: unknown): string | null =>
    typeof nilai === "number" && Number.isFinite(nilai) ? String(nilai) : null;

  return {
    id: dokumen.id,
    ruangKerjaId: teks(data.ruangKerjaId),
    nama: teks(data.nama),
    jenisKelamin: jk === "L" || jk === "P" ? jk : "U",
    tanggalLahir: teksAtauNull(data.tanggalLahir) || tahunLama(data.tahunLahir),
    tempatLahir: teksAtauNull(data.tempatLahir),
    tanggalWafat: teksAtauNull(data.tanggalWafat) || tahunLama(data.tahunWafat),
    tempatWafat: teksAtauNull(data.tempatWafat),
    catatan: teksAtauNull(data.catatan),
    dibuatPada: teks(data.dibuatPada),
    diperbaruiPada: teks(data.diperbaruiPada),
  };
}

export function keRelasi(dokumen: Dokumen): Relasi {
  const { data } = dokumen;
  return {
    id: dokumen.id,
    ruangKerjaId: teks(data.ruangKerjaId),
    orangTuaId: teks(data.orangTuaId),
    anakId: teks(data.anakId),
    dibuatPada: teks(data.dibuatPada),
  };
}
