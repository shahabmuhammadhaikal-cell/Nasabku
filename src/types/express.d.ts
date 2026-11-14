import type { PenggunaPublik, RuangKerja } from "../data/tipe.js";

/** Pengguna yang sudah dilampirkan middleware `wajibMasuk`. */
export type PenggunaPermintaan = PenggunaPublik;

declare global {
  namespace Express {
    interface Request {
      pengguna?: PenggunaPermintaan;
      ruangKerja?: RuangKerja;
      tokenSesi?: string;
      idPermintaan?: string;
    }
  }
}

export {};
