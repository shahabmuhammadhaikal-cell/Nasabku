import { Router } from "express";
import type { Penyimpanan } from "../data/penyimpanan.js";
import type { DataOrang, Orang } from "../data/tipe.js";
import { galat } from "../lib/kesalahan.js";
import { ajukanUsulan, harusDiajukan, periksaBatasOrang } from "../lib/persetujuan.js";
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

/** Kunci yang tidak dikirim pada PATCH mempertahankan nilai lama. */
function teksPilihan(
  badan: Record<string, unknown>,
  kunci: string,
  label: string,
  maks: number,
  lama: string | null,
): string | null {
  return kunci in badan ? (teksOpsional(badan, kunci, label, maks) ?? null) : lama;
}

function tanggalPilihan(
  badan: Record<string, unknown>,
  kunci: string,
  label: string,
  lama: string | null,
): string | null {
  return kunci in badan ? (tanggalOpsional(badan, kunci, label) ?? null) : lama;
}

function rapikanData(badan: Record<string, unknown>, lama: DataOrang | null): DataOrang {
  const nama =
    lama && !("nama" in badan) ? lama.nama : teksWajib(badan, "nama", "Nama", 1, 120);
  const jenisKelamin =
    "jenisKelamin" in badan ? jenisKelaminWajib(badan) : (lama?.jenisKelamin ?? "U");

  const tanggalLahir = tanggalPilihan(badan, "tanggalLahir", "Tanggal lahir", lama?.tanggalLahir ?? null);
  const tempatLahir = teksPilihan(badan, "tempatLahir", "Tempat lahir", 120, lama?.tempatLahir ?? null);
  const tanggalWafat = tanggalPilihan(badan, "tanggalWafat", "Tanggal wafat", lama?.tanggalWafat ?? null);
  const tempatWafat = teksPilihan(badan, "tempatWafat", "Tempat wafat", 120, lama?.tempatWafat ?? null);
  const tempatPemakaman = teksPilihan(
    badan,
    "tempatPemakaman",
    "Tempat pemakaman",
    120,
    lama?.tempatPemakaman ?? null,
  );
  const pekerjaan = teksPilihan(badan, "pekerjaan", "Pekerjaan", 120, lama?.pekerjaan ?? null);
  const namaLain = teksPilihan(badan, "namaLain", "Nama panggilan", 120, lama?.namaLain ?? null);
  const catatan = teksPilihan(badan, "catatan", "Catatan", 2000, lama?.catatan ?? null);
  const sumber = teksPilihan(badan, "sumber", "Sumber informasi", 300, lama?.sumber ?? null);

  periksaTanggal(tanggalLahir, tanggalWafat);

  return {
    nama,
    namaLain,
    jenisKelamin,
    tanggalLahir,
    tempatLahir,
    tanggalWafat,
    tempatWafat,
    pekerjaan,
    tempatPemakaman,
    catatan,
    sumber,
  };
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
    const data = rapikanData(badan, null);

    if (await harusDiajukan(penyimpanan, req.pengguna)) {
      const usulan = await ajukanUsulan(penyimpanan, {
        ruangKerjaId: ruangId(req),
        penggunaId: req.pengguna?.id ?? "",
        jenis: "orang",
        aksi: "tambah",
        data: { ...data },
      });
      res.status(202).json({ usulan, pesan: "Penambahan orang menunggu persetujuan admin." });
      return;
    }

    await periksaBatasOrang(penyimpanan, ruangId(req));
    const orang = await penyimpanan.buatOrang(ruangId(req), data);
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
    const data = rapikanData(badan, lama);

    if (await harusDiajukan(penyimpanan, req.pengguna)) {
      const usulan = await ajukanUsulan(penyimpanan, {
        ruangKerjaId: ruangId(req),
        penggunaId: req.pengguna?.id ?? "",
        jenis: "orang",
        aksi: "ubah",
        targetId: id,
        data: { ...data },
      });
      res.status(202).json({ usulan, pesan: "Perubahan data menunggu persetujuan admin." });
      return;
    }

    const orang = await penyimpanan.ubahOrang(ruangId(req), id, data);
    if (!orang) throw galat(404, "ORANG_TIDAK_DITEMUKAN", "Orang tidak ditemukan di ruang kerja ini.");
    res.json({ orang });
  });

  rute.delete("/:orangId", async (req, res) => {
    const id = String(req.params.orangId);
    if (await harusDiajukan(penyimpanan, req.pengguna)) {
      const lama = await penyimpanan.ambilOrang(ruangId(req), id);
      if (!lama) throw galat(404, "ORANG_TIDAK_DITEMUKAN", "Orang tidak ditemukan di ruang kerja ini.");
      const usulan = await ajukanUsulan(penyimpanan, {
        ruangKerjaId: ruangId(req),
        penggunaId: req.pengguna?.id ?? "",
        jenis: "orang",
        aksi: "hapus",
        targetId: id,
        data: { nama: lama.nama },
      });
      res.status(202).json({ usulan, pesan: "Penghapusan orang menunggu persetujuan admin." });
      return;
    }

    const terhapus = await penyimpanan.hapusOrang(ruangId(req), id);
    if (!terhapus) {
      throw galat(404, "ORANG_TIDAK_DITEMUKAN", "Orang tidak ditemukan di ruang kerja ini.");
    }
    res.status(204).end();
  });

  return rute;
}
