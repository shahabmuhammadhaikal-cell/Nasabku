import { describe, expect, it } from "vitest";
import { SLUG_PATTERN, slugify } from "../../src/lib/slug";

describe("slugify", () => {
  it("menurunkan slug dari nama umum", () => {
    expect(slugify("Arsip Nasab Demo")).toBe("arsip-nasab-demo");
    expect(slugify("  Ruang  Kerja  2026  ")).toBe("ruang-kerja-2026");
  });

  it("membuang diakritik (NFKD)", () => {
    expect(slugify("Situs Nasâb Kú")).toBe("situs-nasab-ku");
  });

  it("tanda baca menjadi tanda hubung tanpa ganda di pinggir", () => {
    expect(slugify("*** Halo, Dunia! ***")).toBe("halo-dunia");
    expect(slugify("a---b")).toBe("a-b");
  });

  it("dipotong maksimum 64 karakter tanpa hubung menggantung", () => {
    const slug = slugify(`${"a".repeat(60)} kata`);
    expect(slug.length).toBeLessThanOrEqual(64);
    expect(slug.endsWith("-")).toBe(false);
  });

  it("hasil lolos pola; kasus kosong tidak lolos", () => {
    expect(SLUG_PATTERN.test(slugify("Ruang Kerja Utama"))).toBe(true);
    expect(SLUG_PATTERN.test("")).toBe(false);
    expect(SLUG_PATTERN.test("-awal")).toBe(false);
  });
});
