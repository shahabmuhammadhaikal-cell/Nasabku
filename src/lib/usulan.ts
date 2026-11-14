import type { Penyimpanan } from "../data/penyimpanan.js";
import type { DataOrang, DataPasangan, Usulan } from "../data/tipe.js";

/**
 * Menjalankan usulan yang sudah disetujui pada data ruang kerja.
 * Dipanggil hanya oleh rute admin; kegagalan penerapan dilempar sebagai galat
 * agar admin tahu usulan tidak benar-benar masuk.
 */
export async function terapkanUsulan(
  penyimpanan: Penyimpanan,
  usulan: Usulan,
): Promise<void> {
  const ruang = usulan.ruangKerjaId;
  const data = usulan.data;

  if (usulan.jenis === "orang") {
    if (usulan.aksi === "tambah") {
      await penyimpanan.buatOrang(ruang, data as unknown as DataOrang);
      return;
    }
    if (!usulan.targetId) return;
    if (usulan.aksi === "ubah") {
      await penyimpanan.ubahOrang(ruang, usulan.targetId, data as unknown as DataOrang);
      return;
    }
    await penyimpanan.hapusOrang(ruang, usulan.targetId);
    return;
  }

  if (usulan.jenis === "relasi") {
    if (usulan.aksi === "tambah") {
      const orangTuaId = String(data.orangTuaId ?? "");
      const anakId = String(data.anakId ?? "");
      if (orangTuaId && anakId) {
        await penyimpanan.buatRelasi(ruang, orangTuaId, anakId);
      }
      return;
    }
    if (usulan.targetId) await penyimpanan.hapusRelasi(ruang, usulan.targetId);
    return;
  }

  if (usulan.aksi === "tambah") {
    const orangAId = String(data.orangAId ?? "");
    const orangBId = String(data.orangBId ?? "");
    if (orangAId && orangBId) {
      await penyimpanan.buatPasangan(ruang, orangAId, orangBId, data as unknown as DataPasangan);
    }
    return;
  }
  if (!usulan.targetId) return;
  if (usulan.aksi === "ubah") {
    await penyimpanan.ubahPasangan(ruang, usulan.targetId, data as unknown as DataPasangan);
    return;
  }
  await penyimpanan.hapusPasangan(ruang, usulan.targetId);
}

/** Kalimat singkat untuk daftar antrean admin. */
export function ringkasUsulan(usulan: Usulan): string {
  const nama = typeof usulan.data.nama === "string" ? usulan.data.nama : "";
  const tindakan = usulan.aksi === "tambah" ? "Tambah" : usulan.aksi === "ubah" ? "Ubah" : "Hapus";
  if (usulan.jenis === "orang") return `${tindakan} orang${nama ? `: ${nama}` : ""}`;
  if (usulan.jenis === "relasi") return `${tindakan} relasi orang tua–anak`;
  return `${tindakan} hubungan pasangan`;
}
