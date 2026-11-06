import { describe, expect, it } from "vitest";
import request from "supertest";
import { buatAplikasiUji, daftar, SANDI_UJI } from "../pembantu.js";

describe("autentikasi", () => {
  it("mendaftarkan akun baru, menerbitkan cookie HttpOnly, dan menormalkan email", async () => {
    const { app } = buatAplikasiUji();
    const respons = await request(app)
      .post("/api/v1/auth/register")
      .send({ email: "  Baru@Contoh.Test  ", nama: "Pemilik Baru", sandi: SANDI_UJI });

    expect(respons.status).toBe(201);
    expect(respons.body.pengguna.email).toBe("baru@contoh.test");
    expect(respons.body.pengguna.nama).toBe("Pemilik Baru");
    expect(respons.body.pengguna).not.toHaveProperty("sandi_hash");

    const kue = respons.headers["set-cookie"]?.[0] ?? "";
    expect(kue).toContain("nasabku_sesi=");
    expect(kue).toContain("HttpOnly");
  });

  it("menolak email yang sudah terdaftar", async () => {
    const { app } = buatAplikasiUji();
    await daftar(app, "kembar@contoh.test");
    const respons = await request(app)
      .post("/api/v1/auth/register")
      .send({ email: "kembar@contoh.test", nama: "Kembar", sandi: SANDI_UJI });

    expect(respons.status).toBe(409);
    expect(respons.body.error.kode).toBe("EMAIL_TERDAFTAR");
  });

  it("menolak masukan tidak valid", async () => {
    const { app } = buatAplikasiUji();
    const emailSalah = await request(app)
      .post("/api/v1/auth/register")
      .send({ email: "bukan-email", nama: "Uji", sandi: SANDI_UJI });
    const sandiPendek = await request(app)
      .post("/api/v1/auth/register")
      .send({ email: "ok@contoh.test", nama: "Uji", sandi: "pendek" });
    const jsonRusak = await request(app)
      .post("/api/v1/auth/register")
      .set("Content-Type", "application/json")
      .send("{bukan json");

    expect(emailSalah.status).toBe(422);
    expect(sandiPendek.status).toBe(422);
    expect(jsonRusak.status).toBe(400);
    expect(jsonRusak.body.error.kode).toBe("JSON_TIDAK_VALID");
  });

  it("melindungi /me dan mengizinkan akses dengan sesi", async () => {
    const { app } = buatAplikasiUji();
    const tanpaSesi = await request(app).get("/api/v1/auth/me");
    expect(tanpaSesi.status).toBe(401);
    expect(tanpaSesi.body.error.kode).toBe("BELUM_MASUK");

    const { agen } = await daftar(app, "sesi@contoh.test", "Pemilik Sesi");
    const denganSesi = await agen.get("/api/v1/auth/me");
    expect(denganSesi.status).toBe(200);
    expect(denganSesi.body.pengguna.email).toBe("sesi@contoh.test");
    expect(denganSesi.headers["cache-control"]).toBe("no-store");
  });

  it("masuk dengan sandi benar dan menolak sandi salah", async () => {
    const { app } = buatAplikasiUji();
    await daftar(app, "masuk@contoh.test");

    const salah = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "masuk@contoh.test", sandi: "SandiKeliru!99" });
    expect(salah.status).toBe(401);
    expect(salah.body.error.kode).toBe("KREDENSIAL_SALAH");

    const tidakTerdaftar = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "hantu@contoh.test", sandi: SANDI_UJI });
    expect(tidakTerdaftar.status).toBe(401);

    const benar = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "MASUK@contoh.test", sandi: SANDI_UJI });
    expect(benar.status).toBe(200);
    expect(benar.body.pengguna.email).toBe("masuk@contoh.test");
  });

  it("mengakhiri sesi saat keluar", async () => {
    const { app } = buatAplikasiUji();
    const { agen } = await daftar(app, "keluar@contoh.test");
    expect((await agen.get("/api/v1/auth/me")).status).toBe(200);

    const keluar = await agen.post("/api/v1/auth/logout");
    expect(keluar.status).toBe(204);
    expect(keluar.headers["set-cookie"]?.[0]).toContain("Max-Age=0");

    expect((await agen.get("/api/v1/auth/me")).status).toBe(401);
  });
});
