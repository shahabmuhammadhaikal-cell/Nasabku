import { describe, expect, it } from "vitest";
import { buatAplikasiUji, buatOrang, buatRuang, daftar } from "../pembantu.js";

async function isiTigaAngkatan(
  agen: ReturnType<typeof daftar> extends Promise<infer T> ? (T extends { agen: infer A } ? A : never) : never,
  ruangId: string,
): Promise<{ kakek: string; ayah: string; cucu: string }> {
  const kakek = await buatOrang(agen, ruangId, "Kakek Uji", { tahunLahir: 1940 });
  const ayah = await buatOrang(agen, ruangId, "Ayah Uji", { tahunLahir: 1968 });
  const cucu = await buatOrang(agen, ruangId, "Cucu Uji", { jenisKelamin: "P", tahunLahir: 1998 });
  await agen.post(`/api/v1/workspaces/${ruangId}/relations`).send({ orangTuaId: kakek, anakId: ayah });
  await agen.post(`/api/v1/workspaces/${ruangId}/relations`).send({ orangTuaId: ayah, anakId: cucu });
  return { kakek, ayah, cucu };
}

describe("statistik & ekspor ruang kerja", () => {
  it("meringkas jumlah orang, angkatan, dan rentang tahun", async () => {
    const { app } = buatAplikasiUji();
    const { agen } = await daftar(app);
    const ruangId = await buatRuang(agen, "Keluarga Statistik");
    await isiTigaAngkatan(agen, ruangId);

    const respons = await agen.get(`/api/v1/workspaces/${ruangId}/stats`);

    expect(respons.status).toBe(200);
    expect(respons.headers["cache-control"]).toBe("no-store");
    expect(respons.body.statistik).toMatchObject({
      jumlahOrang: 3,
      jumlahRelasi: 2,
      jumlahAngkatan: 3,
      jumlahAkar: 1,
      jumlahDaun: 1,
      lakiLaki: 2,
      perempuan: 1,
      tahunTertua: 1940,
      tahunTermuda: 1998,
    });
  });

  it("mengekspor satu ruang kerja sebagai berkas unduhan JSON", async () => {
    const { app } = buatAplikasiUji();
    const { agen } = await daftar(app);
    const ruangId = await buatRuang(agen, "Keluarga Ékspor Üji");
    await isiTigaAngkatan(agen, ruangId);

    const respons = await agen.get(`/api/v1/workspaces/${ruangId}/export`);

    expect(respons.status).toBe(200);
    expect(respons.headers["content-disposition"]).toBe(
      'attachment; filename="nasabku-keluarga-ekspor-uji.json"',
    );
    expect(respons.body).toMatchObject({ aplikasi: "Nasabku", versi: 1 });
    expect(respons.body.ruangKerja.id).toBe(ruangId);
    expect(respons.body.orang).toHaveLength(3);
    expect(respons.body.relasi).toHaveLength(2);
    expect(respons.body.statistik.jumlahAngkatan).toBe(3);
    expect(typeof respons.body.dieksporPada).toBe("string");
  });

  it("menolak statistik dan ekspor ruang kerja milik akun lain", async () => {
    const { app } = buatAplikasiUji();
    const satu = await daftar(app, "statistik-satu@contoh.test");
    const dua = await daftar(app, "statistik-dua@contoh.test");
    const ruangSatu = await buatRuang(satu.agen, "Punya Satu");
    await buatOrang(satu.agen, ruangSatu, "Anggota");
    const ruangDua = await buatRuang(dua.agen, "Punya Dua");

    expect((await dua.agen.get(`/api/v1/workspaces/${ruangDua}/stats?x=${ruangSatu}`)).status).toBe(200);
    expect((await dua.agen.get(`/api/v1/workspaces/${ruangSatu}/stats`)).status).toBe(404);
    expect((await dua.agen.get(`/api/v1/workspaces/${ruangSatu}/export`)).status).toBe(404);
  });
});
