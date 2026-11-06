import { randomUUID } from "node:crypto";
import { Router, type Response } from "express";
import type { DatabaseSync } from "node:sqlite";
import type { Konfigurasi } from "../config.js";
import type { Baris } from "../db.js";
import { galat } from "../lib/kesalahan.js";
import { bacaKue, buatKue, hapusKue } from "../lib/kue.js";
import { cocokSandi, hashSandi } from "../lib/sandi.js";
import { hapusSesi, NAMA_KUE_SESI, simpanSesi } from "../lib/sesi.js";
import { badanObjek, emailWajib, kataSandiWajib, teksWajib } from "../lib/validasi.js";
import { wajibMasuk } from "../middleware/auth.js";

export function ruteAuth(db: DatabaseSync, konfigurasi: Konfigurasi): Router {
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

  rute.post("/register", (req, res) => {
    const badan = badanObjek(req.body);
    const email = emailWajib(badan);
    const nama = teksWajib(badan, "nama", "Nama", 2, 80);
    const sandi = kataSandiWajib(badan);

    if (db.prepare("SELECT 1 AS ada FROM pengguna WHERE email = ?").get(email)) {
      throw galat(409, "EMAIL_TERDAFTAR", "Email ini sudah terdaftar. Silakan masuk.");
    }

    const id = randomUUID();
    const dibuatPada = new Date().toISOString();
    db.prepare(
      "INSERT INTO pengguna (id, email, nama, sandi_hash, dibuat_pada) VALUES (?, ?, ?, ?, ?)",
    ).run(id, email, nama, hashSandi(sandi), dibuatPada);

    pasangKueSesi(res, simpanSesi(db, id, konfigurasi.umurSesiHari));
    res.status(201).json({ pengguna: { id, email, nama, dibuatPada } });
  });

  rute.post("/login", (req, res) => {
    const badan = badanObjek(req.body);
    const email = emailWajib(badan);
    const sandi = kataSandiWajib(badan);

    const baris = db
      .prepare("SELECT id, email, nama, sandi_hash, dibuat_pada FROM pengguna WHERE email = ?")
      .get(email) as Baris | undefined;

    if (!baris || !cocokSandi(sandi, String(baris.sandi_hash ?? ""))) {
      throw galat(401, "KREDENSIAL_SALAH", "Email atau kata sandi tidak cocok.");
    }

    const id = String(baris.id);
    pasangKueSesi(res, simpanSesi(db, id, konfigurasi.umurSesiHari));
    res.json({
      pengguna: {
        id,
        email: String(baris.email),
        nama: String(baris.nama),
        dibuatPada: String(baris.dibuat_pada),
      },
    });
  });

  rute.post("/logout", (req, res) => {
    const token = bacaKue(req.headers.cookie, NAMA_KUE_SESI);
    if (token) hapusSesi(db, token);
    res.setHeader("Set-Cookie", hapusKue(NAMA_KUE_SESI, { secure: konfigurasi.kueAman }));
    res.status(204).end();
  });

  rute.get("/me", wajibMasuk(db), (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json({ pengguna: req.pengguna });
  });

  return rute;
}
