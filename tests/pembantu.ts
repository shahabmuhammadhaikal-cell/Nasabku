import request from "supertest";
import { buatAplikasi } from "../src/app.js";
import { muatKonfigurasi, type Konfigurasi } from "../src/config.js";
import { bukaDatabase } from "../src/db.js";

export type Agen = ReturnType<typeof request.agent>;

export function buatAplikasiUji(): { app: ReturnType<typeof buatAplikasi>; konfigurasi: Konfigurasi } {
  const db = bukaDatabase(":memory:");
  const konfigurasi = muatKonfigurasi({ NODE_ENV: "test" } as NodeJS.ProcessEnv);
  return { app: buatAplikasi({ db, konfigurasi }), konfigurasi };
}

export const SANDI_UJI = "RahasiaUji!123";

export async function daftar(
  app: ReturnType<typeof buatAplikasi>,
  email = `uji-${Math.random().toString(36).slice(2, 8)}@contoh.test`,
  nama = "Penguji",
): Promise<{ agen: Agen; email: string; penggunaId: string }> {
  const agen = request.agent(app);
  const respons = await agen.post("/api/v1/auth/register").send({ email, nama, sandi: SANDI_UJI });
  if (respons.status !== 201) {
    throw new Error(`pendaftaran gagal: ${respons.status} ${JSON.stringify(respons.body)}`);
  }
  return { agen, email, penggunaId: respons.body.pengguna.id as string };
}

export async function buatRuang(agen: Agen, nama = "Keluarga Uji"): Promise<string> {
  const respons = await agen.post("/api/v1/workspaces").send({ nama });
  if (respons.status !== 201) {
    throw new Error(`ruang kerja gagal: ${respons.status} ${JSON.stringify(respons.body)}`);
  }
  return respons.body.ruangKerja.id as string;
}

export async function buatOrang(
  agen: Agen,
  ruangId: string,
  nama: string,
  tambahan: Record<string, unknown> = {},
): Promise<string> {
  const respons = await agen
    .post(`/api/v1/workspaces/${ruangId}/persons`)
    .send({ nama, jenisKelamin: "L", ...tambahan });
  if (respons.status !== 201) {
    throw new Error(`orang gagal: ${respons.status} ${JSON.stringify(respons.body)}`);
  }
  return respons.body.orang.id as string;
}
