import { describe, expect, it } from "vitest";
import request from "supertest";
import { buatAplikasiUji, buatOrang, buatRuang, daftar, SANDI_UJI } from "../pembantu.js";

describe("akses admin", () => {
  it("menjadikan akun pertama admin dan menolak akun biasa membuka /admin", async () => {
    const { app } = buatAplikasiUji();
    const admin = await daftar(app, "admin@contoh.test", "Admin");
    const biasa = await daftar(app, "biasa@contoh.test", "Biasa");

    const meAdmin = await admin.agen.get("/api/v1/auth/me");
    expect(meAdmin.body.pengguna.peran).toBe("admin");

    const meBiasa = await biasa.agen.get("/api/v1/auth/me");
    expect(meBiasa.body.pengguna.peran).toBe("pengguna");

    const ditolak = await biasa.agen.get("/api/v1/admin/pengaturan");
    expect(ditolak.status).toBe(403);
    expect(ditolak.body.error.kode).toBe("BUKAN_ADMIN");

    const diterima = await admin.agen.get("/api/v1/admin/pengaturan");
    expect(diterima.status).toBe(200);
    expect(diterima.body.pengaturan.pendaftaranTerbuka).toBe(true);
    expect(diterima.body.pengaturan.maksOrangPerRuang).toBe(0);
  });

  it("menaikkan pengguna pertama menjadi admin saat basis data belum punya admin", async () => {
    const { app, penyimpanan } = buatAplikasiUji();
    const satu = await daftar(app, "satu@contoh.test", "Satu");
    await penyimpanan.ubahPengguna(satu.penggunaId, { peran: "pengguna" });
    expect((await penyimpanan.daftarPengguna()).some((akun) => akun.peran === "admin")).toBe(false);

    const masuk = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "satu@contoh.test", sandi: SANDI_UJI });
    expect(masuk.status).toBe(200);
    expect(masuk.body.pengguna.peran).toBe("admin");
  });

  it("menutup pendaftaran dan menyetujui akun yang menunggu", async () => {
    const { app } = buatAplikasiUji();
    const admin = await daftar(app, "admin@contoh.test", "Admin");

    await admin.agen.patch("/api/v1/admin/pengaturan").send({ pendaftaranTerbuka: false });
    const ditutup = await request(app)
      .post("/api/v1/auth/register")
      .send({ email: "baru@contoh.test", nama: "Baru", sandi: SANDI_UJI });
    expect(ditutup.status).toBe(403);
    expect(ditutup.body.error.kode).toBe("PENDAFTARAN_DITUTUP");

    await admin.agen
      .patch("/api/v1/admin/pengaturan")
      .send({ pendaftaranTerbuka: true, setujuiPendaftaran: true });

    const menunggu = await request(app)
      .post("/api/v1/auth/register")
      .send({ email: "baru@contoh.test", nama: "Baru", sandi: SANDI_UJI });
    expect(menunggu.status).toBe(201);
    expect(menunggu.body.menunggu).toBe(true);
    expect(menunggu.body.pengguna.status).toBe("menunggu");
    expect(menunggu.headers["set-cookie"]).toBeUndefined();
    const idBaru = menunggu.body.pengguna.id as string;

    const masukDitolak = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "baru@contoh.test", sandi: SANDI_UJI });
    expect(masukDitolak.status).toBe(403);
    expect(masukDitolak.body.error.kode).toBe("AKUN_MENUNGGU");

    const daftarPengguna = await admin.agen.get("/api/v1/admin/pengguna");
    expect(daftarPengguna.body.pengguna).toHaveLength(2);

    const disetujui = await admin.agen
      .patch(`/api/v1/admin/pengguna/${idBaru}`)
      .send({ status: "aktif" });
    expect(disetujui.status).toBe(200);
    expect(disetujui.body.pengguna.status).toBe("aktif");

    const masuk = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "baru@contoh.test", sandi: SANDI_UJI });
    expect(masuk.status).toBe(200);
  });

  it("menahan ruang kerja baru sampai admin menyetujuinya", async () => {
    const { app } = buatAplikasiUji();
    const admin = await daftar(app, "admin@contoh.test", "Admin");
    const pengguna = await daftar(app, "pengguna@contoh.test", "Pengguna");

    await admin.agen.patch("/api/v1/admin/pengaturan").send({ setujuiRuangKerja: true });

    const respons = await pengguna.agen.post("/api/v1/workspaces").send({ nama: "Keluarga Baru" });
    expect(respons.status).toBe(201);
    expect(respons.body.ruangKerja.status).toBe("menunggu");
    const ruangId = respons.body.ruangKerja.id as string;

    const tolakTulis = await pengguna.agen
      .post(`/api/v1/workspaces/${ruangId}/persons`)
      .send({ nama: "Anak", jenisKelamin: "L" });
    expect(tolakTulis.status).toBe(403);
    expect(tolakTulis.body.error.kode).toBe("RUANG_MENUNGGU");

    const semua = await admin.agen.get("/api/v1/admin/ruang-kerja");
    expect(semua.body.ruangKerja).toHaveLength(1);
    expect(semua.body.ruangKerja[0].pemilikNama).toBe("Pengguna");

    await admin.agen.patch(`/api/v1/admin/ruang-kerja/${ruangId}`).send({ status: "aktif" });

    const bolehTulis = await pengguna.agen
      .post(`/api/v1/workspaces/${ruangId}/persons`)
      .send({ nama: "Anak", jenisKelamin: "L" });
    expect(bolehTulis.status).toBe(201);
  });

  it("mengubah perubahan pengguna biasa menjadi usulan yang diputuskan admin", async () => {
    const { app } = buatAplikasiUji();
    const admin = await daftar(app, "admin@contoh.test", "Admin");
    const pengguna = await daftar(app, "pengguna@contoh.test", "Pengguna");

    await admin.agen.patch("/api/v1/admin/pengaturan").send({ setujuiPerubahan: true });
    const ruangId = await buatRuang(pengguna.agen);

    // Ruang kerja baru tetap aktif karena persetujuan ruang kerja masih mati.
    const usulanOrang = await pengguna.agen
      .post(`/api/v1/workspaces/${ruangId}/persons`)
      .send({ nama: "Calon Orang", jenisKelamin: "P" });
    expect(usulanOrang.status).toBe(202);
    expect(usulanOrang.body.usulan.jenis).toBe("orang");
    expect(usulanOrang.body.usulan.aksi).toBe("tambah");

    const belumAda = await pengguna.agen.get(`/api/v1/workspaces/${ruangId}/persons`);
    expect(belumAda.body.orang).toHaveLength(0);

    const antrean = await admin.agen.get("/api/v1/admin/usulan?status=menunggu");
    expect(antrean.body.usulan).toHaveLength(1);
    expect(antrean.body.usulan[0].ringkasan).toContain("Calon Orang");
    expect(antrean.body.usulan[0].penggunaNama).toBe("Pengguna");
    const usulanId = antrean.body.usulan[0].id as string;

    const disetujui = await admin.agen
      .patch(`/api/v1/admin/usulan/${usulanId}`)
      .send({ status: "disetujui", catatan: "Silakan" });
    expect(disetujui.status).toBe(200);
    expect(disetujui.body.usulan.status).toBe("disetujui");

    const sudahAda = await pengguna.agen.get(`/api/v1/workspaces/${ruangId}/persons`);
    expect(sudahAda.body.orang).toHaveLength(1);
    expect(sudahAda.body.orang[0].nama).toBe("Calon Orang");

    // Usulan yang sama tidak bisa diputuskan dua kali.
    const ulang = await admin.agen
      .patch(`/api/v1/admin/usulan/${usulanId}`)
      .send({ status: "ditolak" });
    expect(ulang.status).toBe(409);

    // Usulan yang ditolak tidak mengubah data.
    const usulanKedua = await pengguna.agen
      .post(`/api/v1/workspaces/${ruangId}/persons`)
      .send({ nama: "Ditolak", jenisKelamin: "L" });
    await admin.agen
      .patch(`/api/v1/admin/usulan/${usulanKedua.body.usulan.id as string}`)
      .send({ status: "ditolak" });
    const akhir = await pengguna.agen.get(`/api/v1/workspaces/${ruangId}/persons`);
    expect(akhir.body.orang).toHaveLength(1);

    // Admin tidak otomatis bisa menyunting ruang kerja milik orang lain (404 demi privasi).
    const langsung = await admin.agen
      .post(`/api/v1/workspaces/${ruangId}/persons`)
      .send({ nama: "Dari Admin", jenisKelamin: "L" });
    expect(langsung.status).toBe(404);
    expect(langsung.body.error.kode).toBe("RUANG_TIDAK_DITEMUKAN");

    // Admin tetap menulis langsung tanpa usulan di ruang kerjanya sendiri.
    const milikSendiri = await buatRuang(admin.agen, "Ruang Admin");
    const tulisAdmin = await admin.agen
      .post(`/api/v1/workspaces/${milikSendiri}/persons`)
      .send({ nama: "Dari Admin", jenisKelamin: "L" });
    expect(tulisAdmin.status).toBe(201);
    expect(tulisAdmin.body.orang.nama).toBe("Dari Admin");
    expect(tulisAdmin.body.usulan).toBeUndefined();
  });

  it("menegakkan batas orang per ruang kerja", async () => {
    const { app } = buatAplikasiUji();
    const admin = await daftar(app, "admin@contoh.test", "Admin");
    await admin.agen.patch("/api/v1/admin/pengaturan").send({ maksOrangPerRuang: 1 });

    const ruangId = await buatRuang(admin.agen);
    await buatOrang(admin.agen, ruangId, "Pertama");

    const kedua = await admin.agen
      .post(`/api/v1/workspaces/${ruangId}/persons`)
      .send({ nama: "Kedua", jenisKelamin: "P" });
    expect(kedua.status).toBe(422);
    expect(kedua.body.error.kode).toBe("BATAS_ORANG_TERCAPAI");
  });

  it("menonaktifkan dan menghapus akun beserta datanya", async () => {
    const { app, penyimpanan } = buatAplikasiUji();
    const admin = await daftar(app, "admin@contoh.test", "Admin");
    const pengguna = await daftar(app, "pengguna@contoh.test", "Pengguna");
    const ruangId = await buatRuang(pengguna.agen);
    await buatOrang(pengguna.agen, ruangId, "Seseorang");

    await admin.agen
      .patch(`/api/v1/admin/pengguna/${pengguna.penggunaId}`)
      .send({ status: "nonaktif" });

    const sesiLama = await pengguna.agen.get("/api/v1/auth/me");
    expect(sesiLama.status).toBe(403);
    expect(sesiLama.body.error.kode).toBe("AKUN_NONAKTIF");

    const ditolakHapusDiri = await admin.agen.delete(
      `/api/v1/admin/pengguna/${(
        await admin.agen.get("/api/v1/auth/me")
      ).body.pengguna.id as string}`,
    );
    expect(ditolakHapusDiri.status).toBe(422);

    const hapus = await admin.agen.delete(`/api/v1/admin/pengguna/${pengguna.penggunaId}`);
    expect(hapus.status).toBe(204);
    expect(await penyimpanan.daftarPengguna()).toHaveLength(1);
    expect(await penyimpanan.daftarSemuaRuangKerja()).toHaveLength(0);

    const masukLagi = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "pengguna@contoh.test", sandi: SANDI_UJI });
    expect(masukLagi.status).toBe(401);
  });
});
