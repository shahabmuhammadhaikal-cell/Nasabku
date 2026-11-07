import { describe, expect, it } from "vitest";
import { refKoleksi, type DbMirip, type KoleksiMirip } from "../../src/data/firestore.js";

/** Firestore palsu yang hanya mencatat jalur koleksi yang diminta. */
function buatDbPalsu(): { db: DbMirip; catatan: string[] } {
  const catatan: string[] = [];
  const buatKoleksi = (jalur: string): KoleksiMirip => ({
    doc: (id: string) => ({
      collection: (sub: string) => {
        const anak = `${jalur}/${id}/${sub}`;
        catatan.push(anak);
        return buatKoleksi(anak);
      },
    }),
  });
  const db: DbMirip = {
    collection: (nama: string) => {
      catatan.push(nama);
      return buatKoleksi(nama);
    },
  };
  return { db, catatan };
}

describe("jalur koleksi Firestore", () => {
  it("menyusun koleksi akar", () => {
    const { db, catatan } = buatDbPalsu();
    refKoleksi(db, ["pengguna"]);
    expect(catatan).toEqual(["pengguna"]);
  });

  it("menyusun koleksi bersarang lewat dokumen", () => {
    const { db, catatan } = buatDbPalsu();
    refKoleksi(db, ["ruangKerja", "w1", "orang"]);
    expect(catatan).toEqual(["ruangKerja", "ruangKerja/w1/orang"]);
  });

  it("menolak jalur kosong atau genap", () => {
    const { db } = buatDbPalsu();
    expect(() => refKoleksi(db, [])).toThrow(/ganjil/);
    expect(() => refKoleksi(db, ["a", "b"])).toThrow(/ganjil/);
  });
});
