const BULAN = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

const POLA = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/;

/**
 * Tanggal bertingkat: "1954" (hanya tahun), "1954-06" (tahun-bulan), atau
 * "1954-06-12" (lengkap). Ketelitian sebagian penting untuk leluhur yang
 * tanggal pastinya belum diketahui, tanpa mengarang tanggal.
 * Mengembalikan null bila formatnya tidak sah.
 */
export function parseTanggal(nilai: string): string | null {
  const cocok = POLA.exec(nilai.trim());
  if (!cocok) return null;

  const tahun = Number(cocok[1]);
  if (tahun < 1 || tahun > 2200) return null;

  const bulan = cocok[2] ? Number(cocok[2]) : null;
  if (bulan !== null && (bulan < 1 || bulan > 12)) return null;

  const hari = cocok[3] ? Number(cocok[3]) : null;
  if (hari !== null && bulan !== null) {
    const uji = new Date(Date.UTC(tahun, bulan - 1, hari));
    if (
      uji.getUTCFullYear() !== tahun ||
      uji.getUTCMonth() !== bulan - 1 ||
      uji.getUTCDate() !== hari
    ) {
      return null;
    }
  }

  return cocok[0];
}

export function tahunDari(tanggal: string | null): number | null {
  if (!tanggal) return null;
  const tahun = Number(tanggal.slice(0, 4));
  return Number.isInteger(tahun) && tahun > 0 ? tahun : null;
}

/** "1954-06-12" → "12 Juni 1954"; "1954-06" → "Juni 1954"; "1954" → "1954". */
export function formatTanggal(tanggal: string | null | undefined): string {
  if (!tanggal) return "";
  const cocok = POLA.exec(tanggal);
  if (!cocok) return tanggal;

  const tahun = Number(cocok[1]);
  if (!cocok[2]) return String(tahun);
  const bulan = BULAN[Number(cocok[2]) - 1] ?? "";
  if (!cocok[3]) return `${bulan} ${tahun}`;
  return `${Number(cocok[3])} ${bulan} ${tahun}`;
}
