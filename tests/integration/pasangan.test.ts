import { describe, expect, it } from "vitest";
import { buatAplikasiUji, buatOrang, buatRuang, daftar } from "../pembantu.js";

describe("pasangan", () => {
  it("mencatat pasangan dan menampilkannya dari kedua pihak", async () => {
    const { app } = buatAplikasiUji();
    const { agen } = await daftar(app);
    const ruangId = await buatRuang(agen);
    const suami = await buatOrang(agen, ruangId, "Suami");
    const istri = await buatOrang(agen, ruangId, "Istri", { jenisKelamin: "P" });

    const tambah = await agen
      .post(`/api/v1/workspaces/${ruangId}/partners`)
      .send({ orangAId: suami, orangBId: istri });

    expect(tambah.status).toBe(201);
    expect(tambah.body.pasangan.ruangKerjaId).toBe(ruangId);
    expect([tambah.body.pasangan.orangAId, tambah.body.pasangan.orangBId].sort()).toEqual(
      [suami, istri].sort(),
    );

    const dariSuami = await agen.get(`/api/v1/workspaces/${ruangId}/partners?orangId=${suami}`);
    const dariIstri = await agen.get(`/api/v1/workspaces/${ruangId}/partners?orangId=${istri}`);
    expect(dariSuami.body.jumlah).toBe(1);
    expect(dariIstri.body.jumlah).toBe(1);
  });

  it("menghitung pasangan pada statistik dan ekspor JSON", async () => {
    const { app } = buatAplikasiUji();
    const { agen } = await daftar(app);
    const ruangId = await buatRuang(agen);
    const a = await buatOrang(agen, ruangId, "A");
    const b = await buatOrang(agen, ruangId, "B", { jenisKelamin: "P" });
    await agen.post(`/api/v1/workspaces/${ruangId}/partners`).send({ orangAId: a, orangBId: b });

    const statistik = await agen.get(`/api/v1/workspaces/${ruangId}/stats`);
    expect(statistik.body.statistik.jumlahPasangan).toBe(1);

    const ekspor = await agen.get(`/api/v1/workspaces/${ruangId}/export`);
    expect(ekspor.body.pasangan).toHaveLength(1);
    expect(ekspor.body.statistik.jumlahPasangan).toBe(1);
  });

  it("menolak pasangan diri sendiri dan pasangan ganda", async () => {
    const { app } = buatAplikasiUji();
    const { agen } = await daftar(app);
    const ruangId = await buatRuang(agen);
    const a = await buatOrang(agen, ruangId, "A");
    const b = await buatOrang(agen, ruangId, "B");

    const diriSendiri = await agen
      .post(`/api/v1/workspaces/${ruangId}/partners`)
      .send({ orangAId: a, orangBId: a });
    expect(diriSendiri.status).toBe(422);

    await agen.post(`/api/v1/workspaces/${ruangId}/partners`).send({ orangAId: a, orangBId: b });

    const ganda = await agen
      .post(`/api/v1/workspaces/${ruangId}/partners`)
      .send({ orangAId: b, orangBId: a });
    expect(ganda.status).toBe(409);
    expect(ganda.body.error.kode).toBe("PASANGAN_SUDAH_ADA");
  });

  it("melepas pasangan dan membersihkannya saat orang dihapus", async () => {
    const { app } = buatAplikasiUji();
    const { agen } = await daftar(app);
    const ruangId = await buatRuang(agen);
    const a = await buatOrang(agen, ruangId, "A");
    const b = await buatOrang(agen, ruangId, "B");
    const c = await buatOrang(agen, ruangId, "C");

    const satu = await agen
      .post(`/api/v1/workspaces/${ruangId}/partners`)
      .send({ orangAId: a, orangBId: b });
    await agen.post(`/api/v1/workspaces/${ruangId}/partners`).send({ orangAId: a, orangBId: c });

    const hapus = await agen.delete(`/api/v1/workspaces/${ruangId}/partners/${satu.body.pasangan.id}`);
    expect(hapus.status).toBe(204);

    await agen.delete(`/api/v1/workspaces/${ruangId}/persons/${a}`);
    const sisa = await agen.get(`/api/v1/workspaces/${ruangId}/partners`);
    expect(sisa.body.jumlah).toBe(0);
  });

  it("menolak pasangan dari ruang kerja lain", async () => {
    const { app } = buatAplikasiUji();
    const satu = await daftar(app, "pasangan-satu@contoh.test");
    const dua = await daftar(app, "pasangan-dua@contoh.test");
    const ruangSatu = await buatRuang(satu.agen, "Satu");
    const ruangDua = await buatRuang(dua.agen, "Dua");
    const orangSatu = await buatOrang(satu.agen, ruangSatu, "Milik Satu");
    const orangDua = await buatOrang(dua.agen, ruangDua, "Milik Dua");

    const silang = await dua.agen
      .post(`/api/v1/workspaces/${ruangDua}/partners`)
      .send({ orangAId: orangDua, orangBId: orangSatu });
    expect(silang.status).toBe(404);

    expect((await dua.agen.get(`/api/v1/workspaces/${ruangSatu}/partners`)).status).toBe(404);
  });
});
