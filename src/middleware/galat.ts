import type { ErrorRequestHandler, RequestHandler } from "express";
import { GalatApi } from "../lib/kesalahan.js";

/** 404 untuk rute API yang tidak dikenal. */
export const ruteTidakAda: RequestHandler = (req, res) => {
  res.status(404).json({
    error: {
      kode: "RUTE_TIDAK_DITEMUKAN",
      pesan: `Rute ${req.method} ${req.path} tidak tersedia.`,
    },
  });
};

/** Mengubah galat menjadi amplop JSON yang konsisten, tanpa membocorkan detail internal. */
export const tanganiGalat: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof GalatApi) {
    res.status(err.status).json({
      error: {
        kode: err.kode,
        pesan: err.message,
        ...(err.rincian === undefined ? {} : { rincian: err.rincian }),
      },
      idPermintaan: req.idPermintaan,
    });
    return;
  }

  // Galat parser JSON dari express.json()
  if (err instanceof SyntaxError && "body" in err) {
    res.status(400).json({
      error: { kode: "JSON_TIDAK_VALID", pesan: "Badan permintaan bukan JSON yang sah." },
      idPermintaan: req.idPermintaan,
    });
    return;
  }

  console.error(
    JSON.stringify({
      tingkat: "error",
      idPermintaan: req.idPermintaan,
      metode: req.method,
      jalur: req.path,
      pesan: err instanceof Error ? err.message : String(err),
      tumpukan: err instanceof Error ? err.stack : undefined,
    }),
  );

  res.status(500).json({
    error: { kode: "GALAT_SERVER", pesan: "Terjadi kesalahan pada server." },
    idPermintaan: req.idPermintaan,
  });
};
