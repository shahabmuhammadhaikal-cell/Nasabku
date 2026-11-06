import { describe, expect, it } from "vitest";
import request from "supertest";
import { buatAplikasiUji, buatRuang, daftar } from "../pembantu.js";

describe("ruang kerja", () => {
  it("mewajibkan sesi", async () => {
    const { app } = buatAplikasiUji();
    expect((await request(app).get("/api/v1/workspaces")).status).toBe(401);
    expect((await request(app).post("/api/v1/workspaces").send({ nama: "X" })).status).toBe(401);
  });

  it("membuat dan menampilkan daftar ruang kerja milik pengguna", async () => {
    const { app } = buatAplikasiUji();
    const { agen } = await daftar(app);

    const id = await buatRuang(agen, "Marga Siregar");
    const daftarRuang = await agen.get("/api/v1/workspaces");

    expect(daftarRuang.status).toBe(200);
    expect(daftarRuang.body.ruangKerja).toHaveLength(1);
    expect(daftarRuang.body.ruangKerja[0].nama).toBe("Marga Siregar");

    const satu = await agen.get(`/api/v1/workspaces/${id}`);
    expect(satu.status).toBe(200);
    expect(satu.body.ruangKerja.id).toBe(id);
  });

  it("menolak nama ruang kerja terlalu pendek", async () => {
    const { app } = buatAplikasiUji();
    const { agen } = await daftar(app);
    const respons = await agen.post("/api/v1/workspaces").send({ nama: "A" });
    expect(respons.status).toBe(422);
  });

  it("tidak membocorkan ruang kerja milik pengguna lain", async () => {
    const { app } = buatAplikasiUji();
    const pemilik = await daftar(app, "pemilik@contoh.test");
    const penyusup = await daftar(app, "penyusup@contoh.test");
    const id = await buatRuang(pemilik.agen, "Rahasia");

    expect((await penyusup.agen.get(`/api/v1/workspaces/${id}`)).status).toBe(404);
    expect((await penyusup.agen.get(`/api/v1/workspaces/${id}/persons`)).status).toBe(404);
    expect((await penyusup.agen.delete(`/api/v1/workspaces/${id}`)).status).toBe(404);

    const milikPenyusup = await penyusup.agen.get("/api/v1/workspaces");
    expect(milikPenyusup.body.ruangKerja).toHaveLength(0);
  });

  it("menghapus ruang kerja beserta isinya", async () => {
    const { app, konfigurasi } = buatAplikasiUji();
    void konfigurasi;
    const { agen } = await daftar(app);
    const id = await buatRuang(agen);
    await agen.post(`/api/v1/workspaces/${id}/persons`).send({ nama: "Budi" });

    expect((await agen.delete(`/api/v1/workspaces/${id}`)).status).toBe(204);
    expect((await agen.get("/api/v1/workspaces")).body.ruangKerja).toHaveLength(0);
    expect((await agen.get(`/api/v1/workspaces/${id}/persons`)).status).toBe(404);
  });
});
