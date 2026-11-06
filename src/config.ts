import process from "node:process";

export type Lingkungan = "development" | "production" | "test";

export interface Konfigurasi {
  port: number;
  lingkungan: Lingkungan;
  berkasDatabase: string;
  umurSesiHari: number;
  kueAman: boolean;
  versiAplikasi: string;
}

function angka(nilai: string | undefined, bawaan: number): number {
  const hasil = Number(nilai);
  return Number.isFinite(hasil) && hasil > 0 ? hasil : bawaan;
}

function lingkunganDari(nilai: string | undefined): Lingkungan {
  if (nilai === "production") return "production";
  if (nilai === "test") return "test";
  return "development";
}

/** Membaca konfigurasi dari variabel lingkungan, dengan nilai bawaan yang aman untuk pengembangan lokal. */
export function muatKonfigurasi(env: NodeJS.ProcessEnv = process.env): Konfigurasi {
  return {
    port: angka(env.PORT, 3000),
    lingkungan: lingkunganDari(env.NODE_ENV),
    berkasDatabase: env.DATABASE_PATH?.trim() || "./data/nasabku.db",
    umurSesiHari: angka(env.SESSION_TTL_HARI, 30),
    kueAman: env.COOKIE_SECURE === "true",
    versiAplikasi: "1.0.0",
  };
}
