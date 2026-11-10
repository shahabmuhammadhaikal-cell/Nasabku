import { Router } from "express";
import type { Penyimpanan } from "../data/penyimpanan.js";
import type { DataOrang, Orang } from "../data/tipe.js";
import { galat } from "../lib/kesalahan.js";
import {
  badanObjek,
  jenisKelaminWajib,
  tanggalOpsional,
  teksOpsional,
  teksWajib,
} from "../lib/validasi.js";

function periksaTanggal(tanggalLahir: string | null, tanggalWafat: string | null): void {
  // Formatnya ISO bertingkat, jadi perbandingan teks biasa sudah benar
  // ("1980" < "1980-05" < "1990").
  if (tanggalLahir && tanggalWafat && tanggalWafat < tanggalLahir) {
    throw galat(422, "VALIDASI_GAGAL", "Tanggal wafat tidak boleh lebih awal dari tanggal lahir.", {
      field: "tanggalWafat",
    });
  }
}

function dataBaru(badan: Record<string, unknown>): DataOrang {
  const nama = teksWajib(badan, "nama", "Nama", 1, 120);
  const jenisKelamin = jenisKelaminWajib(badan);
  const tanggalLahir = tanggalOpsional(badan, "tanggalLahir", "Tanggal lahir") ?? null;
  const tempatLahir = teksOpsional(badan, "tempatLahir", "Tempat lahir", 120) ?? null;
  const tanggalWafat = tanggalOpsional(badan, "tanggalWafat", "Tanggal wafat") ?? null;
  const tempatWafat = teksOpsional(badan, "tempatWafat", "Tempat wafat", 120) ?? null;
  const catatan = teksOpsional(badan, "catatan", "Catatan") ?? null;
  periksaTanggal(tanggalLahir, tanggalWafat);
  return { nama, jenisKelamin, tanggalLahir, tempatLahir, tanggalWafat, tempatWafat, catatan };
}

function dataGabungan(badan: Record<string, unknown>, lama: Orang): DataOrang {
  const nama = "nama" in badan ? teksWajib(badan, "nama", "Nama", 1, 120) : lama.nama;
  const jenisKelamin = "jenisKelamin" in badan ? jenisKelaminWajib(badan) : lama.jenisKelamin;
  const tanggalLahir =
    "tanggalLahir" in badan
      ? (tanggalOpsional(badan, "tanggalLahir", "Tanggal lahir") ?? null)
      : lama.tanggalLahir;
  const tempatLahir =
    "tempatLahir" in badan
      ? (teksOpsional(badan, "tempatLahir", "Tempat lahir", 120) ?? null)
      : lama.tempatLahir;
  const tanggalWafat =
    "tanggalWafat" in badan
      ? (tanggalOpsional(badan, "tanggalWafat", "Tanggal wafat") ?? null)
      : lama.tanggalWafat;
  const tempatWafat =
    "tempatWafat" in badan
      ? (teksOpsional(badan, "tempatWafat", "Tempat wafat", 120) ?? null)
      : lama.tempatWafat;
  const catatan =
    "catatan" in badan ? (teksOpsional(badan, "catatan", "Catatan") ?? null) : lama.catatan;
  periksaTanggal(tanggalLahir, tanggalWafat);
  return { nama, jenisKelamin, tanggalLahir, tempatLahir, tanggalWafat, tempatWafat, catatan };
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
