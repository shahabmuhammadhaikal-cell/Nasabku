import { Router } from "express";
import type { Penyimpanan } from "../data/penyimpanan.js";
import { ringkasUsulan } from "../lib/usulan.js";

/** Daftar usulan milik pengguna yang sedang masuk, agar ia tahu statusnya. */
export function ruteUsulan(penyimpanan: Penyimpanan): Router {
  const rute = Router();

  rute.get("/", async (req, res) => {
    const penggunaId = req.pengguna?.id ?? "";
    const [semua, ruang] = await Promise.all([
      penyimpanan.daftarUsulan(),
      penyimpanan.daftarRuangKerja(penggunaId),
    ]);
    const namaRuang = new Map(ruang.map((satu) => [satu.id, satu.nama]));
    res.setHeader("Cache-Control", "no-store");
    res.json({
      usulan: semua
        .filter((satu) => satu.penggunaId === penggunaId)
        .sort((a, b) => b.dibuatPada.localeCompare(a.dibuatPada))
        .map((satu) => ({
          ...satu,
          ringkasan: ringkasUsulan(satu),
          ruangNama: namaRuang.get(satu.ruangKerjaId) ?? "?",
        })),
    });
  });

  return rute;
}
