import { Router, type Response } from "express";
import type { Konfigurasi } from "../config.js";
import type { Penyimpanan } from "../data/penyimpanan.js";
import { galat } from "../lib/kesalahan.js";
import { bacaKue, buatKue, hapusKue } from "../lib/kue.js";
import { cocokSandi, hashSandi } from "../lib/sandi.js";
import { NAMA_KUE_SESI } from "../lib/sesi.js";
import { badanObjek, emailWajib, kataSandiWajib, teksWajib } from "../lib/validasi.js";
import { wajibMasuk } from "../middleware/auth.js";

export function ruteAuth(penyimpanan: Penyimpanan, konfigurasi: Konfigurasi): Router {
  const rute = Router();
  const masaKue = konfigurasi.umurSesiHari * 24 * 60 * 60;

  const pasangKueSesi = (res: Response, token: string): void => {
    res.setHeader(
      "Set-Cookie",
      buatKue(NAMA_KUE_SESI, token, {
        httpOnly: true,
        secure: konfigurasi.kueAman,
        sameSite: "Lax",
        maxAgeDetik: masaKue,
      }),
    );
  };

  rute.post("/register", async (req, res) => {
    const badan = badanObjek(req.body);
    const email = emailWajib(badan);
    const nama = teksWajib(badan, "nama", "Nama", 2, 80);
    const sandi = kataSandiWajib(badan);

    if (await penyimpanan.cariPengguna(email)) {
      throw galat(409, "EMAIL_TERDAFTAR", "Email ini sudah terdaftar. Silakan masuk.");
    }

    const dibuat = await penyimpanan.buatPengguna({ email, nama, sandiHash: hashSandi(sandi) });
    if (!dibuat) {
      // Kalah balapan dengan pendaftaran lain untuk email yang sama.
      throw galat(409, "EMAIL_TERDAFTAR", "Email ini sudah terdaftar. Silakan masuk.");
    }

    pasangKueSesi(res, await penyimpanan.buatSesi(dibuat.id, konfigurasi.umurSesiHari));
    res.status(201).json({ pengguna: dibuat });
  });

  rute.post("/login", async (req, res) => {
    const badan = badanObjek(req.body);
    const email = emailWajib(badan);
    const sandi = kataSandiWajib(badan);

    const tersimpan = await penyimpanan.cariPengguna(email);
    if (!tersimpan || !cocokSandi(sandi, tersimpan.sandiHash)) {
      throw galat(401, "KREDENSIAL_SALAH", "Email atau kata sandi tidak cocok.");
    }

    pasangKueSesi(res, await penyimpanan.buatSesi(tersimpan.id, konfigurasi.umurSesiHari));
    res.json({
      pengguna: {
        id: tersimpan.id,
        email: tersimpan.email,
        nama: tersimpan.nama,
        dibuatPada: tersimpan.dibuatPada,
      },
    });
  });

  rute.post("/logout", async (req, res) => {
    const token = bacaKue(req.headers.cookie, NAMA_KUE_SESI);
    if (token) await penyimpanan.hapusSesi(token);
    res.setHeader("Set-Cookie", hapusKue(NAMA_KUE_SESI, { secure: konfigurasi.kueAman }));
    res.status(204).end();
  });

  rute.get("/me", wajibMasuk(penyimpanan), (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json({ pengguna: req.pengguna });
  });

  return rute;
}
