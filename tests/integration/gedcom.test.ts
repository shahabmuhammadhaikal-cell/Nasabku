import { describe, expect, it } from "vitest";
import { buatAplikasiUji, buatOrang, buatRuang, daftar } from "../pembantu.js";

describe("ekspor & impor GEDCOM", () => {
  it("mengekspor silsilah lalu mengimpornya ke ruang kerja lain", async () => {
    const { app } = buatAplikasiUji();
    const { agen } = await daftar(app);
    const asal = await buatRuang(agen, "Keluarga GEDCOM");
    const kakek = await buatOrang(agen, asal, "Kakek Gede", {
      tanggalLahir: "1940-04-02",
      tempatLahir: "Medan",
      pekerjaan: "Petani",
      namaLain: "Pak Gede",
      sumber: "Wawancara 2024",
      catatan: "Petani di Deli.",
    });
    const ayah = await buatOrang(agen, asal, "Ayah Gede", { tanggalLahir: "1968" });
    const cucu = await buatOrang(agen, asal, "Cucu Gede", {
      jenisKelamin: "P",
      tanggalLahir: "1998-11",
    });
    await agen.post(`/api/v1/workspaces/${asal}/relations`).send({ orangTuaId: kakek, anakId: ayah });
    await agen.post(`/api/v1/workspaces/${asal}/relations`).send({ orangTuaId: ayah, anakId: cucu });

    const ekspor = await agen.get(`/api/v1/workspaces/${asal}/export?format=gedcom`);

    expect(ekspor.status).toBe(200);
    expect(ekspor.headers["content-type"]).toContain("text/plain");
    expect(ekspor.headers["content-disposition"]).toContain('filename="nasabku-keluarga-gedcom.ged"');
    expect(ekspor.text).toContain("0 HEAD");
    expect(ekspor.text).toContain("0 TRLR");
    expect(ekspor.text).toContain("1 NAME Kakek /Gede/");
    expect(ekspor.text).toContain("2 DATE 2 APR 1940");

    const tujuan = await buatRuang(agen, "Salinan GEDCOM");
    const impor = await agen
      .post(`/api/v1/workspaces/${tujuan}/import`)
      .send({ gedcom: ekspor.text });

    expect(impor.status).toBe(201);
    expect(impor.body.impor).toMatchObject({
      orang: 3,
      digabung: 0,
      relasi: 2,
      relasiDilewati: 0,
      tanggalDiabaikan: 0,
    });

    const salinan = await agen.get(`/api/v1/workspaces/${tujuan}/persons`);
    expect(salinan.body.jumlah).toBe(3);
    expect(salinan.body.orang.find((o: { nama: string }) => o.nama === "Kakek Gede")).toMatchObject({
      namaLain: "Pak Gede",
      tanggalLahir: "1940-04-02",
      tempatLahir: "Medan",
      pekerjaan: "Petani",
      catatan: "Petani di Deli.",
      sumber: "Wawancara 2024",
    });

    const statistik = await agen.get(`/api/v1/workspaces/${tujuan}/stats`);
    expect(statistik.body.statistik).toMatchObject({ jumlahOrang: 3, jumlahRelasi: 2, jumlahAngkatan: 3 });
  });

  it("mengekspor dan mengimpor hubungan pasangan", async () => {
    const { app } = buatAplikasiUji();
    const { agen } = await daftar(app);
    const asal = await buatRuang(agen, "Pasangan GEDCOM");
    const suami = await buatOrang(agen, asal, "Zulkifli", { tanggalLahir: "1950" });
    const istri = await buatOrang(agen, asal, "Halimah", {
      jenisKelamin: "P",
      tanggalLahir: "1955",
    });
    await agen.post(`/api/v1/workspaces/${asal}/partners`).send({
      orangAId: suami,
      orangBId: istri,
      tanggalMenikah: "1975-06-12",
    });

    const ekspor = await agen.get(`/api/v1/workspaces/${asal}/export?format=gedcom`);
    expect(ekspor.text).toMatch(/1 HUSB @I\d+@/);
    expect(ekspor.text).toMatch(/1 WIFE @I\d+@/);
    expect(ekspor.text).toContain("1 MARR\n2 DATE 12 JUN 1975");

    const tujuan = await buatRuang(agen, "Pasangan Salinan");
    const impor = await agen
      .post(`/api/v1/workspaces/${tujuan}/import`)
      .send({ gedcom: ekspor.text });
    expect(impor.body.impor).toMatchObject({ orang: 2, pasangan: 1 });

    const pasangan = await agen.get(`/api/v1/workspaces/${tujuan}/partners`);
    expect(pasangan.body.jumlah).toBe(1);
    expect(pasangan.body.pasangan[0]).toMatchObject({ tanggalMenikah: "1975-06-12", urutanA: 1 });
    expect(pasangan.body.pasangan[0].urutanB).toBe(1);
    expect((await agen.get(`/api/v1/workspaces/${tujuan}/stats`)).body.statistik.jumlahPasangan).toBe(1);
  });

  it("mengekspor dan mengimpor status pernikahan", async () => {
    const { app } = buatAplikasiUji();
    const { agen } = await daftar(app);
    const asal = await buatRuang(agen, "Perceraian GEDCOM");
    const a = await buatOrang(agen, asal, "Sutrisno", { tanggalLahir: "1945" });
    const b = await buatOrang(agen, asal, "Ratna", { jenisKelamin: "P", tanggalLahir: "1950" });
    await agen.post(`/api/v1/workspaces/${asal}/partners`).send({
      orangAId: a,
      orangBId: b,
      tanggalMenikah: "1970",
      status: "cerai",
      tanggalBerakhir: "1985-04-02",
    });

    const ekspor = await agen.get(`/api/v1/workspaces/${asal}/export?format=gedcom`);
    expect(ekspor.text).toContain("1 _STAT cerai");
    expect(ekspor.text).toContain("1 DIV\n2 DATE 2 APR 1985");

    const tujuan = await buatRuang(agen, "Cerai Salinan");
    await agen.post(`/api/v1/workspaces/${tujuan}/import`).send({ gedcom: ekspor.text });
    const pasangan = await agen.get(`/api/v1/workspaces/${tujuan}/partners`);
    expect(pasangan.body.pasangan[0]).toMatchObject({
      status: "cerai",
      tanggalBerakhir: "1985-04-02",
    });
  });

  it("menggabungkan impor berulang tanpa menduplikasi orang", async () => {
    const { app } = buatAplikasiUji();
    const { agen } = await daftar(app);
    const asal = await buatRuang(agen, "Keluarga Asal");
    const budi = await buatOrang(agen, asal, "Budi Santoso", { tanggalLahir: "1954-06-12" });
    const ani = await buatOrang(agen, asal, "Ani Santoso", { jenisKelamin: "P", tanggalLahir: "1980" });
    await agen.post(`/api/v1/workspaces/${asal}/relations`).send({ orangTuaId: budi, anakId: ani });
    const ekspor = await agen.get(`/api/v1/workspaces/${asal}/export?format=gedcom`);

    const tujuan = await buatRuang(agen, "Keluarga Tujuan");
    const pertama = await agen
      .post(`/api/v1/workspaces/${tujuan}/import`)
      .send({ gedcom: ekspor.text });
    expect(pertama.body.impor).toMatchObject({ orang: 2, digabung: 0, relasi: 1 });

    const kedua = await agen
      .post(`/api/v1/workspaces/${tujuan}/import`)
      .send({ gedcom: ekspor.text });
    expect(kedua.body.impor).toMatchObject({ orang: 2, digabung: 2, relasi: 0, relasiDilewati: 1 });

    const daftarOrang = await agen.get(`/api/v1/workspaces/${tujuan}/persons`);
    expect(daftarOrang.body.jumlah).toBe(2);
    const statistik = await agen.get(`/api/v1/workspaces/${tujuan}/stats`);
    expect(statistik.body.statistik.jumlahRelasi).toBe(1);
  });

  it("mengisi kolom kosong dari impor tanpa menimpa isian lama", async () => {
    const { app } = buatAplikasiUji();
    const { agen } = await daftar(app);
    const asal = await buatRuang(agen, "Sumber Lengkap");
    await buatOrang(agen, asal, "Budi Santoso", {
      tanggalLahir: "1954-06-12",
      tempatLahir: "Medan",
      pekerjaan: "Petani",
    });
    const ekspor = await agen.get(`/api/v1/workspaces/${asal}/export?format=gedcom`);

    const tujuan = await buatRuang(agen, "Data Sebagian");
    const lamaId = await buatOrang(agen, tujuan, "budi santoso", {
      tanggalLahir: "1954",
      sumber: "Tafsiran keluarga",
    });

    const impor = await agen
      .post(`/api/v1/workspaces/${tujuan}/import`)
      .send({ gedcom: ekspor.text });
    expect(impor.body.impor.digabung).toBe(1);

    const setelah = await agen.get(`/api/v1/workspaces/${tujuan}/persons/${lamaId}`);
    expect(setelah.body.orang).toMatchObject({
      pekerjaan: "Petani",
      tempatLahir: "Medan",
      sumber: "Tafsiran keluarga",
      tanggalLahir: "1954-06-12",
    });
    expect((await agen.get(`/api/v1/workspaces/${tujuan}/persons`)).body.jumlah).toBe(1);
  });

  it("menolak isi yang bukan GEDCOM dan format ekspor yang tidak dikenal", async () => {
    const { app } = buatAplikasiUji();
    const { agen } = await daftar(app);
    const ruang = await buatRuang(agen);

    const kosong = await agen.post(`/api/v1/workspaces/${ruang}/import`).send({ gedcom: "halo dunia" });
    expect(kosong.status).toBe(422);
    expect(kosong.body.error.kode).toBe("GEDCOM_KOSONG");

    const asing = await agen.get(`/api/v1/workspaces/${ruang}/export?format=pdf`);
    expect(asing.status).toBe(422);
    expect(asing.body.error.rincian.field).toBe("format");
  });

  it("tidak bisa mengimpor ke ruang kerja milik akun lain", async () => {
    const { app } = buatAplikasiUji();
    const satu = await daftar(app, "gedcom-satu@contoh.test");
    const dua = await daftar(app, "gedcom-dua@contoh.test");
    const ruangSatu = await buatRuang(satu.agen, "Punya Satu");
    const ruangDua = await buatRuang(dua.agen, "Punya Dua");

    const respons = await dua.agen
      .post(`/api/v1/workspaces/${ruangSatu}/import`)
      .send({ gedcom: "0 HEAD\n0 @I1@ INDI\n1 NAME Orang\n0 TRLR" });

    expect(respons.status).toBe(404);
    expect((await dua.agen.get(`/api/v1/workspaces/${ruangDua}/persons`)).body.jumlah).toBe(0);
  });
});
