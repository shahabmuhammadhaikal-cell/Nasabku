import { Router } from "express";
import { BATAS_DOKUMEN, type Penyimpanan } from "../data/penyimpanan.js";
import { galat } from "../lib/kesalahan.js";
import { hitungStatistik } from "../lib/statistik.js";
import { badanObjek, teksWajib } from "../lib/validasi.js";
import { muatRuangKerja } from "../middleware/auth.js";

/** Nama berkas ekspor yang aman: hanya huruf kecil, angka, dan tanda hubung. */
function namaBerkas(nama: string): string {
  const bersih = nama
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return bersih || "silsilah";
}

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

  rute.get("/:workspaceId/stats", muatRuangKerja(penyimpanan), async (req, res) => {
    const id = req.ruangKerja?.id;
    if (!id) throw galat(404, "RUANG_TIDAK_DITEMUKAN", "Ruang kerja tidak ditemukan.");

    const [orang, relasi] = await Promise.all([
      penyimpanan.daftarOrang(id, { batas: BATAS_DOKUMEN }),
      penyimpanan.daftarRelasi(id),
    ]);
    res.setHeader("Cache-Control", "no-store");
    res.json({ statistik: hitungStatistik(orang, relasi) });
  });

  rute.get("/:workspaceId/export", muatRuangKerja(penyimpanan), async (req, res) => {
    const ruangKerja = req.ruangKerja;
    if (!ruangKerja) throw galat(404, "RUANG_TIDAK_DITEMUKAN", "Ruang kerja tidak ditemukan.");

    const [orang, relasi] = await Promise.all([
      penyimpanan.daftarOrang(ruangKerja.id, { batas: BATAS_DOKUMEN }),
      penyimpanan.daftarRelasi(ruangKerja.id),
    ]);

    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="nasabku-${namaBerkas(ruangKerja.nama)}.json"`,
    );
    res.setHeader("Cache-Control", "no-store");
    res.json({
      aplikasi: "Nasabku",
      versi: 1,
      dieksporPada: new Date().toISOString(),
      ruangKerja,
      statistik: hitungStatistik(orang, relasi),
      orang,
      relasi,
    });
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
