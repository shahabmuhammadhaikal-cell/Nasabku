import { randomUUID } from "node:crypto";
import { galat } from "../lib/kesalahan.js";
import { buatTokenSesi, sidikToken } from "../lib/sesi.js";
import {
  akanMembentukSiklus as deteksiSiklus,
  telusuriSilsilah,
  type Arah,
  type HasilSilsilah,
} from "../lib/silsilah.js";
import type { BasisDokumen } from "./port.js";
import type {
  DataOrang,
  Orang,
  PenggunaPublik,
  PenggunaTersimpan,
  Relasi,
  RuangKerja,
} from "./tipe.js";
import { keOrang, kePengguna, kePenggunaTersimpan, keRelasi, keRuangKerja, teks } from "./tipe.js";

/** Batas dokumen yang dibaca per koleksi — cukup untuk satu silsilah keluarga besar. */
export const BATAS_DOKUMEN = 5000;
const MS_PER_HARI = 24 * 60 * 60 * 1000;

export interface Penyimpanan {
  readonly tersedia: boolean;

  cariPengguna(email: string): Promise<PenggunaTersimpan | null>;
  buatPengguna(data: { email: string; nama: string; sandiHash: string }): Promise<PenggunaPublik | null>;

  buatSesi(penggunaId: string, umurHari: number): Promise<string>;
  penggunaDariSesi(token: string): Promise<PenggunaPublik | null>;
  hapusSesi(token: string): Promise<void>;

  daftarRuangKerja(pemilikId: string): Promise<RuangKerja[]>;
  buatRuangKerja(pemilikId: string, nama: string): Promise<RuangKerja>;
  ambilRuangKerja(id: string, pemilikId: string): Promise<RuangKerja | null>;
  ubahNamaRuangKerja(ruang: RuangKerja, nama: string): Promise<RuangKerja>;
  hapusRuangKerja(id: string): Promise<void>;

  daftarOrang(ruangKerjaId: string, opsi?: { q?: string; batas?: number }): Promise<Orang[]>;
  buatOrang(ruangKerjaId: string, data: DataOrang): Promise<Orang>;
  ambilOrang(ruangKerjaId: string, id: string): Promise<Orang | null>;
  ubahOrang(ruangKerjaId: string, id: string, data: DataOrang): Promise<Orang | null>;
  hapusOrang(ruangKerjaId: string, id: string): Promise<boolean>;

  daftarRelasi(ruangKerjaId: string, orangId?: string): Promise<Relasi[]>;
  /** null berarti relasi orang tua–anak itu sudah tercatat. */
  buatRelasi(ruangKerjaId: string, orangTuaId: string, anakId: string): Promise<Relasi | null>;
  hapusRelasi(ruangKerjaId: string, id: string): Promise<boolean>;
  akanMembentukSiklus(ruangKerjaId: string, orangTuaId: string, anakId: string): Promise<boolean>;

  telusuri(
    ruangKerjaId: string,
    akarId: string,
    arah: Arah,
    kedalaman: number,
  ): Promise<HasilSilsilah | null>;

  cekKesiapan(): Promise<boolean>;
  tutup(): Promise<void>;
}

function urutNama(a: Orang, b: Orang): number {
  return (
    a.nama.localeCompare(b.nama, "id", { sensitivity: "base" }) || a.id.localeCompare(b.id)
  );
}

/**
 * Satu implementasi logika penyimpanan di atas antarmuka dokumen. Firestore dan memori
 * memakai jalur kode yang sama, sehingga perilaku yang diuji identik dengan produksi.
 */
