import type {
  DataOrang,
  Orang,
  Pasangan,
  Relasi,
  RuangKerja,
  StatusPernikahan,
} from "../data/tipe.js";
import { bandingkanPernikahan } from "./pernikahan.js";
import { parseTanggal } from "./tanggal.js";

const BULAN_GEDCOM = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
];

/** Singkatan bulan versi Indonesia yang sering muncul di berkas GEDCOM lokal. */
const BULAN_INDONESIA: Record<string, number> = {
  JAN: 1,
  PEB: 2,
  FEB: 2,
  MAR: 3,
  APR: 4,
  MEI: 5,
  JUN: 6,
  JUL: 7,
  AGU: 8,
  AGS: 8,
  AGT: 8,
  SEP: 9,
  OKT: 10,
  NOV: 11,
  DES: 12,
  DIS: 12,
};

const POLA_TANGGAL = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/;
/** "ABT 1954", "BEF 1990", "CA 1900" — perkiraan; tanggal pastinya tetap tidak dikarang. */
const POLA_PERKIRAAN = /^(?:ABT|BEF|AFT|EST|CAL|SAY|CIRCA|CA)\s+/i;
const BATAS_BARIS = 180;

/** Batas jumlah individu per satu impor, agar satu berkas tidak membanjiri ruang kerja. */
export const BATAS_IMPOR_ORANG = 2000;

const dua = (angka: number): string => String(angka).padStart(2, "0");

/** "1954-06-12" → "12 JUN 1954"; "1954-06" → "JUN 1954"; "1954" → "1954". */
export function tanggalKeGedcom(tanggal: string | null | undefined): string | null {
  if (!tanggal) return null;
  const cocok = POLA_TANGGAL.exec(tanggal);
  if (!cocok) return null;
  const tahun = cocok[1] ?? "";
  const bulan = cocok[2] ?? "";
  const hari = cocok[3] ?? "";
  if (!bulan) return tahun;
  const namaBulan = BULAN_GEDCOM[Number(bulan) - 1];
  if (!namaBulan) return tahun;
  if (!hari) return `${namaBulan} ${tahun}`;
  return `${Number(hari)} ${namaBulan} ${tahun}`;
}

function nomorBulan(nama: string): number | null {
  const singkat = nama.slice(0, 3).toUpperCase();
  const urutan = BULAN_GEDCOM.indexOf(singkat);
  if (urutan >= 0) return urutan + 1;
  return BULAN_INDONESIA[singkat] ?? null;
}

/** "12 JUN 1954" → "1954-06-12"; "JUN 1954" → "1954-06"; "ABT 1954" → "1954". */
export function gedcomKeTanggal(nilai: string): string | null {
  const bersih = nilai
    .trim()
    .replace(POLA_PERKIRAAN, "")
    .replace(/\s+/g, " ")
    .toUpperCase();
  if (!bersih) return null;
  if (POLA_TANGGAL.test(bersih)) return parseTanggal(bersih);

  const bagian = bersih.split(" ");
  const tahun = bagian[bagian.length - 1] ?? "";
  if (!/^\d{4}$/.test(tahun)) return null;
  if (bagian.length === 1) return parseTanggal(tahun);

  if (bagian.length === 2) {
    const bulan = nomorBulan(bagian[0] ?? "");
    return bulan ? parseTanggal(`${tahun}-${dua(bulan)}`) : null;
  }

  if (bagian.length === 3) {
    const hari = Number(bagian[0]);
    const bulan = nomorBulan(bagian[1] ?? "");
    if (!Number.isInteger(hari) || hari < 1 || hari > 31 || !bulan) return null;
    return parseTanggal(`${tahun}-${dua(bulan)}-${dua(hari)}`);
  }

  return null;
}

function bersihkan(nilai: string): string {
  return nilai.replace(/\s+/g, " ").trim();
}

