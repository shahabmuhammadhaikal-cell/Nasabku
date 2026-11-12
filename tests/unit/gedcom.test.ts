import { describe, expect, it } from "vitest";
import type { Orang, Relasi, RuangKerja } from "../../src/data/tipe.js";
import { bacaGedcom, buatGedcom, gedcomKeTanggal, tanggalKeGedcom } from "../../src/lib/gedcom.js";

const ruang: RuangKerja = {
  id: "r1",
  nama: "Keluarga Uji",
  pemilikId: "p1",
  dibuatPada: "2024-01-01T00:00:00.000Z",
};

function orang(sebagian: Partial<Orang> & { id: string; nama: string }): Orang {
  return {
    ruangKerjaId: "r1",
    namaLain: null,
    jenisKelamin: "L",
    tanggalLahir: null,
    tempatLahir: null,
    tanggalWafat: null,
    tempatWafat: null,
    pekerjaan: null,
    tempatPemakaman: null,
    catatan: null,
    sumber: null,
    dibuatPada: "2024-01-01T00:00:00.000Z",
    diperbaruiPada: "2024-01-01T00:00:00.000Z",
    ...sebagian,
  };
}

describe("tanggal GEDCOM", () => {
  it("mengubah tanggal bertingkat menjadi tanggal GEDCOM", () => {
    expect(tanggalKeGedcom("1954-06-12")).toBe("12 JUN 1954");
    expect(tanggalKeGedcom("1954-06")).toBe("JUN 1954");
    expect(tanggalKeGedcom("1954")).toBe("1954");
    expect(tanggalKeGedcom(null)).toBeNull();
    expect(tanggalKeGedcom("bukan tanggal")).toBeNull();
  });

  it("membaca tanggal GEDCOM, termasuk perkiraan dan nama bulan Indonesia", () => {
    expect(gedcomKeTanggal("12 JUN 1954")).toBe("1954-06-12");
    expect(gedcomKeTanggal("JUN 1954")).toBe("1954-06");
    expect(gedcomKeTanggal("1954")).toBe("1954");
    expect(gedcomKeTanggal("ABT 1954")).toBe("1954");
    expect(gedcomKeTanggal("12 JUNI 1954")).toBe("1954-06-12");
    expect(gedcomKeTanggal("3 DES 1990")).toBe("1990-12-03");
    expect(gedcomKeTanggal("1954-06-12")).toBe("1954-06-12");
    expect(gedcomKeTanggal("31 FEB 1954")).toBeNull();
    expect(gedcomKeTanggal("")).toBeNull();
    expect(gedcomKeTanggal("tidak diketahui")).toBeNull();
  });
});

