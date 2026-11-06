import { describe, expect, it } from "vitest";
import { buatAplikasiUji, buatOrang, buatRuang, daftar } from "../pembantu.js";

describe("orang", () => {
  it("menambah, membaca, mengubah, dan menghapus orang", async () => {
    const { app } = buatAplikasiUji();
    const { agen } = await daftar(app);
    const ruangId = await buatRuang(agen);

    const tambah = await agen.post(`/api/v1/workspaces/${ruangId}/persons`).send({
      nama: "Siti Aminah",
      jenisKelamin: "P",
      tahunLahir: 1954,
      catatan: "Dari Medan",
    });
    expect(tambah.status).toBe(201);
    expect(tambah.body.orang).toMatchObject({
      nama: "Siti Aminah",
      jenisKelamin: "P",
      tahunLahir: 1954,
      tahunWafat: null,
      catatan: "Dari Medan",
    });

    const id = tambah.body.orang.id as string;
    const satu = await agen.get(`/api/v1/workspaces/${ruangId}/persons/${id}`);
    expect(satu.status).toBe(200);
    expect(satu.body.orang.nama).toBe("Siti Aminah");

    const ubah = await agen
      .patch(`/api/v1/workspaces/${ruangId}/persons/${id}`)
      .send({ nama: "Siti Aminah Nasution", tahunWafat: 2020 });
    expect(ubah.status).toBe(200);
    expect(ubah.body.orang.nama).toBe("Siti Aminah Nasution");
    expect(ubah.body.orang.tahunWafat).toBe(2020);
    expect(ubah.body.orang.tahunLahir).toBe(1954);

    expect((await agen.delete(`/api/v1/workspaces/${ruangId}/persons/${id}`)).status).toBe(204);
    expect((await agen.get(`/api/v1/workspaces/${ruangId}/persons/${id}`)).status).toBe(404);
  });

  it("menolak tahun wafat yang lebih awal dari tahun lahir", async () => {
    const { app } = buatAplikasiUji();
    const { agen } = await daftar(app);
    const ruangId = await buatRuang(agen);

    const respons = await agen
      .post(`/api/v1/workspaces/${ruangId}/persons`)
      .send({ nama: "Tidak Mungkin", tahunLahir: 1990, tahunWafat: 1980 });
    expect(respons.status).toBe(422);
    expect(respons.body.error.rincian.field).toBe("tahunWafat");
  });

  it("mewajibkan nama", async () => {
    const { app } = buatAplikasiUji();
    const { agen } = await daftar(app);
    const ruangId = await buatRuang(agen);
    const respons = await agen.post(`/api/v1/workspaces/${ruangId}/persons`).send({ nama: "  " });
    expect(respons.status).toBe(422);
  });

  it("mencari nama dan meng-escape karakter LIKE", async () => {
    const { app } = buatAplikasiUji();
    const { agen } = await daftar(app);
    const ruangId = await buatRuang(agen);
    await buatOrang(agen, ruangId, "Budi Santoso");
    await buatOrang(agen, ruangId, "Santi Budiman");
    await buatOrang(agen, ruangId, "Ratna");

    const cocok = await agen.get(`/api/v1/workspaces/${ruangId}/persons?q=bud`);
    expect(cocok.body.orang.map((o: { nama: string }) => o.nama).sort()).toEqual([
      "Budi Santoso",
      "Santi Budiman",
    ]);

    const semua = await agen.get(`/api/v1/workspaces/${ruangId}/persons`);
    expect(semua.body.orang).toHaveLength(3);

    const liar = await agen.get(`/api/v1/workspaces/${ruangId}/persons?q=${encodeURIComponent("%")}`);
    expect(liar.body.orang).toHaveLength(0);
  });

  it("tidak bisa menyentuh orang di ruang kerja lain", async () => {
    const { app } = buatAplikasiUji();
    const satu = await daftar(app, "satu@contoh.test");
    const dua = await daftar(app, "dua@contoh.test");
    const ruangSatu = await buatRuang(satu.agen, "Satu");
    const ruangDua = await buatRuang(dua.agen, "Dua");
    const orangSatu = await buatOrang(satu.agen, ruangSatu, "Milik Satu");
    const orangDua = await buatOrang(dua.agen, ruangDua, "Milik Dua");

    expect((await dua.agen.get(`/api/v1/workspaces/${ruangDua}/persons/${orangSatu}`)).status).toBe(404);
    expect((await dua.agen.delete(`/api/v1/workspaces/${ruangDua}/persons/${orangSatu}`)).status).toBe(404);

    const daftarDua = await dua.agen.get(`/api/v1/workspaces/${ruangDua}/persons`);
    expect(daftarDua.body.jumlah).toBe(1);
    expect(daftarDua.body.orang[0].id).toBe(orangDua);
  });
});
