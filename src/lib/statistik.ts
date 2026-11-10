import type { Orang, Relasi } from "../data/tipe.js";

export interface StatistikSilsilah {
  jumlahOrang: number;
  jumlahRelasi: number;
  lakiLaki: number;
  perempuan: number;
  belumDiketahui: number;
  /** Jumlah angkatan pada rantai terpanjang orang tua → anak. */
  jumlahAngkatan: number;
  tahunTertua: number | null;
  tahunTermuda: number | null;
  /** Orang tanpa orang tua tercatat. */
  jumlahAkar: number;
  /** Orang tanpa anak tercatat. */
  jumlahDaun: number;
}

/**
 * Ringkasan satu ruang kerja. Murni: hanya membaca daftar orang dan relasi,
 * sehingga Firestore dan penyimpanan uji memakai perhitungan yang sama.
 * Relasi yang salah satu ujungnya tidak ada diabaikan agar data lama tidak
 * membuat angka membingungkan.
 */
export function hitungStatistik(
  semuaOrang: readonly Orang[],
  semuaRelasi: readonly Relasi[],
): StatistikSilsilah {
  const ada = new Set(semuaOrang.map((orang) => orang.id));
  const anakDari = new Map<string, string[]>();
  const punyaOrangTua = new Set<string>();
  let jumlahRelasi = 0;

  for (const relasi of semuaRelasi) {
    if (!ada.has(relasi.orangTuaId) || !ada.has(relasi.anakId)) continue;
    jumlahRelasi += 1;
    punyaOrangTua.add(relasi.anakId);
    const daftar = anakDari.get(relasi.orangTuaId) ?? [];
    daftar.push(relasi.anakId);
    anakDari.set(relasi.orangTuaId, daftar);
  }

  const tinggi = new Map<string, number>();
  const hitungTinggi = (id: string, jalur: Set<string>): number => {
    const tersimpan = tinggi.get(id);
    if (tersimpan !== undefined) return tersimpan;
    // Data lama bisa membentuk lingkaran; simpul yang kembali ke jalurnya sendiri
    // tidak menambah angkatan, sehingga perhitungan tidak berputar tanpa henti.
    if (jalur.has(id)) return 0;

    jalur.add(id);
    let hasil = 1;
    for (const anak of anakDari.get(id) ?? []) {
      hasil = Math.max(hasil, 1 + hitungTinggi(anak, jalur));
    }
    jalur.delete(id);
    tinggi.set(id, hasil);
    return hasil;
  };

  let jumlahAngkatan = 0;
  for (const orang of semuaOrang) {
    jumlahAngkatan = Math.max(jumlahAngkatan, hitungTinggi(orang.id, new Set()));
  }

  const tahun = semuaOrang
    .map((orang) => orang.tahunLahir)
    .filter((nilai): nilai is number => typeof nilai === "number" && Number.isFinite(nilai));

  let lakiLaki = 0;
  let perempuan = 0;
  let belumDiketahui = 0;
  let jumlahAkar = 0;
  let jumlahDaun = 0;
  for (const orang of semuaOrang) {
    if (orang.jenisKelamin === "L") lakiLaki += 1;
    else if (orang.jenisKelamin === "P") perempuan += 1;
    else belumDiketahui += 1;

    if (!punyaOrangTua.has(orang.id)) jumlahAkar += 1;
    if ((anakDari.get(orang.id) ?? []).length === 0) jumlahDaun += 1;
  }

  return {
    jumlahOrang: semuaOrang.length,
    jumlahRelasi,
    lakiLaki,
    perempuan,
    belumDiketahui,
    jumlahAngkatan,
    tahunTertua: tahun.length ? Math.min(...tahun) : null,
    tahunTermuda: tahun.length ? Math.max(...tahun) : null,
    jumlahAkar,
    jumlahDaun,
  };
}
