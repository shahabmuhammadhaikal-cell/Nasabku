import type { RequestHandler } from "express";
import type { Penyimpanan } from "../data/penyimpanan.js";
import { galat } from "../lib/kesalahan.js";
import { bacaKue } from "../lib/kue.js";
import { NAMA_KUE_SESI } from "../lib/sesi.js";

/** Menolak permintaan tanpa sesi yang sah, lalu mengisi req.pengguna. */
export function wajibMasuk(penyimpanan: Penyimpanan): RequestHandler {
  return async (req, _res, next) => {
    try {
      const token = bacaKue(req.headers.cookie, NAMA_KUE_SESI);
      if (!token) {
        next(galat(401, "BELUM_MASUK", "Anda belum masuk. Silakan masuk terlebih dahulu."));
        return;
      }
      const pengguna = await penyimpanan.penggunaDariSesi(token);
      if (!pengguna) {
        next(galat(401, "SESI_KEDALUWARSA", "Sesi Anda sudah berakhir. Silakan masuk kembali."));
        return;
      }
      // Akun yang dinonaktifkan atau masih menunggu persetujuan tidak boleh memakai API,
      // meskipun masih memegang sesi lama.
      if (pengguna.status === "nonaktif") {
        next(
          galat(403, "AKUN_NONAKTIF", "Akun ini dinonaktifkan admin. Hubungi admin keluarga."),
        );
        return;
      }
      if (pengguna.status === "menunggu") {
        next(
          galat(
            403,
            "AKUN_MENUNGGU",
            "Akun Anda masih menunggu persetujuan admin. Silakan coba lagi nanti.",
          ),
        );
        return;
      }
      req.pengguna = pengguna;
      req.tokenSesi = token;
      next();
    } catch (kesalahan) {
      next(kesalahan);
    }
  };
}

/** Hanya admin yang boleh lewat. Dipasang setelah `wajibMasuk`. */
export const wajibAdmin: RequestHandler = (req, _res, next) => {
  if (req.pengguna?.peran !== "admin") {
    next(galat(403, "BUKAN_ADMIN", "Hanya admin yang boleh membuka pengaturan ini."));
    return;
  }
  next();
};

/**
 * Memastikan ruang kerja ada dan milik pengguna yang sedang masuk.
 * Ruang kerja milik orang lain dijawab 404 agar keberadaannya tidak bocor.
 * Ruang kerja yang belum disetujui admin masih bisa dibaca pemiliknya, tetapi
 * tidak bisa diisi data sampai disetujui.
 */
export function muatRuangKerja(penyimpanan: Penyimpanan): RequestHandler {
  return async (req, _res, next) => {
    try {
      if (!req.pengguna) {
        next(galat(401, "BELUM_MASUK", "Anda belum masuk."));
        return;
      }
      const ruangKerja = await penyimpanan.ambilRuangKerja(
        String(req.params.workspaceId ?? ""),
        req.pengguna.id,
      );
      if (!ruangKerja) {
        next(galat(404, "RUANG_TIDAK_DITEMUKAN", "Ruang kerja tidak ditemukan."));
        return;
      }
      const menulis = req.method !== "GET" && req.method !== "HEAD";
      if (ruangKerja.status === "menunggu" && menulis && req.pengguna.peran !== "admin") {
        next(
          galat(
            403,
            "RUANG_MENUNGGU",
            "Ruang kerja ini menunggu persetujuan admin sebelum bisa diisi data.",
          ),
        );
        return;
      }
      req.ruangKerja = ruangKerja;
      next();
    } catch (kesalahan) {
      next(kesalahan);
    }
  };
}
