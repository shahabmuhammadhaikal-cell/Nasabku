import { Router } from "express";
import type { Penyimpanan } from "../data/penyimpanan.js";
import type { DataOrang, Orang } from "../data/tipe.js";
import { galat } from "../lib/kesalahan.js";
import {
  badanObjek,
  jenisKelaminWajib,
  tahunOpsional,
  teksOpsional,
  teksWajib,
} from "../lib/validasi.js";

function periksaTahun(tahunLahir: number | null, tahunWafat: number | null): void {
  if (tahunLahir !== null && tahunWafat !== null && tahunWafat < tahunLahir) {
    throw galat(422, "VALIDASI_GAGAL", "Tahun wafat tidak boleh lebih awal dari tahun lahir.", {
      field: "tahunWafat",
    });
  }
}

function dataBaru(badan: Record<string, unknown>): DataOrang {
  const nama = teksWajib(badan, "nama", "Nama", 1, 120);
  const jenisKelamin = jenisKelaminWajib(badan);
  const tahunLahir = tahunOpsional(badan, "tahunLahir", "Tahun lahir") ?? null;
  const tahunWafat = tahunOpsional(badan, "tahunWafat", "Tahun wafat") ?? null;
  const catatan = teksOpsional(badan, "catatan", "Catatan") ?? null;
  periksaTahun(tahunLahir, tahunWafat);
  return { nama, jenisKelamin, tahunLahir, tahunWafat, catatan };
}

function dataGabungan(badan: Record<string, unknown>, lama: Orang): DataOrang {
  const nama = "nama" in badan ? teksWajib(badan, "nama", "Nama", 1, 120) : lama.nama;
  const jenisKelamin = "jenisKelamin" in badan ? jenisKelaminWajib(badan) : lama.jenisKelamin;
  const tahunLahir =
    "tahunLahir" in badan
      ? (tahunOpsional(badan, "tahunLahir", "Tahun lahir") ?? null)
      : lama.tahunLahir;
  const tahunWafat =
    "tahunWafat" in badan
      ? (tahunOpsional(badan, "tahunWafat", "Tahun wafat") ?? null)
      : lama.tahunWafat;
  const catatan =
    "catatan" in badan ? (teksOpsional(badan, "catatan", "Catatan") ?? null) : lama.catatan;
  periksaTahun(tahunLahir, tahunWafat);
  return { nama, jenisKelamin, tahunLahir, tahunWafat, catatan };
}

export function ruteOrang(penyimpanan: Penyimpanan): Router {
  const rute = Router({ mergeParams: true });
  const ruangId = (req: { ruangKerja?: { id: string } }): string => req.ruangKerja?.id ?? "";

  rute.get("/", async (req, res) => {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const batasMentah = Number(req.query.limit);
    const batas =
      Number.isInteger(batasMentah) && batasMentah > 0 ? Math.min(batasMentah, 1000) : 500;

    const orang = await penyimpanan.daftarOrang(ruangId(req), { q, batas });
    res.json({ orang, jumlah: orang.length });
  });

  rute.post("/", async (req, res) => {
    const badan = badanObjek(req.body);
    const orang = await penyimpanan.buatOrang(ruangId(req), dataBaru(badan));
    res.status(201).json({ orang });
  });

  rute.get("/:orangId", async (req, res) => {
    const orang = await penyimpanan.ambilOrang(ruangId(req), String(req.params.orangId));
    if (!orang) throw galat(404, "ORANG_TIDAK_DITEMUKAN", "Orang tidak ditemukan di ruang kerja ini.");
    res.json({ orang });
  });

  rute.patch("/:orangId", async (req, res) => {
    const id = String(req.params.orangId);
    const lama = await penyimpanan.ambilOrang(ruangId(req), id);
    if (!lama) throw galat(404, "ORANG_TIDAK_DITEMUKAN", "Orang tidak ditemukan di ruang kerja ini.");

    const badan = badanObjek(req.body);
    const orang = await penyimpanan.ubahOrang(ruangId(req), id, dataGabungan(badan, lama));
    if (!orang) throw galat(404, "ORANG_TIDAK_DITEMUKAN", "Orang tidak ditemukan di ruang kerja ini.");
    res.json({ orang });
  });

  rute.delete("/:orangId", async (req, res) => {
    const terhapus = await penyimpanan.hapusOrang(ruangId(req), String(req.params.orangId));
    if (!terhapus) {
      throw galat(404, "ORANG_TIDAK_DITEMUKAN", "Orang tidak ditemukan di ruang kerja ini.");
    }
    res.status(204).end();
  });

  return rute;
}