/** Nama GEDCOM: kata terakhir dianggap marga, mis. "Budi Santoso" → "Budi /Santoso/". */
function namaGedcom(nama: string): string {
  const bagian = bersihkan(nama.replace(/\//g, " ")).split(" ");
  const pertama = bagian[0] ?? "";
  if (bagian.length < 2) return pertama;
  const marga = bagian.pop() ?? "";
  return `${bagian.join(" ")} /${marga}/`;
}

function bungkusBaris(teks: string): string[] {
  const hasil: string[] = [];
  let sisa = teks;
  if (!sisa) return [""];
  while (sisa.length > BATAS_BARIS) {
    let potong = sisa.lastIndexOf(" ", BATAS_BARIS);
    if (potong < 60) potong = BATAS_BARIS;
    hasil.push(sisa.slice(0, potong));
    sisa = sisa.slice(potong).trimStart();
  }
  hasil.push(sisa);
  return hasil;
}

/**
 * Menulis satu nilai teks GEDCOM: baris baru menjadi CONT, dan baris yang terlalu
 * panjang dipecah dengan CONC supaya tetap sah menurut batas 255 karakter GEDCOM.
 */
function tulisTeks(keluar: string[], tingkat: number, tag: string, isi: string): void {
  const paragraf = isi.replace(/\r\n?/g, "\n").split("\n");
  paragraf.forEach((satu, indeksParagraf) => {
    const potongan = bungkusBaris(satu);
    const awalan = indeksParagraf === 0 ? `${tingkat} ${tag}` : `${tingkat + 1} CONT`;
    potongan.forEach((bagian, indeksBagian) => {
      const label = indeksBagian === 0 ? awalan : `${tingkat + 1} CONC`;
      keluar.push(`${label} ${bagian}`.trimEnd());
    });
  });
}

function tulisPeristiwa(
  keluar: string[],
  tag: string,
  tanggal: string | null,
  tempat: string | null,
): void {
  const tanggalGedcom = tanggalKeGedcom(tanggal);
  if (!tanggalGedcom && !tempat) return;
  keluar.push(`1 ${tag}`);
  if (tanggalGedcom) keluar.push(`2 DATE ${tanggalGedcom}`);
  if (tempat) keluar.push(`2 PLAC ${bersihkan(tempat)}`);
}

/**
 * Menyusun berkas GEDCOM 5.5.1 untuk satu ruang kerja. Relasi orang tua–anak
 * dikelompokkan menjadi catatan FAM berdasarkan pasangan orang tua yang tercatat,
 * sehingga pohon tetap utuh saat dibuka di aplikasi silsilah lain.
 */
export function buatGedcom(
  ruangKerja: RuangKerja,
  semuaOrang: readonly Orang[],
  semuaRelasi: readonly Relasi[],
  semuaPasangan: readonly Pasangan[] = [],
): string {
  const ada = new Set(semuaOrang.map((orang) => orang.id));
  const label = new Map<string, string>();
  semuaOrang.forEach((orang, indeks) => label.set(orang.id, `@I${indeks + 1}@`));
  const peta = new Map(semuaOrang.map((orang) => [orang.id, orang]));

  const orangTuaDari = new Map<string, string[]>();
  for (const relasi of semuaRelasi) {
    if (!ada.has(relasi.orangTuaId) || !ada.has(relasi.anakId)) continue;
    const daftar = orangTuaDari.get(relasi.anakId) ?? [];
    if (!daftar.includes(relasi.orangTuaId)) daftar.push(relasi.orangTuaId);
    orangTuaDari.set(relasi.anakId, daftar);
  }

  const keluarga = new Map<string, { orangTua: string[]; anak: string[] }>();
  for (const [anak, orangTua] of orangTuaDari) {
    const kunci = [...orangTua].sort().join("|");
    const satu = keluarga.get(kunci) ?? { orangTua: [...orangTua].sort(), anak: [] };
    if (!satu.anak.includes(anak)) satu.anak.push(anak);
    keluarga.set(kunci, satu);
  }

  // Pasangan yang belum dianugerahi anak tetap dicatat sebagai keluarga tersendiri.
  const pasanganPerPasangan = new Map<string, Pasangan>();
  for (const satu of semuaPasangan) {
    if (!ada.has(satu.orangAId) || !ada.has(satu.orangBId)) continue;
    const urut = [satu.orangAId, satu.orangBId].sort();
    const kunci = urut.join("|");
    pasanganPerPasangan.set(kunci, satu);
    if (!keluarga.has(kunci)) keluarga.set(kunci, { orangTua: urut, anak: [] });
  }

  const keluar: string[] = [];
  keluar.push("0 HEAD");
  keluar.push("1 SOUR NASABKU");
  keluar.push("2 NAME Nasabku");
  keluar.push("2 VERS 1.0.0");
  keluar.push("1 GEDC");
  keluar.push("2 VERS 5.5.1");
  keluar.push("2 FORM LINEAGE-LINKED");
  keluar.push("1 CHAR UTF-8");
  const sekarang = new Date();
  keluar.push(`1 DATE ${sekarang.getUTCDate()} ${BULAN_GEDCOM[sekarang.getUTCMonth()]} ${sekarang.getUTCFullYear()}`);
  keluar.push("1 SUBM @U1@");
  keluar.push("0 @U1@ SUBM");
  keluar.push(`1 NAME ${namaGedcom(ruangKerja.nama) || "Nasabku"}`);

  for (const orang of semuaOrang) {
    keluar.push(`0 ${label.get(orang.id) ?? "@I0@"} INDI`);
    keluar.push(`1 NAME ${namaGedcom(orang.nama)}`);
    if (orang.namaLain) keluar.push(`1 NICK ${bersihkan(orang.namaLain)}`);
    const sex = orang.jenisKelamin === "L" ? "M" : orang.jenisKelamin === "P" ? "F" : "U";
    keluar.push(`1 SEX ${sex}`);
    tulisPeristiwa(keluar, "BIRT", orang.tanggalLahir, orang.tempatLahir);
    tulisPeristiwa(keluar, "DEAT", orang.tanggalWafat, orang.tempatWafat);
    if (orang.tempatPemakaman) {
      keluar.push("1 BURI");
      keluar.push(`2 PLAC ${bersihkan(orang.tempatPemakaman)}`);
    }
    if (orang.pekerjaan) keluar.push(`1 OCCU ${bersihkan(orang.pekerjaan)}`);
    const keterangan = [orang.catatan, orang.sumber ? `Sumber: ${orang.sumber}` : null]
      .filter((bagian): bagian is string => Boolean(bagian))
      .join("\n");
    if (keterangan) tulisTeks(keluar, 1, "NOTE", keterangan);
  }

  // Keluarga diurutkan menurut tanggal pernikahan supaya urutan pernikahan tetap terbaca.
  const daftarKeluarga = [...keluarga.entries()]
    .map(([kunci, isi]) => ({
      ...isi,
      kunci,
      pasangan: pasanganPerPasangan.get([...isi.orangTua].sort().join("|")) ?? null,
    }))
    .sort((a, b) => {
      if (a.pasangan && b.pasangan) {
        return bandingkanPernikahan(a.pasangan, b.pasangan) || a.kunci.localeCompare(b.kunci);
      }
      if (a.pasangan) return -1;
      if (b.pasangan) return 1;
      return a.kunci.localeCompare(b.kunci);
    });

  let nomor = 0;
  for (const satu of daftarKeluarga) {
    nomor += 1;
    keluar.push(`0 @F${nomor}@ FAM`);
    const jenis = (id: string): string => peta.get(id)?.jenisKelamin ?? "U";
    const bobot = (nilai: string): number => (nilai === "L" ? 0 : nilai === "P" ? 1 : 2);
    const urut = [...satu.orangTua].sort(
      (a, b) => bobot(jenis(a)) - bobot(jenis(b)) || a.localeCompare(b),
    );
    const [pertama, kedua] = urut;
    if (pertama) keluar.push(`1 HUSB ${label.get(pertama) ?? ""}`);
    if (kedua) keluar.push(`1 WIFE ${label.get(kedua) ?? ""}`);
    const tanggalMenikah = tanggalKeGedcom(satu.pasangan?.tanggalMenikah ?? null);
    if (tanggalMenikah) {
      keluar.push("1 MARR");
      keluar.push(`2 DATE ${tanggalMenikah}`);
    }
    if (satu.pasangan) {
      const status = satu.pasangan.status;
      const tanggalBerakhir = tanggalKeGedcom(satu.pasangan.tanggalBerakhir);
      // DIV adalah tag baku GEDCOM untuk perceraian; status lain memakai tag
      // khusus (diawali garis bawah) yang diabaikan dengan aman oleh aplikasi lain.
      keluar.push(`1 _STAT ${status}`);
      if (status === "cerai") {
        keluar.push("1 DIV");
        if (tanggalBerakhir) keluar.push(`2 DATE ${tanggalBerakhir}`);
      } else if (status === "meninggal") {
        keluar.push("1 _END");
        if (tanggalBerakhir) keluar.push(`2 DATE ${tanggalBerakhir}`);
      }
    }
    for (const anak of satu.anak) {
      keluar.push(`1 CHIL ${label.get(anak) ?? ""}`);
    }
  }

  keluar.push("0 TRLR");
  return `${keluar.join("\n")}\n`;
}

interface SimpulGedcom {
  xref: string | null;
  tag: string;
  nilai: string;
  anak: SimpulGedcom[];
}

const POLA_BARIS = /^(\d+)\s+(?:(@[^@\s]+@)\s+)?([A-Za-z_0-9]+)(?:\s(.*))?$/;

function uraikan(teks: string): SimpulGedcom[] {
  const akar: SimpulGedcom[] = [];
  const tumpukan: SimpulGedcom[] = [];

  for (const mentah of teks.split(/\r?\n/)) {
    const cocok = POLA_BARIS.exec(mentah.trimEnd());
    if (!cocok) continue;
    const tingkat = Number(cocok[1]);
    const tag = (cocok[3] ?? "").toUpperCase();
    const simpul: SimpulGedcom = {
      xref: cocok[2] ?? null,
      tag,
      nilai: (cocok[4] ?? "").trim(),
      anak: [],
    };

    if (tag === "CONT" || tag === "CONC") {
      const induk = tumpukan[tingkat - 1];
      if (induk) induk.nilai += (tag === "CONT" ? "\n" : "") + simpul.nilai;
      continue;
    }

    if (tingkat === 0) {
      akar.push(simpul);
      tumpukan.length = 0;
      tumpukan[0] = simpul;
      continue;
    }

    const induk = tumpukan[tingkat - 1];
    if (!induk) continue;
    induk.anak.push(simpul);
    tumpukan.length = tingkat;
    tumpukan[tingkat] = simpul;
  }

  return akar;
}

function anakBertag(simpul: SimpulGedcom, tag: string): SimpulGedcom[] {
  return simpul.anak.filter((anak) => anak.tag === tag);
}

function nilaiTag(simpul: SimpulGedcom, tag: string): string {
  return anakBertag(simpul, tag)[0]?.nilai.trim() ?? "";
}

function potong(nilai: string, maks: number): string | null {
  const bersih = bersihkan(nilai);
  return bersih ? bersih.slice(0, maks) : null;
}

export interface HasilImporGedcom {
  individu: { kunci: string; data: DataOrang }[];
  keluarga: {
    orangTua: string[];
    anak: string[];
    tanggalMenikah: string | null;
    status: StatusPernikahan;
    tanggalBerakhir: string | null;
  }[];
  tanggalDiabaikan: number;
  namaKosong: number;
}

export function bacaGedcom(teks: string): HasilImporGedcom {
  const akar = uraikan(teks);
  const individu: { kunci: string; data: DataOrang }[] = [];
  const terlihat = new Set<string>();
  let tanggalDiabaikan = 0;
  let namaKosong = 0;

  for (const simpul of akar) {
    if (simpul.tag !== "INDI") continue;
    const kunci = simpul.xref;
    if (!kunci || terlihat.has(kunci)) continue;

    const namaMentah = anakBertag(simpul, "NAME")
      .map((satu) => bersihkan(satu.nilai.replace(/\//g, " ")))
      .filter(Boolean);
    const nama = namaMentah[0] ?? bersihkan(nilaiTag(simpul, "NICK"));
    if (!nama) {
      namaKosong += 1;
      continue;
    }

    const sex = nilaiTag(simpul, "SEX").toUpperCase();
    const jenisKelamin = sex === "M" ? "L" : sex === "F" ? "P" : "U";

    const tanggalDari = (tag: string): string | null => {
      const peristiwa = anakBertag(simpul, tag)[0];
      if (!peristiwa) return null;
      const mentah = nilaiTag(peristiwa, "DATE");
      if (!mentah) return null;
      const hasil = gedcomKeTanggal(mentah);
      if (!hasil) tanggalDiabaikan += 1;
      return hasil;
    };

    const tempatDari = (tag: string): string | null => {
      const peristiwa = anakBertag(simpul, tag)[0];
      return peristiwa ? potong(nilaiTag(peristiwa, "PLAC"), 120) : null;
    };

    const tanggalLahir = tanggalDari("BIRT");
    let tanggalWafat = tanggalDari("DEAT");
    if (tanggalLahir && tanggalWafat && tanggalWafat < tanggalLahir) {
      tanggalWafat = null;
      tanggalDiabaikan += 1;
    }

    const catatanMentah = anakBertag(simpul, "NOTE")
      .map((satu) => satu.nilai)
      .join("\n")
      .trim();
    const barisCatatan = catatanMentah.split("\n");
    const barisSumber = barisCatatan.filter((baris) => /^sumber\s*:/i.test(baris));
    const sumber = barisSumber.length
      ? potong(
          barisSumber.map((baris) => baris.replace(/^sumber\s*:/i, "")).join("; "),
          300,
        )
      : null;
    const catatanTanpaSumber = barisCatatan
      .filter((baris) => !/^sumber\s*:/i.test(baris))
      .join("\n")
      .trim();

    const data: DataOrang = {
      nama: nama.slice(0, 120),
      namaLain: potong(nilaiTag(simpul, "NICK"), 120) ?? potong(namaMentah.slice(1).join(" / "), 120),
      jenisKelamin,
      tanggalLahir,
      tempatLahir: tempatDari("BIRT"),
      tanggalWafat,
      tempatWafat: tempatDari("DEAT"),
      pekerjaan: potong(nilaiTag(simpul, "OCCU"), 120),
      tempatPemakaman: tempatDari("BURI"),
      catatan: catatanTanpaSumber ? catatanTanpaSumber.slice(0, 2000) : null,
      sumber,
    };

    terlihat.add(kunci);
    individu.push({ kunci, data });
    if (individu.length >= BATAS_IMPOR_ORANG) break;
  }

  const keluarga = akar
    .filter((simpul) => simpul.tag === "FAM")
    .map((simpul) => {
      const pernikahan = anakBertag(simpul, "MARR")[0];
      const tanggalMentah = pernikahan ? nilaiTag(pernikahan, "DATE") : "";
      const perceraian = anakBertag(simpul, "DIV")[0];
      const berakhir = anakBertag(simpul, "_END")[0];
      const statusTertulis = nilaiTag(simpul, "_STAT").toLowerCase();

      let status: StatusPernikahan = "menikah";
      if (statusTertulis === "cerai" || statusTertulis === "meninggal") {
        status = statusTertulis;
      }
      if (perceraian) status = "cerai";

      const tanggalAkhir = (() => {
        const sumber = perceraian ?? berakhir;
        if (!sumber) return null;
        const tanggal = nilaiTag(sumber, "DATE");
        return tanggal ? gedcomKeTanggal(tanggal) : null;
      })();

      return {
        orangTua: [...anakBertag(simpul, "HUSB"), ...anakBertag(simpul, "WIFE")]
          .map((satu) => satu.nilai.trim())
          .filter(Boolean),
        anak: anakBertag(simpul, "CHIL")
          .map((satu) => satu.nilai.trim())
          .filter(Boolean),
        tanggalMenikah: tanggalMentah ? gedcomKeTanggal(tanggalMentah) : null,
        status,
        tanggalBerakhir: tanggalAkhir,
      };
    })
    // Keluarga tanpa anak tetap dibaca agar pasangan tanpa keturunan tidak hilang.
    .filter((satu) => satu.orangTua.length > 0);

  return { individu, keluarga, tanggalDiabaikan, namaKosong };
}
