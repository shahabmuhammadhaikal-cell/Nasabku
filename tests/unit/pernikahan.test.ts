import { describe, expect, it } from "vitest";
import type { Pasangan } from "../../src/data/tipe.js";
import { urutkanPerOrang } from "../../src/lib/pernikahan.js";

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

    expect(pertama).toMatchObject({ urutanA: 1, urutanB: 1 });
    expect(kedua).toMatchObject({ urutanA: 2, urutanB: 1 });
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

    expect(hasil.find((satu) => satu.id === "a_b")).toMatchObject({ urutanA: 1 });
    expect(hasil.find((satu) => satu.id === "a_c")).toMatchObject({ urutanA: 2 });
  });

  it("menaruh pernikahan tanpa tanggal di urutan terakhir", () => {
    const hasil = urutkanPerOrang([
      pasangan({ id: "a_c", orangAId: "a", orangBId: "c" }),
      pasangan({ id: "a_b", orangAId: "a", orangBId: "b", tanggalMenikah: "1960" }),
    ]);

    expect(hasil.find((satu) => satu.id === "a_b")).toMatchObject({ urutanA: 1 });
    expect(hasil.find((satu) => satu.id === "a_c")).toMatchObject({ urutanA: 2 });
  });

  it("menghitung urutan terpisah untuk orang yang tidak berbagi pasangan", () => {
    const hasil = urutkanPerOrang([
      pasangan({ id: "a_b", orangAId: "a", orangBId: "b", tanggalMenikah: "1950" }),
      pasangan({ id: "x_y", orangAId: "x", orangBId: "y", tanggalMenikah: "1990" }),
    ]);

    expect(hasil.find((satu) => satu.id === "x_y")).toMatchObject({ urutanA: 1, urutanB: 1 });
  });
});
