import type { Pasangan } from "../data/tipe.js";

/** Pasangan beserta urutan pernikahannya dari sisi masing-masing orang. */
export interface PasanganBerurut extends Pasangan {
  urutanA: number;
  urutanB: number;
}

/**
 * Urutan pernikahan menurut masing-masing orang. Pernikahan bertanggal lebih awal
 * bernomor lebih kecil; yang belum bertanggal ditaruh paling akhir agar tidak
 * mengacak urutan yang sudah pasti. Karena urutannya dihitung per orang, satu
 * pernikahan bisa menjadi pernikahan ke-2 bagi suami tetapi ke-1 bagi istri.
 */
export function urutkanPerOrang(semua: readonly Pasangan[]): PasanganBerurut[] {
  const perOrang = new Map<string, Pasangan[]>();
  for (const satu of semua) {
    for (const orangId of [satu.orangAId, satu.orangBId]) {
      const daftar = perOrang.get(orangId) ?? [];
      daftar.push(satu);
      perOrang.set(orangId, daftar);
    }
  }

  const urutan = new Map<string, { a: number; b: number }>();
  for (const [orangId, daftar] of perOrang) {
    [...daftar].sort(bandingkanPernikahan).forEach((satu, indeks) => {
      const catatan = urutan.get(satu.id) ?? { a: 1, b: 1 };
      if (satu.orangAId === orangId) catatan.a = indeks + 1;
      else catatan.b = indeks + 1;
      urutan.set(satu.id, catatan);
    });
  }

  return semua.map((satu) => {
    const catatan = urutan.get(satu.id) ?? { a: 1, b: 1 };
    return { ...satu, urutanA: catatan.a, urutanB: catatan.b };
  });
}

/** Urutan kronologis pernikahan: tanggal, lalu waktu pencatatan, lalu id. */
export function bandingkanPernikahan(a: Pasangan, b: Pasangan): number {
  const tanggalA = a.tanggalMenikah ?? "9999-99-99";
  const tanggalB = b.tanggalMenikah ?? "9999-99-99";
  return (
    tanggalA.localeCompare(tanggalB) ||
    a.dibuatPada.localeCompare(b.dibuatPada) ||
    a.id.localeCompare(b.id)
  );
}
