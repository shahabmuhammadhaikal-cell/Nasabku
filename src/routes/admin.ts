import { Router } from "express";
import type { Penyimpanan } from "../data/penyimpanan.js";
import type { PeranPengguna, StatusPengguna, StatusRuangKerja } from "../data/tipe.js";
import { galat } from "../lib/kesalahan.js";
import { ringkasUsulan, terapkanUsulan } from "../lib/usulan.js";
import { badanObjek, teksOpsional } from "../lib/validasi.js";

const STATUS_PENGGUNA: StatusPengguna[] = ["aktif", "menunggu", "nonaktif"];
const STATUS_USULAN = ["disetujui", "ditolak"] as const;

function booleanOpsional(
  badan: Record<string, unknown>,
  kunci: string,
  label: string,
): boolean | undefined {
  if (!(kunci in badan) || badan[kunci] === undefined) return undefined;
  const nilai = badan[kunci];
  if (typeof nilai !== "boolean") {
    throw galat(422, "VALIDASI_GAGAL", `${label} harus true atau false.`, { field: kunci });
  }
  return nilai;
}

export function ruteAdmin(penyimpanan: Penyimpanan): Router {
  const rute = Router();

  rute.get("/pengaturan", async (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json({ pengaturan: await penyimpanan.ambilPengaturan() });
  });

  rute.patch("/pengaturan", async (req, res) => {
    const badan = badanObjek(req.body);
    const maksMentah = badan.maksOrangPerRuang;
    let maksOrangPerRuang: number | undefined;
    if (maksMentah !== undefined && maksMentah !== null) {
      const angka = Number(maksMentah);
      if (!Number.isInteger(angka) || angka < 0 || angka > 100_000) {
        throw galat(
          422,
          "VALIDASI_GAGAL",
          "Batas orang per ruang kerja harus bilangan bulat 0–100000 (0 = tanpa batas).",
          { field: "maksOrangPerRuang" },
        );
      }
      maksOrangPerRuang = angka;
    }

    const pengaturan = await penyimpanan.simpanPengaturan({
      pendaftaranTerbuka: booleanOpsional(badan, "pendaftaranTerbuka", "Buka pendaftaran"),
      setujuiPendaftaran: booleanOpsional(badan, "setujuiPendaftaran", "Persetujuan pendaftaran"),
      setujuiRuangKerja: booleanOpsional(badan, "setujuiRuangKerja", "Persetujuan ruang kerja"),
      setujuiPerubahan: booleanOpsional(badan, "setujuiPerubahan", "Persetujuan perubahan"),
      maksOrangPerRuang,
    });
    res.json({ pengaturan });
  });

  rute.get("/pengguna", async (_req, res) => {
    const [pengguna, ruang] = await Promise.all([
      penyimpanan.daftarPengguna(),
      penyimpanan.daftarSemuaRuangKerja(),
    ]);
    const jumlahRuang = new Map<string, number>();
    for (const satu of ruang) {
      jumlahRuang.set(satu.pemilikId, (jumlahRuang.get(satu.pemilikId) ?? 0) + 1);
    }
    res.setHeader("Cache-Control", "no-store");
    res.json({
      pengguna: pengguna.map((satu) => ({
        ...satu,
        jumlahRuangKerja: jumlahRuang.get(satu.id) ?? 0,
      })),
    });
  });

  rute.patch("/pengguna/:penggunaId", async (req, res) => {
    const id = String(req.params.penggunaId);
    if (id === req.pengguna?.id) {
      throw galat(
        422,
        "VALIDASI_GAGAL",
        "Admin tidak bisa mengubah peran atau status akunnya sendiri.",
      );
    }
    const badan = badanObjek(req.body);

    let status: StatusPengguna | undefined;
    if ("status" in badan && badan.status !== undefined) {
      const nilai = badan.status;
      if (typeof nilai !== "string" || !STATUS_PENGGUNA.includes(nilai as StatusPengguna)) {
        throw galat(422, "VALIDASI_GAGAL", 'Status harus "aktif", "menunggu", atau "nonaktif".', {
          field: "status",
        });
      }
      status = nilai as StatusPengguna;
    }

    let peran: PeranPengguna | undefined;
    if ("peran" in badan && badan.peran !== undefined) {
      const nilai = badan.peran;
      if (nilai !== "admin" && nilai !== "pengguna") {
        throw galat(422, "VALIDASI_GAGAL", 'Peran harus "admin" atau "pengguna".', {
          field: "peran",
        });
      }
      peran = nilai;
    }

    const pengguna = await penyimpanan.ubahPengguna(id, {
      status,
      peran,
      nama: teksOpsional(badan, "nama", "Nama", 80) ?? undefined,
    });
    if (!pengguna) throw galat(404, "PENGGUNA_TIDAK_DITEMUKAN", "Pengguna tidak ditemukan.");
    res.json({ pengguna });
  });

  rute.delete("/pengguna/:penggunaId", async (req, res) => {
    const id = String(req.params.penggunaId);
    if (id === req.pengguna?.id) {
      throw galat(422, "VALIDASI_GAGAL", "Admin tidak bisa menghapus akunnya sendiri.");
    }
    const terhapus = await penyimpanan.hapusPengguna(id);
    if (!terhapus) throw galat(404, "PENGGUNA_TIDAK_DITEMUKAN", "Pengguna tidak ditemukan.");
    res.status(204).end();
  });

  rute.get("/ruang-kerja", async (_req, res) => {
    const [ruang, pengguna] = await Promise.all([
      penyimpanan.daftarSemuaRuangKerja(),
      penyimpanan.daftarPengguna(),
    ]);
    const nama = new Map(pengguna.map((satu) => [satu.id, satu.nama]));
    res.setHeader("Cache-Control", "no-store");
    res.json({
      ruangKerja: ruang.map((satu) => ({
        ...satu,
        pemilikNama: nama.get(satu.pemilikId) ?? "?",
      })),
    });
  });

  rute.patch("/ruang-kerja/:ruangId", async (req, res) => {
    const badan = badanObjek(req.body);
    const status = badan.status;
    if (status !== "aktif" && status !== "menunggu") {
      throw galat(422, "VALIDASI_GAGAL", 'Status ruang kerja harus "aktif" atau "menunggu".', {
        field: "status",
      });
    }
    const ruang = await penyimpanan.ubahStatusRuangKerja(
      String(req.params.ruangId),
      status as StatusRuangKerja,
    );
    if (!ruang) throw galat(404, "RUANG_TIDAK_DITEMUKAN", "Ruang kerja tidak ditemukan.");
    res.json({ ruangKerja: ruang });
  });

  rute.get("/usulan", async (req, res) => {
    const status = req.query.status === "menunggu" || req.query.status === "disetujui" || req.query.status === "ditolak"
      ? req.query.status
      : undefined;
    const [usulan, pengguna, ruang] = await Promise.all([
      penyimpanan.daftarUsulan(status),
      penyimpanan.daftarPengguna(),
      penyimpanan.daftarSemuaRuangKerja(),
    ]);
    const namaPengguna = new Map(pengguna.map((satu) => [satu.id, satu.nama]));
    const namaRuang = new Map(ruang.map((satu) => [satu.id, satu.nama]));
    res.setHeader("Cache-Control", "no-store");
    res.json({
      usulan: usulan.map((satu) => ({
        ...satu,
        ringkasan: ringkasUsulan(satu),
        penggunaNama: namaPengguna.get(satu.penggunaId) ?? "?",
        ruangNama: namaRuang.get(satu.ruangKerjaId) ?? "?",
      })),
    });
  });

  rute.patch("/usulan/:usulanId", async (req, res) => {
    const id = String(req.params.usulanId);
    const badan = badanObjek(req.body);
    const status = badan.status;
    if (typeof status !== "string" || !STATUS_USULAN.includes(status as (typeof STATUS_USULAN)[number])) {
      throw galat(422, "VALIDASI_GAGAL", 'Status usulan harus "disetujui" atau "ditolak".', {
        field: "status",
      });
    }

    const lama = await penyimpanan.ambilUsulan(id);
    if (!lama) throw galat(404, "USULAN_TIDAK_DITEMUKAN", "Usulan tidak ditemukan.");
    if (lama.status !== "menunggu") {
      throw galat(409, "USULAN_SUDAH_DIPUTUSKAN", "Usulan ini sudah diputuskan sebelumnya.");
    }

    if (status === "disetujui") {
      await terapkanUsulan(penyimpanan, lama);
    }

    const usulan = await penyimpanan.putuskanUsulan(id, {
      status: status as "disetujui" | "ditolak",
      catatanAdmin: teksOpsional(badan, "catatan", "Catatan admin", 500) ?? null,
    });
    res.json({ usulan });
  });

  return rute;
}
