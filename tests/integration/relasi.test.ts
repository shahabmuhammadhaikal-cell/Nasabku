import { describe, expect, it } from "vitest";
import { buatAplikasiUji, buatOrang, buatRuang, daftar } from "../pembantu.js";

describe("relasi", () => {
  it("mencatat relasi orang tua–anak dan menampilkannya dua arah", async () => {
    const { app } = buatAplikasiUji();
    const { agen } = await daftar(app);
    const ruangId = await buatRuang(agen);
    const ayah = await buatOrang(agen, ruangId, "Ayah");
    const anak = await buatOrang(agen, ruangId, "Anak");

    const tambah = await agen
      .post(`/api/v1/workspaces/${ruangId}/relations`)
      .send({ orangTuaId: ayah, anakId: anak });
    expect(tambah.status).toBe(201);
    expect(tambah.body.relasi).toMatchObject({ orangTuaId: ayah, anakId: anak, ruangKerjaId: ruangId });

    const untukAnak = await agen.get(`/api/v1/workspaces/${ruangId}/relations?orangId=${anak}`);
    expect(untukAnak.body.relasi).toHaveLength(1);

    const semua = await agen.get(`/api/v1/workspaces/${ruangId}/relations`);
    expect(semua.body.jumlah).toBe(1);
    expect(semua.body.relasi[0].orangTuaId).toBe(ayah);
  });

  it("menolak relasi ganda dan relasi ke diri sendiri", async () => {
    const { app } = buatAplikasiUji();
    const { agen } = await daftar(app);
    const ruangId = await buatRuang(agen);
    const a = await buatOrang(agen, ruangId, "A");
    const b = await buatOrang(agen, ruangId, "B");

    await agen.post(`/api/v1/workspaces/${ruangId}/relations`).send({ orangTuaId: a, anakId: b });
    const ganda = await agen
      .post(`/api/v1/workspaces/${ruangId}/relations`)
      .send({ orangTuaId: a, anakId: b });
    expect(ganda.status).toBe(409);
    expect(ganda.body.error.kode).toBe("RELASI_SUDAH_ADA");

    const diriSendiri = await agen
      .post(`/api/v1/workspaces/${ruangId}/relations`)
      .send({ orangTuaId: a, anakId: a });
    expect(diriSendiri.status).toBe(422);
  });

  it("menolak relasi yang membentuk lingkaran silsilah", async () => {
    const { app } = buatAplikasiUji();
    const { agen } = await daftar(app);
    const ruangId = await buatRuang(agen);
    const a = await buatOrang(agen, ruangId, "A");
    const b = await buatOrang(agen, ruangId, "B");
    const c = await buatOrang(agen, ruangId, "C");

    await agen.post(`/api/v1/workspaces/${ruangId}/relations`).send({ orangTuaId: a, anakId: b });
    await agen.post(`/api/v1/workspaces/${ruangId}/relations`).send({ orangTuaId: b, anakId: c });

    const siklus = await agen
      .post(`/api/v1/workspaces/${ruangId}/relations`)
      .send({ orangTuaId: c, anakId: a });
    expect(siklus.status).toBe(409);
    expect(siklus.body.error.kode).toBe("SIKLUS_SILSILAH");
  });

  it("menolak orang dari ruang kerja lain", async () => {
    const { app } = buatAplikasiUji();
    const satu = await daftar(app, "x1@contoh.test");
    const dua = await daftar(app, "x2@contoh.test");
    const ruangSatu = await buatRuang(satu.agen, "Satu");
    const ruangDua = await buatRuang(dua.agen, "Dua");
    const orangSatu = await buatOrang(satu.agen, ruangSatu, "Kepunyaan Satu");
    const orangDua = await buatOrang(dua.agen, ruangDua, "Kepunyaan Dua");

    const silang = await dua.agen
      .post(`/api/v1/workspaces/${ruangDua}/relations`)
      .send({ orangTuaId: orangDua, anakId: orangSatu });
    expect(silang.status).toBe(404);
  });

  it("melepas relasi", async () => {
    const { app } = buatAplikasiUji();
    const { agen } = await daftar(app);
    const ruangId = await buatRuang(agen);
    const a = await buatOrang(agen, ruangId, "A");
    const b = await buatOrang(agen, ruangId, "B");
    const relasi = await agen
      .post(`/api/v1/workspaces/${ruangId}/relations`)
      .send({ orangTuaId: a, anakId: b });

    const hapus = await agen.delete(`/api/v1/workspaces/${ruangId}/relations/${relasi.body.relasi.id}`);
    expect(hapus.status).toBe(204);
    expect((await agen.get(`/api/v1/workspaces/${ruangId}/relations`)).body.jumlah).toBe(0);
  });

  it("menghapus relasi otomatis saat orangnya dihapus", async () => {
    const { app } = buatAplikasiUji();
    const { agen } = await daftar(app);
    const ruangId = await buatRuang(agen);
    const a = await buatOrang(agen, ruangId, "A");
    const b = await buatOrang(agen, ruangId, "B");
    await agen.post(`/api/v1/workspaces/${ruangId}/relations`).send({ orangTuaId: a, anakId: b });

    await agen.delete(`/api/v1/workspaces/${ruangId}/persons/${a}`);
    expect((await agen.get(`/api/v1/workspaces/${ruangId}/relations`)).body.jumlah).toBe(0);
  });
});
