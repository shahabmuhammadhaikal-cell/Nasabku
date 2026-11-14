import { Router } from "express";
import type { Penyimpanan } from "../data/penyimpanan.js";
import { galat } from "../lib/kesalahan.js";
import { ajukanUsulan, harusDiajukan } from "../lib/persetujuan.js";
import { badanObjek, teksWajib } from "../lib/validasi.js";

export function ruteRelasi(penyimpanan: Penyimpanan): Router {
  const rute = Router({ mergeParams: true });
  const ruangId = (req: { ruangKerja?: { id: string } }): string => req.ruangKerja?.id ?? "";

  rute.get("/", async (req, res) => {
    const orangId = typeof req.query.orangId === "string" ? req.query.orangId : undefined;
    const relasi = await penyimpanan.daftarRelasi(ruangId(req), orangId);
    res.json({ relasi, jumlah: relasi.length });
  });

  rute.post("/", async (req, res) => {
    const badan = badanObjek(req.body);
    const orangTuaId = teksWajib(badan, "orangTuaId", "Orang tua", 1, 100);
    const anakId = teksWajib(badan, "anakId", "Anak", 1, 100);

    if (orangTuaId === anakId) {
      throw galat(422, "VALIDASI_GAGAL", "Seseorang tidak bisa menjadi orang tua bagi dirinya sendiri.", {
        field: "anakId",
      });
    }

    const idRuang = ruangId(req);
    const [orangTua, anak] = await Promise.all([
      penyimpanan.ambilOrang(idRuang, orangTuaId),
      penyimpanan.ambilOrang(idRuang, anakId),
    ]);
    if (!orangTua || !anak) {
      throw galat(404, "ORANG_TIDAK_DITEMUKAN", "Orang tua atau anak tidak ditemukan di ruang kerja ini.");
    }

    if (await penyimpanan.akanMembentukSiklus(idRuang, orangTuaId, anakId)) {
      throw galat(
        409,
        "SIKLUS_SILSILAH",
        "Relasi ini akan membentuk lingkaran silsilah (orang tersebut sudah menjadi keturunan anak).",
      );
    }

    if (await harusDiajukan(penyimpanan, req.pengguna)) {
      const usulan = await ajukanUsulan(penyimpanan, {
        ruangKerjaId: idRuang,
        penggunaId: req.pengguna?.id ?? "",
        jenis: "relasi",
        aksi: "tambah",
        data: { orangTuaId, anakId },
      });
      res.status(202).json({ usulan, pesan: "Relasi baru menunggu persetujuan admin." });
      return;
    }

    const relasi = await penyimpanan.buatRelasi(idRuang, orangTuaId, anakId);
    if (!relasi) {
      throw galat(409, "RELASI_SUDAH_ADA", "Relasi orang tua–anak ini sudah tercatat.");
    }
    res.status(201).json({ relasi });
  });

  rute.delete("/:relasiId", async (req, res) => {
    const id = String(req.params.relasiId);
    if (await harusDiajukan(penyimpanan, req.pengguna)) {
      const usulan = await ajukanUsulan(penyimpanan, {
        ruangKerjaId: ruangId(req),
        penggunaId: req.pengguna?.id ?? "",
        jenis: "relasi",
        aksi: "hapus",
        targetId: id,
        data: {},
      });
      res.status(202).json({ usulan, pesan: "Penghapusan relasi menunggu persetujuan admin." });
      return;
    }
    const terhapus = await penyimpanan.hapusRelasi(ruangId(req), id);
    if (!terhapus) throw galat(404, "RELASI_TIDAK_DITEMUKAN", "Relasi tidak ditemukan.");
    res.status(204).end();
  });

  return rute;
}
