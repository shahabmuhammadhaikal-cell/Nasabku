import type { DatabaseSync } from "node:sqlite";
import type { RequestHandler } from "express";
import { keRuangKerja } from "../db.js";
import { galat } from "../lib/kesalahan.js";
import { bacaKue } from "../lib/kue.js";
import { ambilSesi, NAMA_KUE_SESI } from "../lib/sesi.js";

/** Menolak permintaan tanpa sesi yang sah, lalu mengisi req.pengguna. */
export function wajibMasuk(db: DatabaseSync): RequestHandler {
  return (req, _res, next) => {
    const token = bacaKue(req.headers.cookie, NAMA_KUE_SESI);
    if (!token) {
      next(galat(401, "BELUM_MASUK", "Anda belum masuk. Silakan masuk terlebih dahulu."));
      return;
    }
    const sesi = ambilSesi(db, token);
    if (!sesi) {
      next(galat(401, "SESI_KEDALUWARSA", "Sesi Anda sudah berakhir. Silakan masuk kembali."));
      return;
    }
    req.pengguna = sesi.pengguna;
    req.tokenSesi = token;
    next();
  };
}

/**
 * Memastikan ruang kerja ada dan milik pengguna yang sedang masuk.
 * Ruang kerja milik orang lain dijawab 404 agar keberadaannya tidak bocor.
 */
export function muatRuangKerja(db: DatabaseSync): RequestHandler {
  return (req, _res, next) => {
    const id = String(req.params.workspaceId ?? "");
    if (!req.pengguna) {
      next(galat(401, "BELUM_MASUK", "Anda belum masuk."));
      return;
    }
    const baris = db
      .prepare("SELECT * FROM ruang_kerja WHERE id = ? AND pemilik_id = ?")
      .get(id, req.pengguna.id) as Record<string, unknown> | undefined;
    if (!baris) {
      next(galat(404, "RUANG_TIDAK_DITEMUKAN", "Ruang kerja tidak ditemukan."));
      return;
    }
    req.ruangKerja = keRuangKerja(baris);
    next();
  };
}
