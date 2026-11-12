import { Router } from "express";
import { BATAS_DOKUMEN, type Penyimpanan } from "../data/penyimpanan.js";
import type { Relasi } from "../data/tipe.js";
import { BATAS_IMPOR_ORANG, bacaGedcom, buatGedcom } from "../lib/gedcom.js";
import { galat } from "../lib/kesalahan.js";
import { akanMembentukSiklus } from "../lib/silsilah.js";
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

    if (req.query.format === "gedcom") {
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="nasabku-${namaBerkas(ruangKerja.nama)}.ged"`,
      );
      res.setHeader("Cache-Control", "no-store");
      res.send(buatGedcom(ruangKerja, orang, relasi));
      return;
    }

    if (req.query.format !== undefined && req.query.format !== "json") {
      throw galat(422, "VALIDASI_GAGAL", 'Parameter "format" harus "json" atau "gedcom".', {
        field: "format",
      });
    }

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

  /**
   * Impor GEDCOM: menambah orang dan relasi ke ruang kerja yang sudah ada.
   * Relasi yang membentuk lingkaran dilewati, bukan membuat impor gagal seluruhnya.
   */
  rute.post("/:workspaceId/import", muatRuangKerja(penyimpanan), async (req, res) => {
    const ruangKerja = req.ruangKerja;
    if (!ruangKerja) throw galat(404, "RUANG_TIDAK_DITEMUKAN", "Ruang kerja tidak ditemukan.");

    const badan = badanObjek(req.body);
    const isi = teksWajib(badan, "gedcom", "Isi GEDCOM", 1, 1_500_000);
    const hasil = bacaGedcom(isi);

    if (hasil.individu.length === 0) {
      throw galat(
        422,
        "GEDCOM_KOSONG",
        "Tidak ada individu yang bisa dibaca dari berkas GEDCOM itu.",
        { field: "gedcom" },
      );
    }
    if (hasil.individu.length > BATAS_IMPOR_ORANG) {
      throw galat(
        422,
        "GEDCOM_TERLALU_BESAR",
        `Satu kali impor dibatasi ${BATAS_IMPOR_ORANG} orang.`,
        { field: "gedcom" },
      );
    }

    const idPerLabel = new Map<string, string>();
    for (const satu of hasil.individu) {
      const orang = await penyimpanan.buatOrang(ruangKerja.id, satu.data);
      idPerLabel.set(satu.kunci, orang.id);
    }

    const relasiLama = await penyimpanan.daftarRelasi(ruangKerja.id);
    const terbentuk: Relasi[] = [];
    let relasiDilewati = 0;

    for (const keluarga of hasil.keluarga) {
      for (const kunciOrangTua of keluarga.orangTua) {
        const orangTuaId = idPerLabel.get(kunciOrangTua);
        if (!orangTuaId) {
          relasiDilewati += 1;
          continue;
        }
        for (const kunciAnak of keluarga.anak) {
          const anakId = idPerLabel.get(kunciAnak);
          if (!anakId || anakId === orangTuaId) {
            relasiDilewati += 1;
            continue;
          }
          if (akanMembentukSiklus([...relasiLama, ...terbentuk], orangTuaId, anakId)) {
            relasiDilewati += 1;
            continue;
          }
          const relasi = await penyimpanan.buatRelasi(ruangKerja.id, orangTuaId, anakId);
          if (relasi) terbentuk.push(relasi);
          else relasiDilewati += 1;
        }
      }
    }

    res.status(201).json({
      impor: {
        orang: hasil.individu.length,
        relasi: terbentuk.length,
        relasiDilewati,
        tanggalDiabaikan: hasil.tanggalDiabaikan,
        namaDiabaikan: hasil.namaKosong,
      },
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
