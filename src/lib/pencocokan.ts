import type { DataOrang, Orang } from "../data/tipe.js";
import { tahunDari } from "./tanggal.js";

/**
 * Nama dibandingkan tanpa peduli huruf besar/kecil, tanda baca, aksen, dan spasi
 * berlebih — "Muhammad  Idris" dan "muhammad idris" adalah orang yang sama.
 */
export function normalkanNama(nama: string): string {
  return nama
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Membandingkan hanya tanggal yang lebih teliti (mis. "1954-06" mengalahkan "1954"). */
function tanggalTerbaik(lama: string | null, baru: string | null): string | null {
  if (!lama) return baru;
  if (!baru) return lama;
  return baru.length > lama.length ? baru : lama;
}

/**
 * Satu orang dianggap sama bila namanya sama, jenis kelaminnya tidak bertentangan,
 * dan tahun lahirnya tidak bertentangan (bila keduanya diketahui). Tahun yang berbeda
 * selalu berarti orang yang berbeda, meski namanya mirip — lebih baik tidak menggabung
 * daripada menggabungkan dua orang sungguhan.
 */
export function samaOrang(data: DataOrang, orang: Orang): boolean {
  if (normalkanNama(data.nama) !== normalkanNama(orang.nama)) return false;
  if (
    data.jenisKelamin !== "U" &&
    orang.jenisKelamin !== "U" &&
    data.jenisKelamin !== orang.jenisKelamin
  ) {
    return false;
  }
  const tahunBaru = tahunDari(data.tanggalLahir);
  const tahunLama = tahunDari(orang.tanggalLahir);
  if (tahunBaru !== null && tahunLama !== null && tahunBaru !== tahunLama) return false;
  return true;
}

/** Mengisi kekosongan pada data lama; keterangan yang sudah ada tidak pernah ditimpa. */
export function gabungkanData(lama: Orang, baru: DataOrang): DataOrang {
  return {
    nama: lama.nama,
    namaLain: lama.namaLain ?? baru.namaLain,
    jenisKelamin: lama.jenisKelamin !== "U" ? lama.jenisKelamin : baru.jenisKelamin,
    tanggalLahir: tanggalTerbaik(lama.tanggalLahir, baru.tanggalLahir),
    tempatLahir: lama.tempatLahir ?? baru.tempatLahir,
    tanggalWafat: lama.tanggalWafat ?? baru.tanggalWafat,
    tempatWafat: lama.tempatWafat ?? baru.tempatWafat,
    pekerjaan: lama.pekerjaan ?? baru.pekerjaan,
    tempatPemakaman: lama.tempatPemakaman ?? baru.tempatPemakaman,
    catatan: lama.catatan ?? baru.catatan,
    sumber: lama.sumber ?? baru.sumber,
  };
}

export function adaPerubahan(lama: Orang, baru: DataOrang): boolean {
  const kunci = Object.keys(baru) as (keyof DataOrang)[];
  return kunci.some((satu) => lama[satu] !== baru[satu]);
}
