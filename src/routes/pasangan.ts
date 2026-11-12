import { Router } from "express";
import type { Penyimpanan } from "../data/penyimpanan.js";
import { galat } from "../lib/kesalahan.js";
import { badanObjek, teksWajib } from "../lib/validasi.js";

export function rutePasangan(penyimpanan: Penyimpanan): Router {
  const rute = Router({ mergeParams: true });
  const ruangId = (req: { ruangKerja?: { id: string } }): string => req.ruangKerja?.id ?? "";

  rute.get("/", async (req, res) => {
    const orangId = typeof req.query.orangId === "string" ? req.query.orangId : undefined;
    const pasangan = await penyimpanan.daftarPasangan(ruangId(req), orangId);
    res.json({ pasangan, jumlah: pasangan.length });
  });

  rute.post("/", async (req, res) => {
    const badan = badanObjek(req.body);
    const orangAId = teksWajib(badan, "orangAId", "Orang pertama", 1, 100);
    const orangBId = teksWajib(badan, "orangBId", "Orang kedua", 1, 100);

    if (orangAId === orangBId) {
      throw galat(422, "VALIDASI_GAGAL", "Seseorang tidak bisa menjadi pasangan bagi dirinya sendiri.", {
        field: "orangBId",
      });
    }

    const idRuang = ruangId(req);
    const [pertama, kedua] = await Promise.all([
      penyimpanan.ambilOrang(idRuang, orangAId),
      penyimpanan.ambilOrang(idRuang, orangBId),
    ]);
    if (!pertama || !kedua) {
      throw galat(
        404,
        "ORANG_TIDAK_DITEMUKAN",
        "Salah satu orang tidak ditemukan di ruang kerja ini.",
      );
    }

    const pasangan = await penyimpanan.buatPasangan(idRuang, orangAId, orangBId);
    if (!pasangan) {
      throw galat(409, "PASANGAN_SUDAH_ADA", "Hubungan pasangan ini sudah tercatat.");
    }
    res.status(201).json({ pasangan });
  });

  rute.delete("/:pasanganId", async (req, res) => {
    const terhapus = await penyimpanan.hapusPasangan(ruangId(req), String(req.params.pasanganId));
    if (!terhapus) throw galat(404, "PASANGAN_TIDAK_DITEMUKAN", "Hubungan pasangan tidak ditemukan.");
    res.status(204).end();
  });

  return rute;
}
