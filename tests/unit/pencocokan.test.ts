import { describe, expect, it } from "vitest";
import type { DataOrang, Orang } from "../../src/data/tipe.js";
import { adaPerubahan, gabungkanData, normalkanNama, samaOrang } from "../../src/lib/pencocokan.js";

function orang(sebagian: Partial<Orang> & { nama: string }): Orang {
  return {
    id: "o1",
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

function data(sebagian: Partial<DataOrang> & { nama: string }): DataOrang {
  return {
    namaLain: null,
    jenisKelamin: "U",
    tanggalLahir: null,
    tempatLahir: null,
    tanggalWafat: null,
    tempatWafat: null,
    pekerjaan: null,
    tempatPemakaman: null,
    catatan: null,
    sumber: null,
    ...sebagian,
  };
}

describe("pencocokan orang saat impor", () => {
  it("menyamakan nama tanpa peduli huruf, aksen, dan tanda baca", () => {
    expect(normalkanNama("  Siti  Aminah ")).toBe("siti aminah");
    expect(normalkanNama("SITI AMINAH")).toBe("siti aminah");
    expect(normalkanNama("Ahmad Fauzi, S.Pd.")).toBe("ahmad fauzi s pd");
  });

  it("menganggap orang yang sama bila nama dan tahun lahir cocok", () => {
    const lama = orang({ nama: "Budi Santoso", tanggalLahir: "1954-06-12" });
    expect(samaOrang(data({ nama: "budi santoso", tanggalLahir: "1954" }), lama)).toBe(true);
    expect(samaOrang(data({ nama: "BUDI  SANTOso", jenisKelamin: "L" }), lama)).toBe(true);
  });

  it("tidak menggabungkan orang berbeda nama, tahun, atau jenis kelamin yang bertentangan", () => {
    const lama = orang({ nama: "Budi Santoso", tanggalLahir: "1954", jenisKelamin: "L" });
    expect(samaOrang(data({ nama: "Budi Santosa", tanggalLahir: "1954" }), lama)).toBe(false);
    expect(samaOrang(data({ nama: "Budi Santoso", tanggalLahir: "1960" }), lama)).toBe(false);
    expect(samaOrang(data({ nama: "Budi Santoso", jenisKelamin: "P" }), lama)).toBe(false);
  });

  it("hanya mengisi kolom kosong, tidak menimpa keterangan yang sudah ada", () => {
    const lama = orang({
      nama: "Budi Santoso",
      tanggalLahir: "1954-06-12",
      tempatLahir: "Medan",
      pekerjaan: "Petani",
      catatan: "Petani, makam di Cikutra.",
    });
    const gabungan = gabungkanData(
      lama,
      data({
        nama: "Budi Santoso",
        tanggalLahir: "1954",
        tempatLahir: "Bandung",
        pekerjaan: "Pedagang",
        tempatPemakaman: "TPU Cikutra",
        sumber: "Wawancara cucu, 2024",
      }),
    );

    expect(gabungan.tempatLahir).toBe("Medan");
    expect(gabungan.pekerjaan).toBe("Petani");
    expect(gabungan.catatan).toBe("Petani, makam di Cikutra.");
    expect(gabungan.tanggalLahir).toBe("1954-06-12");
    expect(gabungan.tempatPemakaman).toBe("TPU Cikutra");
    expect(gabungan.sumber).toBe("Wawancara cucu, 2024");
    expect(adaPerubahan(lama, gabungan)).toBe(true);
  });

  it("melaporkan tidak ada perubahan bila semua kolom sudah terisi", () => {
    const lama = orang({
      nama: "Budi Santoso",
      jenisKelamin: "L",
      tanggalLahir: "1954-06-12",
      tempatLahir: "Medan",
      pekerjaan: "Petani",
    });
    expect(
      adaPerubahan(
        lama,
        gabungkanData(lama, data({ nama: "Budi Santoso", jenisKelamin: "L", tanggalLahir: "1954" })),
      ),
    ).toBe(false);
  });
});
