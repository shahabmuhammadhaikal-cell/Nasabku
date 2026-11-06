import { describe, expect, it } from "vitest";
import { buatAplikasiUji, buatOrang, buatRuang, daftar } from "../pembantu.js";

async function siapkanRantai() {
  const { app } = buatAplikasiUji();
  const { agen } = await daftar(app);
  const ruangId = await buatRuang(agen);
  const kakek = await buatOrang(agen, ruangId, "Kakek");
  const ayah = await buatOrang(agen, ruangId, "Ayah");
  const anak = await buatOrang(agen, ruangId, "Anak");
  const cucu = await buatOrang(agen, ruangId, "Cucu");
  for (const [orangTuaId, anakId] of [
    [kakek, ayah],
    [ayah, anak],
    [anak, cucu],
  ] as const) {
    const respons = await agen
      .post(`/api/v1/workspaces/${ruangId}/relations`)
      .send({ orangTuaId, anakId });
    expect(respons.status).toBe(201);
  }
  return { agen, ruangId, kakek, ayah, anak, cucu };
}

describe("silsilah", () => {
  it("menelusuri keturunan sedalam yang diminta", async () => {
    const { agen, ruangId, kakek, cucu } = await siapkanRantai();

    const hasil = await agen.get(`/api/v1/workspaces/${ruangId}/tree/${kakek}?arah=turun&kedalaman=5`);
    expect(hasil.status).toBe(200);
    expect(hasil.body.arah).toBe("turun");
    expect(hasil.body.simpul).toHaveLength(4);
    expect(hasil.body.simpul.map((s: { orang: { nama: string } }) => s.orang.nama)).toEqual([
      "Kakek",
      "Ayah",
      "Anak",
      "Cucu",
    ]);

    const terakhir = hasil.body.simpul[3];
    expect(terakhir.kedalaman).toBe(3);
    expect(terakhir.orang.id).toBe(cucu);
    expect(terakhir.lewat).toHaveLength(4);
  });

  it("menelusuri leluhur dari keturunan terjauh", async () => {
    const { agen, ruangId, cucu } = await siapkanRantai();
    const hasil = await agen.get(`/api/v1/workspaces/${ruangId}/tree/${cucu}?arah=naik&kedalaman=5`);
    expect(hasil.body.arah).toBe("naik");
    expect(hasil.body.simpul).toHaveLength(4);
    expect(hasil.body.simpul.map((s: { orang: { nama: string } }) => s.orang.nama)).toEqual([
      "Cucu",
      "Anak",
      "Ayah",
      "Kakek",
    ]);
  });

  it("membatasi kedalaman", async () => {
    const { agen, ruangId, kakek } = await siapkanRantai();
    const hasil = await agen.get(`/api/v1/workspaces/${ruangId}/tree/${kakek}?arah=turun&kedalaman=1`);
    expect(hasil.body.simpul).toHaveLength(2);
  });

  it("menolak parameter yang tidak sah", async () => {
    const { agen, ruangId, kakek } = await siapkanRantai();
    expect(
      (await agen.get(`/api/v1/workspaces/${ruangId}/tree/${kakek}?arah=samping`)).status,
    ).toBe(422);
    expect(
      (await agen.get(`/api/v1/workspaces/${ruangId}/tree/${kakek}?kedalaman=99`)).status,
    ).toBe(422);
  });

  it("404 untuk orang di luar ruang kerja", async () => {
    const { agen, ruangId, kakek } = await siapkanRantai();
    const lain = await buatRuang(agen, "Keluarga Lain");
    const hasil = await agen.get(`/api/v1/workspaces/${lain}/tree/${kakek}`);
    expect(hasil.status).toBe(404);
    expect(ruangId).not.toBe(lain);
  });
});
