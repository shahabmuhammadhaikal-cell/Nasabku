import { describe, expect, it } from "vitest";
import { cocokSandi, hashSandi } from "../../src/lib/sandi.js";

describe("sandi", () => {
  it("menghasilkan hash berskema scrypt dengan garam berbeda tiap kali", () => {
    const a = hashSandi("RahasiaUji!123");
    const b = hashSandi("RahasiaUji!123");
    expect(a.startsWith("scrypt$")).toBe(true);
    expect(a).not.toBe(b);
    expect(a.split("$")).toHaveLength(3);
  });

  it("menerima kata sandi yang benar", () => {
    expect(cocokSandi("RahasiaUji!123", hashSandi("RahasiaUji!123"))).toBe(true);
  });

  it("menolak kata sandi yang salah", () => {
    expect(cocokSandi("salah-total", hashSandi("RahasiaUji!123"))).toBe(false);
  });

  it("menolak hash cacat tanpa melempar galat", () => {
    expect(cocokSandi("apa saja", "bukan-hash")).toBe(false);
    expect(cocokSandi("apa saja", "scrypt$aaa")).toBe(false);
    expect(cocokSandi("apa saja", "")).toBe(false);
  });
});
