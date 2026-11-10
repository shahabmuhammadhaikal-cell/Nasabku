import { describe, expect, it } from "vitest";
import { GalatApi } from "../../src/lib/kesalahan.js";
import {
  badanObjek,
  emailWajib,
  jenisKelaminWajib,
  kataSandiWajib,
  tanggalOpsional,
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

  it("memvalidasi tanggal bertingkat", () => {
    expect(tanggalOpsional({ tanggalLahir: "1954-06-12" }, "tanggalLahir", "Tanggal lahir")).toBe(
      "1954-06-12",
    );
    expect(tanggalOpsional({ tanggalLahir: "1954-06" }, "tanggalLahir", "Tanggal lahir")).toBe(
      "1954-06",
    );
    expect(tanggalOpsional({ tanggalLahir: " 1954 " }, "tanggalLahir", "Tanggal lahir")).toBe("1954");
    expect(tanggalOpsional({ tanggalLahir: "" }, "tanggalLahir", "Tanggal lahir")).toBeNull();
    expect(tanggalOpsional({ tanggalLahir: null }, "tanggalLahir", "Tanggal lahir")).toBeNull();
    expect(tanggalOpsional({}, "tanggalLahir", "Tanggal lahir")).toBeUndefined();
    expect(tangkap(() => tanggalOpsional({ tanggalLahir: 1954 }, "tanggalLahir", "Tanggal lahir")).status).toBe(
      422,
    );
    expect(tangkap(() => tanggalOpsional({ tanggalLahir: "1954-13" }, "tanggalLahir", "T")).status).toBe(422);
    expect(tangkap(() => tanggalOpsional({ tanggalLahir: "1954-02-30" }, "tanggalLahir", "T")).status).toBe(
      422,
    );
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
