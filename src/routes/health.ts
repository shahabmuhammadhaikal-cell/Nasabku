import { Router } from "express";
import type { DatabaseSync } from "node:sqlite";
import type { Konfigurasi } from "../config.js";
import type { Baris } from "../db.js";

/**
 * /live  : proses hidup — dipakai health check platform (tidak menyentuh basis data).
 * /ready : selalu 200 agar deploy tidak pernah tertahan oleh basis data, tetapi
 *          menyatakan keterjangkauan database secara eksplisit.
 */
export function ruteKesehatan(db: DatabaseSync, konfigurasi: Konfigurasi): Router {
  const rute = Router();

  rute.get("/live", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json({
      status: "hidup",
      versi: konfigurasi.versiAplikasi,
      waktu: new Date().toISOString(),
    });
  });

  rute.get("/ready", (_req, res) => {
    let database = "tersedia";
    try {
      db.prepare("SELECT 1 AS satu").get() as Baris | undefined;
    } catch {
      database = "tidak tersedia";
    }

    res.setHeader("Cache-Control", "no-store");
    res.json({
      status: database === "tersedia" ? "siap" : "siap-terbatas",
      database,
      versi: konfigurasi.versiAplikasi,
    });
  });

  return rute;
}
