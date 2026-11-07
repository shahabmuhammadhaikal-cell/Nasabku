import { Router } from "express";
import type { Penyimpanan } from "../data/penyimpanan.js";
import { galat } from "../lib/kesalahan.js";
import { badanObjek, teksWajib } from "../lib/validasi.js";
import { muatRuangKerja } from "../middleware/auth.js";

export function ruteRuangKerja(penyimpanan: Penyimpanan): Router {
  const rute = Router();

  rute.get("/", async (req, res) => {
    res.json({ ruangKerja: await penyimpanan.daftarRuangKerja(req.pengguna?.id ?? "") });
  });

  rute.post("/", async (req, res) => {
    const badan = badanObjek(req.body);
    const nama = teksWajib(badan, "nama", "Nama ruang kerja", 2, 80);
    const ruangKerja = await penyimpanan.buatRuangKerja(req.pengguna?.id ?? "", nama);
    res.status(201).json({ ruangKerja });
  });

  rute.get("/:workspaceId", muatRuangKerja(penyimpanan), (req, res) => {
    res.json({ ruangKerja: req.ruangKerja });
  });

  rute.patch("/:workspaceId", muatRuangKerja(penyimpanan), async (req, res) => {
    const ruangKerja = req.ruangKerja;
    if (!ruangKerja) throw galat(404, "RUANG_TIDAK_DITEMUKAN", "Ruang kerja tidak ditemukan.");

    const badan = badanObjek(req.body);
    const nama = teksWajib(badan, "nama", "Nama ruang kerja", 2, 80);
    res.json({ ruangKerja: await penyimpanan.ubahNamaRuangKerja(ruangKerja, nama) });
  });

  rute.delete("/:workspaceId", muatRuangKerja(penyimpanan), async (req, res) => {
    const id = req.ruangKerja?.id;
    if (!id) throw galat(404, "RUANG_TIDAK_DITEMUKAN", "Ruang kerja tidak ditemukan.");
    await penyimpanan.hapusRuangKerja(id);
    res.status(204).end();
  });

  return rute;
}
