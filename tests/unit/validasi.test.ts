import { describe, expect, it } from "vitest";
import { GalatApi } from "../../src/lib/kesalahan.js";
import {
  badanObjek,
  emailWajib,
  jenisKelaminWajib,
  kataSandiWajib,
  tahunOpsional,
  teksOpsional,
  teksWajib,
} from "../../src/lib/validasi.js";

function tangkap(fn: () => unknown): GalatApi {
  try {
    fn();
  } catch (galat) {
    expect(galat).toBeInstanceOf(GalatApi);
    return galat as GalatApi;
  }
  throw new Error("seharusnya melempar GalatApi");
}

describe("validasi", () => {
  it("menolak badan yang bukan objek", () => {
    for (const nilai of [null, "teks", 42, []]) {
      expect(tangkap(() => badanObjek(nilai)).status).toBe(400);
    }
  });

  it("memangkas spasi dan menegakkan panjang teks", () => {
    expect(teksWajib({ nama: "  Budi  " }, "nama", "Nama")).toBe("Budi");
    expect(tangkap(() => teksWajib({ nama: "   " }, "nama", "Nama")).status).toBe(422);
    expect(tangkap(() => teksWajib({ nama: "x".repeat(50) }, "nama", "Nama", 1, 10)).status).toBe(422);
    expect(tangkap(() => teksWajib({}, "nama", "Nama")).status).toBe(422);
  });

  it("membedakan tidak dikirim dan dikosongkan pada teks opsional", () => {
    expect(teksOpsional({}, "catatan", "Catatan")).toBeUndefined();
    expect(teksOpsional({ catatan: null }, "catatan", "Catatan")).toBeNull();
    expect(teksOpsional({ catatan: "  " }, "catatan", "Catatan")).toBeNull();
    expect(teksOpsional({ catatan: " asal " }, "catatan", "Catatan")).toBe("asal");
  });

  it("memvalidasi tahun", () => {
    expect(tahunOpsional({ tahunLahir: 1954 }, "tahunLahir", "Tahun lahir")).toBe(1954);
    expect(tahunOpsional({ tahunLahir: "1954" }, "tahunLahir", "Tahun lahir")).toBe(1954);
    expect(tahunOpsional({ tahunLahir: "" }, "tahunLahir", "Tahun lahir")).toBeNull();
    expect(tahunOpsional({}, "tahunLahir", "Tahun lahir")).toBeUndefined();
    expect(tangkap(() => tahunOpsional({ tahunLahir: 0 }, "tahunLahir", "Tahun lahir")).status).toBe(422);
    expect(tangkap(() => tahunOpsional({ tahunLahir: 3000 }, "tahunLahir", "Tahun lahir")).status).toBe(422);
    expect(tangkap(() => tahunOpsional({ tahunLahir: 19.5 }, "tahunLahir", "Tahun lahir")).status).toBe(422);
  });

  it("hanya menerima jenis kelamin L, P, atau U", () => {
    expect(jenisKelaminWajib({ jenisKelamin: "P" })).toBe("P");
    expect(jenisKelaminWajib({})).toBe("U");
    expect(tangkap(() => jenisKelaminWajib({ jenisKelamin: "X" })).status).toBe(422);
  });

  it("memeriksa email dan kata sandi", () => {
    expect(emailWajib({ email: " Budi@Contoh.COM " })).toBe("budi@contoh.com");
    expect(tangkap(() => emailWajib({ email: "bukan-email" })).status).toBe(422);
    expect(tangkap(() => kataSandiWajib({ sandi: "pendek" })).status).toBe(422);
    expect(kataSandiWajib({ sandi: "RahasiaUji!123" })).toBe("RahasiaUji!123");
  });
});
