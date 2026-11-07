import { describe, expect, it } from "vitest";
import request from "supertest";
import { buatAplikasi } from "../../src/app.js";
import { muatKonfigurasi } from "../../src/config.js";
import { penyimpananBelumSiap } from "../../src/data/penyimpanan.js";

function aplikasiTanpaFirestore() {
  return buatAplikasi({
    penyimpanan: penyimpananBelumSiap("Firestore belum dikonfigurasi untuk uji ini."),
    konfigurasi: muatKonfigurasi({ NODE_ENV: "test" } as NodeJS.ProcessEnv),
  });
}

describe("Firestore belum dikonfigurasi", () => {
  it("tetap melayani liveness sehingga deploy tidak tertahan", async () => {
    const respons = await request(aplikasiTanpaFirestore()).get("/api/v1/health/live");
    expect(respons.status).toBe(200);
    expect(respons.body.status).toBe("hidup");
  });

  it("readiness menyatakan database belum dikonfigurasi", async () => {
    const respons = await request(aplikasiTanpaFirestore()).get("/api/v1/health/ready");
    expect(respons.status).toBe(200);
    expect(respons.body.database).toBe("belum dikonfigurasi");
    expect(respons.body.status).toBe("siap-terbatas");
  });

  it("pendaftaran dijawab 503 dengan kode yang jelas, bukan 500", async () => {
    const respons = await request(aplikasiTanpaFirestore())
      .post("/api/v1/auth/register")
      .send({ email: "harus@contoh.test", nama: "Uji", sandi: "RahasiaUji!123" });
    expect(respons.status).toBe(503);
    expect(respons.body.error.kode).toBe("FIRESTORE_BELUM_DIKONFIGURASI");
  });
});
