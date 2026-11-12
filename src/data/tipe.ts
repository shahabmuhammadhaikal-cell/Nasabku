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
  /** Nama panggilan atau ejaan lain yang dikenal keluarga. */
  namaLain: string | null;
  jenisKelamin: JenisKelamin;
  /** Tanggal bertingkat: "1954", "1954-06", atau "1954-06-12". */
  tanggalLahir: string | null;
  tempatLahir: string | null;
  tanggalWafat: string | null;
  tempatWafat: string | null;
  /** Pekerjaan utama semasa hidup, mis. "Petani". */
  pekerjaan: string | null;
  /** Tempat pemakaman, bila dicatat terpisah dari tempat wafat. */
  tempatPemakaman: string | null;
  catatan: string | null;
  /** Dari mana keterangan ini diperoleh: wawancara, akta, arsip keluarga. */
  sumber: string | null;
  dibuatPada: string;
  diperbaruiPada: string;
}

export interface DataOrang {
  nama: string;
  namaLain: string | null;
  jenisKelamin: JenisKelamin;
  tanggalLahir: string | null;
  tempatLahir: string | null;
  tanggalWafat: string | null;
  tempatWafat: string | null;
  pekerjaan: string | null;
  tempatPemakaman: string | null;
  catatan: string | null;
  sumber: string | null;
}

export interface Relasi {
  id: string;
  ruangKerjaId: string;
  orangTuaId: string;
  anakId: string;
  dibuatPada: string;
}

/** Hubungan pasangan (suami–istri) tanpa membedakan urutan. */
export interface Pasangan {
  id: string;
  ruangKerjaId: string;
  orangAId: string;
  orangBId: string;
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
    namaLain: teksAtauNull(data.namaLain),
    jenisKelamin: jk === "L" || jk === "P" ? jk : "U",
    tanggalLahir: teksAtauNull(data.tanggalLahir) || tahunLama(data.tahunLahir),
    tempatLahir: teksAtauNull(data.tempatLahir),
    tanggalWafat: teksAtauNull(data.tanggalWafat) || tahunLama(data.tahunWafat),
    tempatWafat: teksAtauNull(data.tempatWafat),
    pekerjaan: teksAtauNull(data.pekerjaan),
    tempatPemakaman: teksAtauNull(data.tempatPemakaman),
    catatan: teksAtauNull(data.catatan),
    sumber: teksAtauNull(data.sumber),
    dibuatPada: teks(data.dibuatPada),
    diperbaruiPada: teks(data.diperbaruiPada),
  };
}

export function kePasangan(dokumen: Dokumen): Pasangan {
  const { data } = dokumen;
  return {
    id: dokumen.id,
    ruangKerjaId: teks(data.ruangKerjaId),
    orangAId: teks(data.orangAId),
    orangBId: teks(data.orangBId),
    dibuatPada: teks(data.dibuatPada),
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
