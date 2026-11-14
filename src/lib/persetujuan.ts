import type { Penyimpanan } from "../data/penyimpanan.js";
import type {
  AksiUsulan,
  JenisUsulan,
  PenggunaPublik,
  Usulan,
} from "../data/tipe.js";
import { galat } from "./kesalahan.js";

/**
 * Admin selalu langsung menulis. Pengguna biasa hanya mengajukan usulan bila
 * admin menyalakan persetujuan perubahan.
 */
export async function harusDiajukan(
  penyimpanan: Penyimpanan,
  pengguna: PenggunaPublik | undefined,
): Promise<boolean> {
  if (!pengguna || pengguna.peran === "admin") return false;
  const pengaturan = await penyimpanan.ambilPengaturan();
  return pengaturan.setujuiPerubahan;
}

export async function ajukanUsulan(
  penyimpanan: Penyimpanan,
  data: {
    ruangKerjaId: string;
    penggunaId: string;
    jenis: JenisUsulan;
    aksi: AksiUsulan;
    targetId?: string | null;
    data: Record<string, unknown>;
  },
): Promise<Usulan> {
  return penyimpanan.buatUsulan({
    ruangKerjaId: data.ruangKerjaId,
    penggunaId: data.penggunaId,
    jenis: data.jenis,
    aksi: data.aksi,
    targetId: data.targetId ?? null,
    data: data.data,
  });
}

/** Menolak penambahan orang bila batas yang disetel admin sudah tercapai. */
export async function periksaBatasOrang(
  penyimpanan: Penyimpanan,
  ruangKerjaId: string,
): Promise<void> {
  const pengaturan = await penyimpanan.ambilPengaturan();
  if (!pengaturan.maksOrangPerRuang) return;
  const orang = await penyimpanan.daftarOrang(ruangKerjaId, { batas: 100_000 });
  if (orang.length >= pengaturan.maksOrangPerRuang) {
    throw galat(
      422,
      "BATAS_ORANG_TERCAPAI",
      `Ruang kerja ini dibatasi ${pengaturan.maksOrangPerRuang} orang oleh admin.`,
    );
  }
}
