import { describe, expect, it } from "vitest";
import type { Orang, Relasi } from "../../src/data/tipe.js";
import { hitungStatistik } from "../../src/lib/statistik.js";

const orang = (id: string, tambahan: Partial<Orang> = {}): Orang => ({
  id,
  ruangKerjaId: "ruang-1",
  nama: id,
  jenisKelamin: "U",
  tahunLahir: null,
  tahunWafat: null,
  catatan: null,
  dibuatPada: "2026-01-01T00:00:00.000Z",
  diperbaruiPada: "2026-01-01T00:00:00.000Z",
  ...tambahan,
});

const relasi = (orangTuaId: string, anakId: string): Relasi => ({
  id: `${orangTuaId}_${anakId}`,
  ruangKerjaId: "ruang-1",
  orangTuaId,
  anakId,
  dibuatPada: "2026-01-01T00:00:00.000Z",
});

describe("statistik silsilah", () => {
  it("memberi angka nol untuk ruang kerja kosong", () => {
    expect(hitungStatistik([], [])).toEqual({
      jumlahOrang: 0,
      jumlahRelasi: 0,
      lakiLaki: 0,
      perempuan: 0,
      belumDiketahui: 0,
      jumlahAngkatan: 0,
      tahunTertua: null,
      tahunTermuda: null,
      jumlahAkar: 0,
      jumlahDaun: 0,
    });
  });

  it("menghitung tiga angkatan, akar, daun, dan rentang tahun", () => {
    const statistik = hitungStatistik(
      [
        orang("kakek", { jenisKelamin: "L", tahunLahir: 1940 }),
        orang("ayah", { jenisKelamin: "L", tahunLahir: 1968 }),
        orang("cucu", { jenisKelamin: "P", tahunLahir: 1998 }),
      ],
      [relasi("kakek", "ayah"), relasi("ayah", "cucu")],
    );

    expect(statistik.jumlahOrang).toBe(3);
    expect(statistik.jumlahRelasi).toBe(2);
    expect(statistik.jumlahAngkatan).toBe(3);
    expect(statistik.jumlahAkar).toBe(1);
    expect(statistik.jumlahDaun).toBe(1);
    expect(statistik.lakiLaki).toBe(2);
    expect(statistik.perempuan).toBe(1);
    expect(statistik.belumDiketahui).toBe(0);
    expect(statistik.tahunTertua).toBe(1940);
    expect(statistik.tahunTermuda).toBe(1998);
  });

  it("memakai rantai terpanjang saat ada beberapa cabang", () => {
    const statistik = hitungStatistik(
      [orang("a"), orang("b"), orang("c"), orang("d")],
      [relasi("a", "b"), relasi("b", "c"), relasi("a", "d")],
    );

    expect(statistik.jumlahAngkatan).toBe(3);
    expect(statistik.jumlahAkar).toBe(1);
    expect(statistik.jumlahDaun).toBe(2);
  });

  it("mengabaikan relasi yang ujungnya tidak ada", () => {
    const statistik = hitungStatistik([orang("a")], [relasi("a", "hilang")]);

    expect(statistik.jumlahRelasi).toBe(0);
    expect(statistik.jumlahAngkatan).toBe(1);
    expect(statistik.jumlahDaun).toBe(1);
    expect(statistik.jumlahAkar).toBe(1);
  });

  it("tidak menggantung bila data lama membentuk lingkaran", () => {
    const statistik = hitungStatistik(
      [orang("a"), orang("b")],
      [relasi("a", "b"), relasi("b", "a")],
    );

    expect(statistik.jumlahRelasi).toBe(2);
    expect(statistik.jumlahAngkatan).toBe(2);
    expect(statistik.jumlahAkar).toBe(0);
    expect(statistik.jumlahDaun).toBe(0);
  });
});
