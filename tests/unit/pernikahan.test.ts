import { describe, expect, it } from "vitest";
import type { Pasangan } from "../../src/data/tipe.js";
import { urutanBagi, urutkanPerOrang } from "../../src/lib/pernikahan.js";

function pasangan(sebagian: Partial<Pasangan> & { id: string; orangAId: string; orangBId: string }): Pasangan {
  return {
    ruangKerjaId: "r1",
    tanggalMenikah: null,
    dibuatPada: "2024-01-01T00:00:00.000Z",
    ...sebagian,
  };
}

describe("urutan pernikahan per orang", () => {
  it("memberi nomor berbeda untuk satu pernikahan bila salah satu pihak sudah pernah menikah", () => {
    const hasil = urutkanPerOrang([
      pasangan({
        id: "a_b",
        orangAId: "a",
        orangBId: "b",
        tanggalMenikah: "1975-06-12",
      }),
      pasangan({
        id: "a_c",
        orangAId: "a",
        orangBId: "c",
        tanggalMenikah: "1985",
      }),
    ]);

    const pertama = hasil.find((satu) => satu.id === "a_b");
    const kedua = hasil.find((satu) => satu.id === "a_c");

    expect(urutanBagi(pertama!, "a")).toBe(1);
    expect(urutanBagi(kedua!, "a")).toBe(2);
    expect(urutanBagi(pertama!, "b")).toBe(1);
    expect(urutanBagi(kedua!, "c")).toBe(1);
  });

  it("mengurutkan menurut tanggal menikah, bukan urutan pencatatan", () => {
    const hasil = urutkanPerOrang([
      pasangan({
        id: "a_c",
        orangAId: "a",
        orangBId: "c",
        tanggalMenikah: "1985",
        dibuatPada: "2024-01-01T00:00:00.000Z",
      }),
      pasangan({
        id: "a_b",
        orangAId: "a",
        orangBId: "b",
        tanggalMenikah: "1975",
        dibuatPada: "2024-02-01T00:00:00.000Z",
      }),
    ]);

    expect(urutanBagi(hasil.find((satu) => satu.id === "a_b")!, "a")).toBe(1);
    expect(urutanBagi(hasil.find((satu) => satu.id === "a_c")!, "a")).toBe(2);
  });

  it("menaruh pernikahan tanpa tanggal di urutan terakhir", () => {
    const hasil = urutkanPerOrang([
      pasangan({ id: "a_c", orangAId: "a", orangBId: "c" }),
      pasangan({ id: "a_b", orangAId: "a", orangBId: "b", tanggalMenikah: "1960" }),
    ]);

    expect(urutanBagi(hasil.find((satu) => satu.id === "a_b")!, "a")).toBe(1);
    expect(urutanBagi(hasil.find((satu) => satu.id === "a_c")!, "a")).toBe(2);
  });

  it("menghitung urutan terpisah untuk orang yang tidak berbagi pasangan", () => {
    const hasil = urutkanPerOrang([
      pasangan({ id: "a_b", orangAId: "a", orangBId: "b", tanggalMenikah: "1950" }),
      pasangan({ id: "x_y", orangAId: "x", orangBId: "y", tanggalMenikah: "1990" }),
    ]);

    expect(urutanBagi(hasil.find((satu) => satu.id === "x_y")!, "x")).toBe(1);
    expect(urutanBagi(hasil.find((satu) => satu.id === "x_y")!, "y")).toBe(1);
  });
});
