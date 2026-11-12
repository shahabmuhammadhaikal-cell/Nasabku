import { Router } from "express";
import type { Penyimpanan } from "../data/penyimpanan.js";
import type { Pasangan } from "../data/tipe.js";
import { galat } from "../lib/kesalahan.js";
import { tahunDari } from "../lib/tanggal.js";
import { urutkanPerOrang } from "../lib/pernikahan.js";
import { badanObjek, tanggalOpsional, teksWajib } from "../lib/validasi.js";

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
    // Urutan pernikahan dihitung per orang dari seluruh pernikahan di ruang kerja ini.
    const semua = await penyimpanan.daftarPasangan(ruangId(req));
    const berurut = urutkanPerOrang(semua).filter((satu) => pasangan.some((lain) => lain.id === satu.id));
    res.json({ pasangan: berurut, jumlah: berurut.length });
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
    const pasangan = await penyimpanan.buatPasangan(idRuang, orangAId, orangBId, {
      tanggalMenikah,
    });
    if (!pasangan) {
      throw galat(409, "PASANGAN_SUDAH_ADA", "Hubungan pasangan ini sudah tercatat.");
    }
    const [berurut] = urutkanPerOrang(await penyimpanan.daftarPasangan(idRuang)).filter(
      (satu) => satu.id === pasangan.id,
    );
    res.status(201).json({ pasangan: berurut ?? pasangan });
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
    const [orangA, orangB] = await Promise.all([
      penyimpanan.ambilOrang(idRuang, lama.orangAId),
      penyimpanan.ambilOrang(idRuang, lama.orangBId),
    ]);
    periksaTanggalMenikah(tanggalMenikah, [
      tahunDari(orangA?.tanggalLahir ?? null),
      tahunDari(orangB?.tanggalLahir ?? null),
    ]);

    const pasangan = await penyimpanan.ubahPasangan(idRuang, id, { tanggalMenikah });
    if (!pasangan) throw galat(404, "PASANGAN_TIDAK_DITEMUKAN", "Hubungan pasangan tidak ditemukan.");
    const [berurut] = urutkanPerOrang(await penyimpanan.daftarPasangan(idRuang)).filter(
      (satu) => satu.id === pasangan.id,
    );
    res.json({ pasangan: berurut ?? pasangan });
  });

  rute.delete("/:pasanganId", async (req, res) => {
    const terhapus = await penyimpanan.hapusPasangan(ruangId(req), String(req.params.pasanganId));
    if (!terhapus) throw galat(404, "PASANGAN_TIDAK_DITEMUKAN", "Hubungan pasangan tidak ditemukan.");
    res.status(204).end();
  });

  return rute;
}
