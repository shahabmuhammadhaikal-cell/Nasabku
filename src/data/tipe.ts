import type { Dokumen } from "./port.js";

export type PeranPengguna = "admin" | "pengguna";
export type StatusPengguna = "aktif" | "menunggu" | "nonaktif";

export interface PenggunaPublik {
  id: string;
  email: string;
  nama: string;
  dibuatPada: string;
  peran: PeranPengguna;
  status: StatusPengguna;
}

/** Pengguna beserta hash sandi; tidak pernah dikirim ke klien. */
export interface PenggunaTersimpan extends PenggunaPublik {
  sandiHash: string;
}

export type StatusRuangKerja = "aktif" | "menunggu";

export interface RuangKerja {
  id: string;
  nama: string;
  pemilikId: string;
  dibuatPada: string;
  status: StatusRuangKerja;
}

/** Setelan global yang hanya bisa diubah admin. */
export interface Pengaturan {
  /** Bila false, pendaftaran akun baru ditolak. */
  pendaftaranTerbuka: boolean;
  /** Akun baru menunggu persetujuan admin sebelum bisa masuk. */
  setujuiPendaftaran: boolean;
  /** Ruang kerja baru menunggu persetujuan sebelum bisa diisi data. */
  setujuiRuangKerja: boolean;
  /** Perubahan data oleh pengguna biasa diajukan dulu ke admin. */
  setujuiPerubahan: boolean;
  /** 0 berarti tanpa batas. */
  maksOrangPerRuang: number;
}

export type JenisUsulan = "orang" | "relasi" | "pasangan";
export type AksiUsulan = "tambah" | "ubah" | "hapus";
export type StatusUsulan = "menunggu" | "disetujui" | "ditolak";

/** Usulan perubahan data silsilah yang menunggu keputusan admin. */
export interface Usulan {
  id: string;
  ruangKerjaId: string;
  penggunaId: string;
  jenis: JenisUsulan;
  aksi: AksiUsulan;
  /** Id orang/relasi/pasangan yang diubah atau dihapus. */
  targetId: string | null;
  data: Record<string, unknown>;
  status: StatusUsulan;
  dibuatPada: string;
  diputuskanPada: string | null;
  catatanAdmin: string | null;
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

export type StatusPernikahan = "menikah" | "cerai" | "meninggal";

/** Hubungan pasangan (suami–istri) tanpa membedakan urutan. */
export interface Pasangan {
  id: string;
  ruangKerjaId: string;
  orangAId: string;
  orangBId: string;
  /** Tanggal pernikahan bertingkat: "1965", "1965-06", atau "1965-06-12". */
  tanggalMenikah: string | null;
  /** Menikah, cerai, atau berakhir karena salah satu meninggal. */
  status: StatusPernikahan;
  /** Tanggal berakhirnya pernikahan (cerai/meninggal), bila diketahui. */
  tanggalBerakhir: string | null;
  dibuatPada: string;
}

/**
 * Urutan pernikahan sengaja tidak disimpan: dihitung per orang oleh
 * `urutkanPerOrang`, karena satu pernikahan bisa bernomor berbeda bagi suami dan istri.
 */
export interface DataPasangan {
  tanggalMenikah: string | null;
  status: StatusPernikahan;
  tanggalBerakhir: string | null;
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
    // Dokumen lama belum punya peran/status: dianggap pengguna aktif biasa.
    peran: data.peran === "admin" ? "admin" : "pengguna",
    status:
      data.status === "menunggu" || data.status === "nonaktif" ? data.status : "aktif",
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
    status: data.status === "menunggu" ? "menunggu" : "aktif",
  };
}

export const PENGATURAN_BAWAAN: Pengaturan = {
  pendaftaranTerbuka: true,
  setujuiPendaftaran: false,
  setujuiRuangKerja: false,
  setujuiPerubahan: false,
  maksOrangPerRuang: 0,
};

export function kePengaturan(dokumen: Dokumen | null): Pengaturan {
  const data = dokumen?.data ?? {};
  const angka = Number(data.maksOrangPerRuang);
  return {
    pendaftaranTerbuka:
      typeof data.pendaftaranTerbuka === "boolean"
        ? data.pendaftaranTerbuka
        : PENGATURAN_BAWAAN.pendaftaranTerbuka,
    setujuiPendaftaran:
      typeof data.setujuiPendaftaran === "boolean"
        ? data.setujuiPendaftaran
        : PENGATURAN_BAWAAN.setujuiPendaftaran,
    setujuiRuangKerja:
      typeof data.setujuiRuangKerja === "boolean"
        ? data.setujuiRuangKerja
        : PENGATURAN_BAWAAN.setujuiRuangKerja,
    setujuiPerubahan:
      typeof data.setujuiPerubahan === "boolean"
        ? data.setujuiPerubahan
        : PENGATURAN_BAWAAN.setujuiPerubahan,
    maksOrangPerRuang:
      Number.isInteger(angka) && angka > 0
        ? angka
        : PENGATURAN_BAWAAN.maksOrangPerRuang,
  };
}

export function keUsulan(dokumen: Dokumen): Usulan {
  const { data } = dokumen;
  const jenis = data.jenis === "relasi" || data.jenis === "pasangan" ? data.jenis : "orang";
  const aksi =
    data.aksi === "ubah" || data.aksi === "hapus" ? data.aksi : "tambah";
  return {
    id: dokumen.id,
    ruangKerjaId: teks(data.ruangKerjaId),
    penggunaId: teks(data.penggunaId),
    jenis,
    aksi,
    targetId: teksAtauNull(data.targetId),
    data:
      typeof data.data === "object" && data.data !== null
        ? (data.data as Record<string, unknown>)
        : {},
    status:
      data.status === "disetujui" || data.status === "ditolak" ? data.status : "menunggu",
    dibuatPada: teks(data.dibuatPada),
    diputuskanPada: teksAtauNull(data.diputuskanPada),
    catatanAdmin: teksAtauNull(data.catatanAdmin),
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
    // Dokumen lama belum menyimpan tanggal menikah; dianggap belum diketahui.
    tanggalMenikah: teksAtauNull(data.tanggalMenikah),
    status:
      data.status === "cerai" || data.status === "meninggal" ? data.status : "menikah",
    tanggalBerakhir: teksAtauNull(data.tanggalBerakhir),
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
