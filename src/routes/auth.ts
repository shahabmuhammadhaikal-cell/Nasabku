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

    const pengaturan = await penyimpanan.ambilPengaturan();
    if (!pengaturan.pendaftaranTerbuka) {
      throw galat(
        403,
        "PENDAFTARAN_DITUTUP",
        "Pendaftaran akun baru sedang ditutup. Hubungi admin keluarga.",
      );
    }

    // Akun pertama menjadi admin agar proyek baru tetap bisa diatur tanpa skrip manual.
    const penggunaPertama = (await penyimpanan.hitungPengguna()) === 0;
    const status = penggunaPertama
      ? "aktif"
      : pengaturan.setujuiPendaftaran
        ? "menunggu"
        : "aktif";

    const dibuat = await penyimpanan.buatPengguna({
      email,
      nama,
      sandiHash: hashSandi(sandi),
      peran: penggunaPertama ? "admin" : "pengguna",
      status,
    });
    if (!dibuat) {
      // Kalah balapan dengan pendaftaran lain untuk email yang sama.
      throw galat(409, "EMAIL_TERDAFTAR", "Email ini sudah terdaftar. Silakan masuk.");
    }

    if (dibuat.status === "menunggu") {
      // Belum diberi sesi: akun harus disetujui admin lebih dulu.
      res.status(201).json({
        pengguna: dibuat,
        menunggu: true,
        pesan: "Pendaftaran berhasil. Akun menunggu persetujuan admin sebelum bisa dipakai.",
      });
      return;
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

    if (tersimpan.status === "menunggu") {
      throw galat(
        403,
        "AKUN_MENUNGGU",
        "Akun Anda masih menunggu persetujuan admin. Silakan coba lagi nanti.",
      );
    }
    if (tersimpan.status === "nonaktif") {
      throw galat(403, "AKUN_NONAKTIF", "Akun ini dinonaktifkan admin. Hubungi admin keluarga.");
    }

    pasangKueSesi(res, await penyimpanan.buatSesi(tersimpan.id, konfigurasi.umurSesiHari));
    res.json({
      pengguna: {
        id: tersimpan.id,
        email: tersimpan.email,
        nama: tersimpan.nama,
        dibuatPada: tersimpan.dibuatPada,
        peran: tersimpan.peran,
        status: tersimpan.status,
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
