import { Router } from "express";
import type { DatabaseSync } from "node:sqlite";
import { galat } from "../lib/kesalahan.js";
import { telusuriSilsilah, type Arah } from "../lib/silsilah.js";

export function ruteSilsilah(db: DatabaseSync): Router {
  const rute = Router({ mergeParams: true });

  rute.get("/:orangId", (req, res) => {
    const arahMentah = typeof req.query.arah === "string" ? req.query.arah : "turun";
    if (arahMentah !== "turun" && arahMentah !== "naik") {
      throw galat(422, "VALIDASI_GAGAL", 'Parameter "arah" harus "turun" atau "naik".', { field: "arah" });
    }
    const kedalamanMentah = Number(req.query.kedalaman ?? 5);
    if (!Number.isInteger(kedalamanMentah) || kedalamanMentah < 1 || kedalamanMentah > 10) {
      throw galat(422, "VALIDASI_GAGAL", 'Parameter "kedalaman" harus bilangan bulat 1–10.', {
        field: "kedalaman",
      });
    }

    const hasil = telusuriSilsilah(
      db,
      req.ruangKerja?.id ?? "",
      String(req.params.orangId),
      arahMentah as Arah,
      kedalamanMentah,
    );
    if (!hasil) throw galat(404, "ORANG_TIDAK_DITEMUKAN", "Orang tidak ditemukan di ruang kerja ini.");

    res.json(hasil);
  });

  return rute;
}
