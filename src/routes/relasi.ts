import { randomUUID } from "node:crypto";
import { Router } from "express";
import type { DatabaseSync } from "node:sqlite";
import { keRelasi, type Baris } from "../db.js";
import { galat } from "../lib/kesalahan.js";
import { akanMembentukSiklus, ambilOrang } from "../lib/silsilah.js";
import { badanObjek, teksWajib } from "../lib/validasi.js";

export function ruteRelasi(db: DatabaseSync): Router {
  const rute = Router({ mergeParams: true });
  const ruangId = (req: { ruangKerja?: { id: string } }): string => req.ruangKerja?.id ?? "";

  rute.get("/", (req, res) => {
    const orangId = typeof req.query.orangId === "string" ? req.query.orangId : "";
    const baris = (
      orangId
        ? db
            .prepare(
              `SELECT * FROM relasi
                WHERE ruang_kerja_id = ? AND (orang_tua_id = ? OR anak_id = ?)
                ORDER BY dibuat_pada ASC`,
            )
            .all(ruangId(req), orangId, orangId)
        : db
            .prepare("SELECT * FROM relasi WHERE ruang_kerja_id = ? ORDER BY dibuat_pada ASC")
            .all(ruangId(req))
    ) as Baris[];
    res.json({ relasi: baris.map(keRelasi), jumlah: baris.length });
  });

  rute.post("/", (req, res) => {
    const badan = badanObjek(req.body);
    const orangTuaId = teksWajib(badan, "orangTuaId", "Orang tua", 1, 100);
    const anakId = teksWajib(badan, "anakId", "Anak", 1, 100);

    if (orangTuaId === anakId) {
      throw galat(422, "VALIDASI_GAGAL", "Seseorang tidak bisa menjadi orang tua bagi dirinya sendiri.", {
        field: "anakId",
      });
    }
    if (!ambilOrang(db, ruangId(req), orangTuaId) || !ambilOrang(db, ruangId(req), anakId)) {
      throw galat(404, "ORANG_TIDAK_DITEMUKAN", "Orang tua atau anak tidak ditemukan di ruang kerja ini.");
    }
    if (akanMembentukSiklus(db, orangTuaId, anakId)) {
      throw galat(
        409,
        "SIKLUS_SILSILAH",
        "Relasi ini akan membentuk lingkaran silsilah (orang tersebut sudah menjadi keturunan anak).",
      );
    }

    const sudahAda = db
      .prepare("SELECT id FROM relasi WHERE orang_tua_id = ? AND anak_id = ?")
      .get(orangTuaId, anakId) as Baris | undefined;
    if (sudahAda) {
      throw galat(409, "RELASI_SUDAH_ADA", "Relasi orang tua–anak ini sudah tercatat.");
    }

    const id = randomUUID();
    const dibuatPada = new Date().toISOString();
    db.prepare(
      "INSERT INTO relasi (id, ruang_kerja_id, orang_tua_id, anak_id, dibuat_pada) VALUES (?, ?, ?, ?, ?)",
    ).run(id, ruangId(req), orangTuaId, anakId, dibuatPada);

    res.status(201).json({
      relasi: { id, ruangKerjaId: ruangId(req), orangTuaId, anakId, dibuatPada },
    });
  });

  rute.delete("/:relasiId", (req, res) => {
    const hasil = db
      .prepare("DELETE FROM relasi WHERE id = ? AND ruang_kerja_id = ?")
      .run(String(req.params.relasiId), ruangId(req)) as { changes: number };
    if (hasil.changes === 0) {
      throw galat(404, "RELASI_TIDAK_DITEMUKAN", "Relasi tidak ditemukan.");
    }
    res.status(204).end();
  });

  return rute;
}
