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
      tanggalLahir: "1954-06-12",
      tempatLahir: "Medan",
      catatan: "Dari Medan",
    });
    expect(tambah.status).toBe(201);
    expect(tambah.body.orang).toMatchObject({
      nama: "Siti Aminah",
      jenisKelamin: "P",
      tanggalLahir: "1954-06-12",
      tempatLahir: "Medan",
      tanggalWafat: null,
      tempatWafat: null,
      catatan: "Dari Medan",
    });

    const id = tambah.body.orang.id as string;
    const satu = await agen.get(`/api/v1/workspaces/${ruangId}/persons/${id}`);
    expect(satu.status).toBe(200);
    expect(satu.body.orang.nama).toBe("Siti Aminah");

    const ubah = await agen
      .patch(`/api/v1/workspaces/${ruangId}/persons/${id}`)
      .send({ nama: "Siti Aminah Nasution", tanggalWafat: "2020-03-08", tempatWafat: "Bandung" });
    expect(ubah.status).toBe(200);
    expect(ubah.body.orang.nama).toBe("Siti Aminah Nasution");
    expect(ubah.body.orang.tanggalWafat).toBe("2020-03-08");
    expect(ubah.body.orang.tempatWafat).toBe("Bandung");
    expect(ubah.body.orang.tanggalLahir).toBe("1954-06-12");

    expect((await agen.delete(`/api/v1/workspaces/${ruangId}/persons/${id}`)).status).toBe(204);
    expect((await agen.get(`/api/v1/workspaces/${ruangId}/persons/${id}`)).status).toBe(404);
  });

  it("menolak tanggal wafat yang lebih awal dari tanggal lahir", async () => {
    const { app } = buatAplikasiUji();
    const { agen } = await daftar(app);
    const ruangId = await buatRuang(agen);

    const respons = await agen
      .post(`/api/v1/workspaces/${ruangId}/persons`)
      .send({ nama: "Tidak Mungkin", tanggalLahir: "1990-05-01", tanggalWafat: "1980-01-01" });
    expect(respons.status).toBe(422);
    expect(respons.body.error.rincian.field).toBe("tanggalWafat");
  });

  it("menerima tanggal bertingkat dan menolak format yang tidak sah", async () => {
    const { app } = buatAplikasiUji();
    const { agen } = await daftar(app);
    const ruangId = await buatRuang(agen);

    const hanyaTahun = await agen
      .post(`/api/v1/workspaces/${ruangId}/persons`)
      .send({ nama: "Tanpa Tanggal Pasti", tanggalLahir: "1940" });
    expect(hanyaTahun.status).toBe(201);
    expect(hanyaTahun.body.orang.tanggalLahir).toBe("1940");

    const tahunBulan = await agen
      .post(`/api/v1/workspaces/${ruangId}/persons`)
      .send({ nama: "Setengah Tahun", tanggalLahir: "1940-07" });
    expect(tahunBulan.body.orang.tanggalLahir).toBe("1940-07");

    for (const salah of ["1940-13", "1940-02-31", "12-06-1940", "1940/06/12"]) {
      const respons = await agen
        .post(`/api/v1/workspaces/${ruangId}/persons`)
        .send({ nama: "Salah Format", tanggalLahir: salah });
      expect(respons.status).toBe(422);
      expect(respons.body.error.rincian.field).toBe("tanggalLahir");
    }
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

  it("menyimpan keterangan tambahan dan bisa mengosongkannya lagi", async () => {
    const { app } = buatAplikasiUji();
    const { agen } = await daftar(app);
    const ruangId = await buatRuang(agen);

    const tambah = await agen.post(`/api/v1/workspaces/${ruangId}/persons`).send({
      nama: "Budi Santoso",
      namaLain: "Pak Budi",
      pekerjaan: "Petani",
      tempatPemakaman: "TPU Cikutra",
      sumber: "Wawancara cucu, 2024",
    });
    expect(tambah.status).toBe(201);
    expect(tambah.body.orang).toMatchObject({
      namaLain: "Pak Budi",
      pekerjaan: "Petani",
      tempatPemakaman: "TPU Cikutra",
      sumber: "Wawancara cucu, 2024",
    });

    const id = tambah.body.orang.id as string;
    const ubah = await agen.patch(`/api/v1/workspaces/${ruangId}/persons/${id}`).send({ sumber: "" });
    expect(ubah.status).toBe(200);
    expect(ubah.body.orang.sumber).toBeNull();
    expect(ubah.body.orang.pekerjaan).toBe("Petani");

    const cari = await agen.get(`/api/v1/workspaces/${ruangId}/persons?q=pak budi`);
    expect(cari.body.orang).toHaveLength(1);

    const cariKerja = await agen.get(`/api/v1/workspaces/${ruangId}/persons?q=petani`);
    expect(cariKerja.body.orang).toHaveLength(1);
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
