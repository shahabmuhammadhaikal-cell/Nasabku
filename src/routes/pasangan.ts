import { Router } from "express";
import type { Penyimpanan } from "../data/penyimpanan.js";
import type { Pasangan } from "../data/tipe.js";
import { galat } from "../lib/kesalahan.js";
import { tahunDari } from "../lib/tanggal.js";
import { badanObjek, tanggalOpsional, teksWajib } from "../lib/validasi.js";

function urutanOpsional(badan: Record<string, unknown>): number | undefined {
  if (!("urutan" in badan) || badan.urutan === undefined) return undefined;
  const nilai = badan.urutan;
  if (typeof nilai !== "number" || !Number.isInteger(nilai) || nilai < 1 || nilai > 30) {
    throw galat(422, "VALIDASI_GAGAL", "Urutan pernikahan harus bilangan bulat 1–30.", {
      field: "urutan",
    });
  }
  return nilai;
}

/** Pernikahan tidak mungkin terjadi sebelum kedua mempelai lahir. */
function periksaTanggalMenikah(
  tanggalMenikah: string | null,
  tahunLahir: readonly (number | null)[],
): void {
  const tahunMenikah = tahunDari(tanggalMenikah);
  if (tahunMenikah === null) return;
  if (tahunLahir.some((tahun) => tahun !== null && tahunMenikah < tahun)) {
    throw galat(
      422,
      "VALIDASI_GAGAL",
      "Tanggal menikah tidak boleh lebih awal dari tahun lahir kedua mempelai.",
      { field: "tanggalMenikah" },
    );
  }
}

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

    const tanggalMenikah = tanggalOpsional(badan, "tanggalMenikah", "Tanggal menikah") ?? null;
    periksaTanggalMenikah(tanggalMenikah, [
      tahunDari(pertama.tanggalLahir),
      tahunDari(kedua.tanggalLahir),
    ]);
    const urutan = urutanOpsional(badan);

    const pasangan = await penyimpanan.buatPasangan(idRuang, orangAId, orangBId, {
      tanggalMenikah,
      ...(urutan === undefined ? {} : { urutan }),
    });
    if (!pasangan) {
      throw galat(409, "PASANGAN_SUDAH_ADA", "Hubungan pasangan ini sudah tercatat.");
    }
    res.status(201).json({ pasangan });
  });

  rute.patch("/:pasanganId", async (req, res) => {
    const id = String(req.params.pasanganId);
    const idRuang = ruangId(req);
    const semua = await penyimpanan.daftarPasangan(idRuang);
    const lama: Pasangan | undefined = semua.find((satu) => satu.id === id);
    if (!lama) throw galat(404, "PASANGAN_TIDAK_DITEMUKAN", "Hubungan pasangan tidak ditemukan.");

    const badan = badanObjek(req.body);
    const tanggalMenikah =
      "tanggalMenikah" in badan
        ? (tanggalOpsional(badan, "tanggalMenikah", "Tanggal menikah") ?? null)
        : lama.tanggalMenikah;
    const urutan = urutanOpsional(badan) ?? lama.urutan;

    const [orangA, orangB] = await Promise.all([
      penyimpanan.ambilOrang(idRuang, lama.orangAId),
      penyimpanan.ambilOrang(idRuang, lama.orangBId),
    ]);
    periksaTanggalMenikah(tanggalMenikah, [
      tahunDari(orangA?.tanggalLahir ?? null),
      tahunDari(orangB?.tanggalLahir ?? null),
    ]);

    const pasangan = await penyimpanan.ubahPasangan(idRuang, id, { tanggalMenikah, urutan });
    if (!pasangan) throw galat(404, "PASANGAN_TIDAK_DITEMUKAN", "Hubungan pasangan tidak ditemukan.");
    res.json({ pasangan });
  });

  rute.delete("/:pasanganId", async (req, res) => {
    const terhapus = await penyimpanan.hapusPasangan(ruangId(req), String(req.params.pasanganId));
    if (!terhapus) throw galat(404, "PASANGAN_TIDAK_DITEMUKAN", "Hubungan pasangan tidak ditemukan.");
    res.status(204).end();
  });

  return rute;
}
