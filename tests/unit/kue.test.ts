import { describe, expect, it } from "vitest";
import { bacaKue, buatKue, hapusKue } from "../../src/lib/kue.js";

describe("kue", () => {
  it("memasang atribut keamanan penting", () => {
    const kue = buatKue("nasabku_sesi", "abc", { maxAgeDetik: 3600, secure: true });
    expect(kue).toContain("nasabku_sesi=abc");
    expect(kue).toContain("HttpOnly");
    expect(kue).toContain("SameSite=Lax");
    expect(kue).toContain("Path=/");
    expect(kue).toContain("Max-Age=3600");
    expect(kue).toContain("Secure");
  });

  it("tidak memakai Secure bila tidak diminta", () => {
    expect(buatKue("x", "y")).not.toContain("Secure");
  });

  it("menghapus kue dengan Max-Age=0", () => {
    expect(hapusKue("nasabku_sesi")).toContain("Max-Age=0");
  });

  it("membaca nilai kue di antara kue lain", () => {
    expect(bacaKue("a=1; nasabku_sesi=token-123; b=2", "nasabku_sesi")).toBe("token-123");
    expect(bacaKue("a=1; b=2", "nasabku_sesi")).toBeNull();
    expect(bacaKue(undefined, "nasabku_sesi")).toBeNull();
    expect(bacaKue("nasabku_sesi=", "nasabku_sesi")).toBeNull();
  });
});
