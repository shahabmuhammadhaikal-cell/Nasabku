import { describe, expect, it } from "vitest";
import { formatTanggal, parseTanggal, tahunDari } from "../../src/lib/tanggal.js";

describe("tanggal bertingkat", () => {
  it("menerima tahun, tahun-bulan, dan tanggal lengkap", () => {
    expect(parseTanggal("1954")).toBe("1954");
    expect(parseTanggal("1954-06")).toBe("1954-06");
    expect(parseTanggal("1954-06-12")).toBe("1954-06-12");
    expect(parseTanggal(" 1954-06-12 ")).toBe("1954-06-12");
  });

  it("menolak format atau tanggal yang tidak mungkin", () => {
    for (const salah of [
      "",
      "12-06-1954",
      "1954/06/12",
      "1954-13",
      "1954-00",
      "1954-02-30",
      "1954-06-31",
      "0000",
      "3000",
      "abc",
    ]) {
      expect(parseTanggal(salah)).toBeNull();
    }
  });

  it("menerima 29 Februari pada tahun kabisat saja", () => {
    expect(parseTanggal("2024-02-29")).toBe("2024-02-29");
    expect(parseTanggal("2023-02-29")).toBeNull();
  });

  it("mengambil tahun untuk perhitungan statistik", () => {
    expect(tahunDari("1954-06-12")).toBe(1954);
    expect(tahunDari("1954")).toBe(1954);
    expect(tahunDari(null)).toBeNull();
    expect(tahunDari("")).toBeNull();
  });

  it("memformat ke bahasa Indonesia sesuai ketelitiannya", () => {
    expect(formatTanggal("1954-06-12")).toBe("12 Juni 1954");
    expect(formatTanggal("1954-06")).toBe("Juni 1954");
    expect(formatTanggal("1954")).toBe("1954");
    expect(formatTanggal(null)).toBe("");
  });
});
