import type { RuangKerja } from "../data/tipe.js";

export interface PenggunaPermintaan {
  id: string;
  email: string;
  nama: string;
  dibuatPada: string;
}

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
