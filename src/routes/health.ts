import { Router } from "express";
import type { Konfigurasi } from "../config.js";
import type { Penyimpanan } from "../data/penyimpanan.js";

/** Batas waktu pemeriksaan Firestore agar /ready tidak pernah menggantung. */
const BATAS_UJI_MS = 4000;

async function statusDatabase(penyimpanan: Penyimpanan): Promise<string> {
  if (!penyimpanan.tersedia) return "belum dikonfigurasi";

  const batasWaktu = new Promise<boolean>((selesai) => {
    setTimeout(() => selesai(false), BATAS_UJI_MS).unref();
  });

  try {
    const siap = await Promise.race([penyimpanan.cekKesiapan(), batasWaktu]);
    return siap ? "tersedia" : "tidak tersedia";
  } catch {
    return "tidak tersedia";
  }
}

/**
 * /live  : proses hidup — dipakai health check platform (tidak menyentuh Firestore).
 * /ready : selalu 200 agar deploy tidak pernah tertahan oleh basis data, tetapi
 *          menyatakan keterjangkauan Firestore secara eksplisit.
 */
export function ruteKesehatan(penyimpanan: Penyimpanan, konfigurasi: Konfigurasi): Router {
  const rute = Router();

  rute.get("/live", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json({
      status: "hidup",
      versi: konfigurasi.versiAplikasi,
      waktu: new Date().toISOString(),
    });
  });

  rute.get("/ready", async (_req, res) => {
    const database = await statusDatabase(penyimpanan);

    res.setHeader("Cache-Control", "no-store");
    res.json({
      status: database === "tersedia" ? "siap" : "siap-terbatas",
      database,
      penyimpanan: "firestore",
      versi: konfigurasi.versiAplikasi,
      ...(database === "belum dikonfigurasi"
        ? { petunjukKredensial: konfigurasi.petunjukKredensial }
        : {}),
      ...(konfigurasi.firestoreMasalah ? { catatan: konfigurasi.firestoreMasalah } : {}),
    });
  });

  return rute;
}
