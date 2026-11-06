import { randomUUID } from "node:crypto";
import { Router } from "express";
import type { DatabaseSync } from "node:sqlite";
import { keRuangKerja, type Baris } from "../db.js";
import { badanObjek, teksWajib } from "../lib/validasi.js";
import { muatRuangKerja } from "../middleware/auth.js";

export function ruteRuangKerja(db: DatabaseSync): Router {
  const rute = Router();

  rute.get("/", (req, res) => {
    const baris = db
      .prepare("SELECT * FROM ruang_kerja WHERE pemilik_id = ? ORDER BY dibuat_pada ASC")
      .all(req.pengguna?.id ?? "") as Baris[];
    res.json({ ruangKerja: baris.map(keRuangKerja) });
  });

  rute.post("/", (req, res) => {
    const badan = badanObjek(req.body);
    const nama = teksWajib(badan, "nama", "Nama ruang kerja", 2, 80);
    const id = randomUUID();
    const dibuatPada = new Date().toISOString();
    db.prepare("INSERT INTO ruang_kerja (id, nama, pemilik_id, dibuat_pada) VALUES (?, ?, ?, ?)").run(
      id,
      nama,
      req.pengguna?.id ?? "",
      dibuatPada,
    );
    res.status(201).json({ ruangKerja: { id, nama, pemilikId: req.pengguna?.id ?? "", dibuatPada } });
  });

  rute.get("/:workspaceId", muatRuangKerja(db), (req, res) => {
    res.json({ ruangKerja: req.ruangKerja });
  });

  rute.patch("/:workspaceId", muatRuangKerja(db), (req, res) => {
    const badan = badanObjek(req.body);
    const nama = teksWajib(badan, "nama", "Nama ruang kerja", 2, 80);
    db.prepare("UPDATE ruang_kerja SET nama = ? WHERE id = ?").run(nama, req.ruangKerja?.id ?? "");
    res.json({ ruangKerja: { ...req.ruangKerja, nama } });
  });

  rute.delete("/:workspaceId", muatRuangKerja(db), (req, res) => {
    db.prepare("DELETE FROM ruang_kerja WHERE id = ?").run(req.ruangKerja?.id ?? "");
    res.status(204).end();
  });

  return rute;
}
