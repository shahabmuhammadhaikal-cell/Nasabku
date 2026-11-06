import { randomUUID } from "node:crypto";
import { Router } from "express";
import type { DatabaseSync } from "node:sqlite";
import { keOrang, type Baris } from "../db.js";
import { galat } from "../lib/kesalahan.js";
import { ambilOrang } from "../lib/silsilah.js";
import { badanObjek, jenisKelaminWajib, tahunOpsional, teksOpsional, teksWajib } from "../lib/validasi.js";

/** Meng-escape karakter khusus LIKE agar pencarian q=% tidak mencocokkan semua. */
function polaCari(q: string): string {
  return `%${q.replace(/[\\%_]/g, (huruf) => `\\${huruf}`)}%`;
}

export function ruteOrang(db: DatabaseSync): Router {
  const rute = Router({ mergeParams: true });
  const ruangId = (req: { ruangKerja?: { id: string } }): string => req.ruangKerja?.id ?? "";

  rute.get("/", (req, res) => {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const batasMentah = Number(req.query.limit);
    const batas = Number.isInteger(batasMentah) && batasMentah > 0 ? Math.min(batasMentah, 1000) : 500;

    const baris = (
      q.length > 0
        ? db
            .prepare(
              `SELECT * FROM orang
                WHERE ruang_kerja_id = ? AND nama LIKE ? ESCAPE '\\'
                ORDER BY nama COLLATE NOCASE ASC LIMIT ?`,
            )
            .all(ruangId(req), polaCari(q), batas)
        : db
            .prepare(
              "SELECT * FROM orang WHERE ruang_kerja_id = ? ORDER BY nama COLLATE NOCASE ASC LIMIT ?",
            )
            .all(ruangId(req), batas)
    ) as Baris[];

    res.json({ orang: baris.map(keOrang), jumlah: baris.length });
  });

  rute.post("/", (req, res) => {
    const badan = badanObjek(req.body);
    const nama = teksWajib(badan, "nama", "Nama", 1, 120);
    const jenisKelamin = jenisKelaminWajib(badan);
    const tahunLahir = tahunOpsional(badan, "tahunLahir", "Tahun lahir") ?? null;
    const tahunWafat = tahunOpsional(badan, "tahunWafat", "Tahun wafat") ?? null;
    const catatan = teksOpsional(badan, "catatan", "Catatan") ?? null;

    if (tahunLahir !== null && tahunWafat !== null && tahunWafat < tahunLahir) {
      throw galat(422, "VALIDASI_GAGAL", "Tahun wafat tidak boleh lebih awal dari tahun lahir.", {
        field: "tahunWafat",
      });
    }

    const id = randomUUID();
    const sekarang = new Date().toISOString();
    db.prepare(
      `INSERT INTO orang (id, ruang_kerja_id, nama, jenis_kelamin, tahun_lahir, tahun_wafat, catatan, dibuat_pada, diperbarui_pada)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, ruangId(req), nama, jenisKelamin, tahunLahir, tahunWafat, catatan, sekarang, sekarang);

    res.status(201).json({
      orang: {
        id,
        ruangKerjaId: ruangId(req),
        nama,
        jenisKelamin,
        tahunLahir,
        tahunWafat,
        catatan,
        dibuatPada: sekarang,
        diperbaruiPada: sekarang,
      },
    });
  });

  rute.get("/:orangId", (req, res) => {
    const orang = ambilOrang(db, ruangId(req), String(req.params.orangId));
    if (!orang) throw galat(404, "ORANG_TIDAK_DITEMUKAN", "Orang tidak ditemukan di ruang kerja ini.");
    res.json({ orang });
  });

  rute.patch("/:orangId", (req, res) => {
    const id = String(req.params.orangId);
    const lama = ambilOrang(db, ruangId(req), id);
    if (!lama) throw galat(404, "ORANG_TIDAK_DITEMUKAN", "Orang tidak ditemukan di ruang kerja ini.");

    const badan = badanObjek(req.body);
    const nama = "nama" in badan ? teksWajib(badan, "nama", "Nama", 1, 120) : lama.nama;
    const jenisKelamin = "jenisKelamin" in badan ? jenisKelaminWajib(badan) : lama.jenisKelamin;
    const tahunLahir =
      "tahunLahir" in badan ? (tahunOpsional(badan, "tahunLahir", "Tahun lahir") ?? null) : lama.tahunLahir;
    const tahunWafat =
      "tahunWafat" in badan ? (tahunOpsional(badan, "tahunWafat", "Tahun wafat") ?? null) : lama.tahunWafat;
    const catatan = "catatan" in badan ? (teksOpsional(badan, "catatan", "Catatan") ?? null) : lama.catatan;

    if (tahunLahir !== null && tahunWafat !== null && tahunWafat < tahunLahir) {
      throw galat(422, "VALIDASI_GAGAL", "Tahun wafat tidak boleh lebih awal dari tahun lahir.", {
        field: "tahunWafat",
      });
    }

    const sekarang = new Date().toISOString();
    db.prepare(
      `UPDATE orang
          SET nama = ?, jenis_kelamin = ?, tahun_lahir = ?, tahun_wafat = ?, catatan = ?, diperbarui_pada = ?
        WHERE id = ? AND ruang_kerja_id = ?`,
    ).run(nama, jenisKelamin, tahunLahir, tahunWafat, catatan, sekarang, id, ruangId(req));

    res.json({
      orang: { ...lama, nama, jenisKelamin, tahunLahir, tahunWafat, catatan, diperbaruiPada: sekarang },
    });
  });

  rute.delete("/:orangId", (req, res) => {
    const id = String(req.params.orangId);
    const hasil = db
      .prepare("DELETE FROM orang WHERE id = ? AND ruang_kerja_id = ?")
      .run(id, ruangId(req)) as { changes: number };
    if (hasil.changes === 0) {
      throw galat(404, "ORANG_TIDAK_DITEMUKAN", "Orang tidak ditemukan di ruang kerja ini.");
    }
    res.status(204).end();
  });

  return rute;
}