export function buatPenyimpanan(basis: BasisDokumen): Penyimpanan {
  const pengguna = basis.koleksi(["pengguna"]);
  const emailIndex = basis.koleksi(["emailIndex"]);
  const sesi = basis.koleksi(["sesi"]);
  const ruang = basis.koleksi(["ruangKerja"]);
  const orangDi = (ruangKerjaId: string) => basis.koleksi(["ruangKerja", ruangKerjaId, "orang"]);
  const relasiDi = (ruangKerjaId: string) => basis.koleksi(["ruangKerja", ruangKerjaId, "relasi"]);

  const daftarRelasi = async (ruangKerjaId: string, orangId?: string): Promise<Relasi[]> => {
    const semua = (await relasiDi(ruangKerjaId).daftar(BATAS_DOKUMEN)).map(keRelasi);
    const saring = orangId
      ? semua.filter((relasi) => relasi.orangTuaId === orangId || relasi.anakId === orangId)
      : semua;
    return saring.sort(
      (a, b) => a.dibuatPada.localeCompare(b.dibuatPada) || a.id.localeCompare(b.id),
    );
  };

  return {
    tersedia: true,

    async cariPengguna(email) {
      const klaim = await emailIndex.ambil(email);
      if (!klaim) return null;
      const dokumen = await pengguna.ambil(teks(klaim.data.penggunaId));
      return dokumen ? kePenggunaTersimpan(dokumen) : null;
    },

    async buatPengguna({ email, nama, sandiHash }) {
      const id = randomUUID();
      const dibuatPada = new Date().toISOString();
      // Dokumen pengguna dibuat lebih dulu, lalu email diklaim; bila klaim gagal
      // (pendaftaran bersamaan dengan email sama) dokumen itu dibuang lagi.
      await pengguna.simpan(id, { email, nama, sandiHash, dibuatPada });
      const terklaim = await emailIndex.buat(email, { penggunaId: id, dibuatPada });
      if (!terklaim) {
        await pengguna.hapus(id);
        return null;
      }
      return { id, email, nama, dibuatPada };
    },

    async buatSesi(penggunaId, umurHari) {
      const token = buatTokenSesi();
      const sekarang = new Date();
      const kedaluwarsa = new Date(sekarang.getTime() + umurHari * MS_PER_HARI);
      await sesi.simpan(sidikToken(token), {
        penggunaId,
        dibuatPada: sekarang.toISOString(),
        kedaluwarsaPada: kedaluwarsa.toISOString(),
      });
      return token;
    },

    async penggunaDariSesi(token) {
      const sidik = sidikToken(token);
      const dokumen = await sesi.ambil(sidik);
      if (!dokumen) return null;
      const kedaluwarsaPada = teks(dokumen.data.kedaluwarsaPada);
      if (!kedaluwarsaPada || Date.parse(kedaluwarsaPada) <= Date.now()) {
        await sesi.hapus(sidik);
        return null;
      }
      const pemilik = await pengguna.ambil(teks(dokumen.data.penggunaId));
      if (!pemilik) {
        await sesi.hapus(sidik);
        return null;
      }
      return kePengguna(pemilik);
    },

    async hapusSesi(token) {
      await sesi.hapus(sidikToken(token));
    },

    async daftarRuangKerja(pemilikId) {
      const dokumen = await ruang.cari("pemilikId", pemilikId);
      return dokumen
        .map(keRuangKerja)
        .sort((a, b) => a.dibuatPada.localeCompare(b.dibuatPada) || a.id.localeCompare(b.id));
    },

    async buatRuangKerja(pemilikId, nama) {
      const id = randomUUID();
      const dibuatPada = new Date().toISOString();
      await ruang.simpan(id, { nama, pemilikId, dibuatPada });
      return { id, nama, pemilikId, dibuatPada };
    },

    async ambilRuangKerja(id, pemilikId) {
      const dokumen = await ruang.ambil(id);
      if (!dokumen) return null;
      const hasil = keRuangKerja(dokumen);
      return hasil.pemilikId === pemilikId ? hasil : null;
    },

    async ubahNamaRuangKerja(ruangKerja, nama) {
      await ruang.simpan(ruangKerja.id, {
        nama,
        pemilikId: ruangKerja.pemilikId,
        dibuatPada: ruangKerja.dibuatPada,
      });
      return { ...ruangKerja, nama };
    },

    async hapusRuangKerja(id) {
      // Firestore tidak menghapus subkoleksi otomatis; bersihkan isinya lebih dulu.
      for (const dokumen of await orangDi(id).daftar(BATAS_DOKUMEN)) {
        await orangDi(id).hapus(dokumen.id);
      }
      for (const dokumen of await relasiDi(id).daftar(BATAS_DOKUMEN)) {
        await relasiDi(id).hapus(dokumen.id);
      }
      await ruang.hapus(id);
    },

    async daftarOrang(ruangKerjaId, { q = "", batas = 500 } = {}) {
      const semua = (await orangDi(ruangKerjaId).daftar(BATAS_DOKUMEN)).map(keOrang);
      const kunci = q.trim().toLocaleLowerCase("id");
      const saring = kunci
        ? semua.filter((orang) => orang.nama.toLocaleLowerCase("id").includes(kunci))
        : semua;
      return saring.sort(urutNama).slice(0, batas);
    },

    async buatOrang(ruangKerjaId, data) {
      const id = randomUUID();
      const sekarang = new Date().toISOString();
      const orang: Orang = { id, ruangKerjaId, ...data, dibuatPada: sekarang, diperbaruiPada: sekarang };
      await orangDi(ruangKerjaId).simpan(id, { ...orang });
      return orang;
    },

    async ambilOrang(ruangKerjaId, id) {
      const dokumen = await orangDi(ruangKerjaId).ambil(id);
      return dokumen ? keOrang(dokumen) : null;
    },

    async ubahOrang(ruangKerjaId, id, data) {
      const dokumen = await orangDi(ruangKerjaId).ambil(id);
      if (!dokumen) return null;
      const lama = keOrang(dokumen);
      const orang: Orang = {
        ...lama,
        ...data,
        diperbaruiPada: new Date().toISOString(),
      };
      await orangDi(ruangKerjaId).simpan(id, { ...orang });
      return orang;
    },

    async hapusOrang(ruangKerjaId, id) {
      const koleksiOrang = orangDi(ruangKerjaId);
      if (!(await koleksiOrang.ambil(id))) return false;
      const koleksiRelasi = relasiDi(ruangKerjaId);
      for (const dokumen of await koleksiRelasi.daftar(BATAS_DOKUMEN)) {
        const relasi = keRelasi(dokumen);
        if (relasi.orangTuaId === id || relasi.anakId === id) {
          await koleksiRelasi.hapus(dokumen.id);
        }
      }
      await koleksiOrang.hapus(id);
      return true;
    },

    daftarRelasi,

    async buatRelasi(ruangKerjaId, orangTuaId, anakId) {
      const dibuatPada = new Date().toISOString();
      // Id dokumen deterministik: keunikan orang tua–anak dijamin Firestore sendiri.
      const id = `${orangTuaId}_${anakId}`;
      const terbuat = await relasiDi(ruangKerjaId).buat(id, {
        ruangKerjaId,
        orangTuaId,
        anakId,
        dibuatPada,
      });
      return terbuat ? { id, ruangKerjaId, orangTuaId, anakId, dibuatPada } : null;
    },

    async hapusRelasi(ruangKerjaId, id) {
      return relasiDi(ruangKerjaId).hapus(id);
    },

    async akanMembentukSiklus(ruangKerjaId, orangTuaId, anakId) {
      const relasi = await daftarRelasi(ruangKerjaId);
      return deteksiSiklus(relasi, orangTuaId, anakId);
    },

    async telusuri(ruangKerjaId, akarId, arah, kedalaman) {
      const dokumenAkar = await orangDi(ruangKerjaId).ambil(akarId);
      if (!dokumenAkar) return null;
      const [orang, relasi] = await Promise.all([
        orangDi(ruangKerjaId).daftar(BATAS_DOKUMEN).then((daftar) => daftar.map(keOrang)),
        relasiDi(ruangKerjaId).daftar(BATAS_DOKUMEN).then((daftar) => daftar.map(keRelasi)),
      ]);
      return telusuriSilsilah(keOrang(dokumenAkar), orang, relasi, arah, kedalaman);
    },

    async cekKesiapan() {
      try {
        await pengguna.daftar(1);
        return true;
      } catch {
        return false;
      }
    },

    async tutup() {
      await basis.tutup?.();
    },
  };
}

/**
 * Pengganti saat Firestore belum dikonfigurasi: aplikasi tetap hidup (health check tidak gagal),
 * tetapi setiap rute data menjawab 503 dengan pesan yang jelas, bukan 500 yang membingungkan.
 */
export function penyimpananBelumSiap(pesan: string): Penyimpanan {
  const tolak = async (): Promise<never> => {
    throw galat(503, "FIRESTORE_BELUM_DIKONFIGURASI", pesan);
  };
  const dasar: Record<string, unknown> = {
    tersedia: false,
    cekKesiapan: async () => false,
    tutup: async () => undefined,
  };
  return new Proxy(dasar, {
    get: (sasaran, kunci) =>
      typeof kunci === "string" && kunci in sasaran ? sasaran[kunci] : tolak,
  }) as unknown as Penyimpanan;
}
