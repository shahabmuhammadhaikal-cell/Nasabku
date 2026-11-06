import { describe, expect, it } from "vitest";
import request from "supertest";
import { buatAplikasiUji } from "../pembantu.js";

describe("kesehatan & berkas statis", () => {
  it("liveness selalu 200 tanpa menyentuh basis data", async () => {
    const { app } = buatAplikasiUji();
    const respons = await request(app).get("/api/v1/health/live");
    expect(respons.status).toBe(200);
    expect(respons.body.status).toBe("hidup");
    expect(respons.body.versi).toBeTruthy();
  });

  it("readiness menyatakan status basis data", async () => {
    const { app } = buatAplikasiUji();
    const respons = await request(app).get("/api/v1/health/ready");
    expect(respons.status).toBe(200);
    expect(respons.body.database).toBe("tersedia");
    expect(respons.body.status).toBe("siap");
  });

  it("menyajikan halaman aplikasi dan berkas pendukung", async () => {
    const { app } = buatAplikasiUji();
    const halaman = await request(app).get("/");
    expect(halaman.status).toBe(200);
    expect(halaman.text).toContain("Nasabku");

    const skrip = await request(app).get("/app.js");
    expect(skrip.status).toBe(200);
    expect(skrip.text).toContain("api");

    const gaya = await request(app).get("/styles.css");
    expect(gaya.status).toBe(200);
    expect(gaya.text).toContain("--hijau");
  });

  it("memberi 404 JSON untuk rute API yang tidak dikenal", async () => {
    const { app } = buatAplikasiUji();
    const respons = await request(app).get("/api/v1/tidak-ada");
    expect(respons.status).toBe(404);
    expect(respons.body.error.kode).toBe("RUTE_TIDAK_DITEMUKAN");
  });
});