describe("GEDCOM", () => {
  const kakek = orang({
    id: "o1",
    nama: "Kakek Gede",
    namaLain: "Pak Gede",
    tanggalLahir: "1940-04-02",
    tempatLahir: "Medan",
    tanggalWafat: "2001-08",
    tempatWafat: "Bandung",
    tempatPemakaman: "TPU Cikutra",
    pekerjaan: "Petani",
    catatan: "Petani di Deli.",
    sumber: "Wawancara cucu, 2024",
  });
  const ayah = orang({ id: "o2", nama: "Ayah Gede", tanggalLahir: "1968" });
  const cucu = orang({
    id: "o3",
    nama: "Cucu Gede",
    jenisKelamin: "P",
    tanggalLahir: "1998-11",
  });
  const relasi: Relasi[] = [
    { id: "o1_o2", ruangKerjaId: "r1", orangTuaId: "o1", anakId: "o2", dibuatPada: "2024-01-01T00:00:00.000Z" },
    { id: "o2_o3", ruangKerjaId: "r1", orangTuaId: "o2", anakId: "o3", dibuatPada: "2024-01-01T00:00:00.000Z" },
  ];

  it("menulis berkas GEDCOM yang sah dan lengkap", () => {
    const berkas = buatGedcom(ruang, [kakek, ayah, cucu], relasi);

    expect(berkas.startsWith("0 HEAD\n")).toBe(true);
    expect(berkas.trimEnd().endsWith("0 TRLR")).toBe(true);
    expect(berkas).toContain("2 VERS 5.5.1");
    expect(berkas).toContain("1 CHAR UTF-8");

    expect(berkas).toContain("0 @I1@ INDI");
    expect(berkas).toContain("1 NAME Kakek /Gede/");
    expect(berkas).toContain("1 NICK Pak Gede");
    expect(berkas).toContain("1 SEX M");
    expect(berkas).toContain("1 BIRT\n2 DATE 2 APR 1940\n2 PLAC Medan");
    expect(berkas).toContain("1 DEAT\n2 DATE AUG 2001\n2 PLAC Bandung");
    expect(berkas).toContain("1 BURI\n2 PLAC TPU Cikutra");
    expect(berkas).toContain("1 OCCU Petani");
    expect(berkas).toContain("1 NOTE Petani di Deli.");
    expect(berkas).toContain("2 CONT Sumber: Wawancara cucu, 2024");

    expect(berkas).toContain("1 SEX F");
    expect(berkas).toContain("1 BIRT\n2 DATE NOV 1998");

    expect(berkas).toContain("0 @F1@ FAM\n1 HUSB @I1@\n1 CHIL @I2@");
    expect(berkas).toContain("0 @F2@ FAM\n1 HUSB @I2@\n1 CHIL @I3@");
  });

  it("menulis pasangan tanpa anak sebagai satu keluarga", () => {
    const nenek = orang({ id: "o4", nama: "Nenek Gede", jenisKelamin: "P", tanggalLahir: "1945" });
    const berkas = buatGedcom(ruang, [kakek, nenek], [], [
      {
        id: "o1_o4",
        ruangKerjaId: "r1",
        orangAId: "o1",
        orangBId: "o4",
        status: "menikah",
        tanggalBerakhir: null,
        dibuatPada: "2024-01-01T00:00:00.000Z",
      },
    ]);

    expect(berkas).toContain("0 @F1@ FAM");
    expect(berkas).toContain("1 HUSB @I1@");
    expect(berkas).toContain("1 WIFE @I2@");
    expect(berkas).toContain("1 _STAT menikah");
    expect(berkas).not.toContain("1 CHIL");
  });

  it("membaca kembali berkas hasil ekspor tanpa kehilangan keterangan", () => {
    const hasil = bacaGedcom(buatGedcom(ruang, [kakek, ayah, cucu], relasi));

    expect(hasil.individu).toHaveLength(3);
    expect(hasil.keluarga).toHaveLength(2);
    expect(hasil.tanggalDiabaikan).toBe(0);

    const salinan = hasil.individu.find((satu) => satu.data.nama === "Kakek Gede");
    expect(salinan?.data).toMatchObject({
      namaLain: "Pak Gede",
      jenisKelamin: "L",
      tanggalLahir: "1940-04-02",
      tempatLahir: "Medan",
      tanggalWafat: "2001-08",
      tempatWafat: "Bandung",
      tempatPemakaman: "TPU Cikutra",
      pekerjaan: "Petani",
      catatan: "Petani di Deli.",
      sumber: "Wawancara cucu, 2024",
    });

    expect(hasil.individu.find((satu) => satu.data.nama === "Cucu Gede")?.data).toMatchObject({
      jenisKelamin: "P",
      tanggalLahir: "1998-11",
    });

    const jumlahAnak = hasil.keluarga.reduce((total, satu) => total + satu.anak.length, 0);
    expect(jumlahAnak).toBe(2);
  });

  it("mengabaikan tanggal mustahil dan entri tanpa nama, bukan mengarang data", () => {
    const berkas = [
      "0 HEAD",
      "1 CHAR UTF-8",
      "0 @I1@ INDI",
      "1 NAME Orang Tanpa Tanggal",
      "1 BIRT",
      "2 DATE 31 FEB 1954",
      "0 @I2@ INDI",
      "1 SEX M",
      "0 @I3@ INDI",
      "1 NAME Wafat Sebelum Lahir",
      "1 BIRT",
      "2 DATE 1990",
      "1 DEAT",
      "2 DATE 1980",
      "0 TRLR",
    ].join("\n");

    const hasil = bacaGedcom(berkas);
    expect(hasil.namaKosong).toBe(1);
    expect(hasil.individu.map((satu) => satu.data.nama).sort()).toEqual([
      "Orang Tanpa Tanggal",
      "Wafat Sebelum Lahir",
    ]);

    const tanpaTanggal = hasil.individu.find((satu) => satu.data.nama === "Orang Tanpa Tanggal");
    expect(tanpaTanggal?.data.tanggalLahir).toBeNull();

    const dibalik = hasil.individu.find((satu) => satu.data.nama === "Wafat Sebelum Lahir");
    expect(dibalik?.data.tanggalWafat).toBeNull();
    expect(hasil.tanggalDiabaikan).toBe(2);
  });
});
