import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { newSession, signUpUser } from "./helpers";
import { buildTestApp, type TestApp } from "./helpers";

let ctx: TestApp;

beforeAll(() => {
  ctx = buildTestApp();
});

describe("Autentikasi (Emulator Suite)", () => {
  it("login: idToken valid → cookie HttpOnly SameSite=Lax + data pengguna", async () => {
    const email = `login_ok_${Date.now()}@nasabku.test`;
    const { idToken } = await signUpUser(email);
    const res = await request(ctx.app).post("/api/v1/auth/login").send({ idToken });

    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe(email.toLowerCase());
    expect(res.body.data.user.uid).toBeTruthy();
    expect(Array.isArray(res.body.data.memberships)).toBe(true);

    const raw = (res.headers["set-cookie"] as unknown as string[])[0] ?? "";
    expect(raw).toContain("HttpOnly");
    expect(raw).toContain("SameSite=Lax");
    expect(raw).toContain("Path=/");
    // Token sesi tidak pernah muncul di body respons.
    expect(JSON.stringify(res.body)).not.toContain("nasabku_session=");
  });

  it("GET /auth/me dengan cookie → sesi valid; tanpa cookie → 401", async () => {
    const user = await newSession(ctx.app, "me");
    const me = await request(ctx.app).get("/api/v1/auth/me").set("Cookie", user.cookie);
    expect(me.status).toBe(200);
    expect(me.body.data.user.uid).toBe(user.uid);

    const anon = await request(ctx.app).get("/api/v1/auth/me");
    expect(anon.status).toBe(401);
    expect(anon.body.error.code).toBe("UNAUTHENTICATED");
    expect(anon.body.error.requestId).toBeTruthy();
  });

  it("logout menghapus sesi secara otoritatif", async () => {
    const user = await newSession(ctx.app, "logout");
    const before = await request(ctx.app).get("/api/v1/auth/me").set("Cookie", user.cookie);
    expect(before.status).toBe(200);

    const out = await request(ctx.app).post("/api/v1/auth/logout").set("Cookie", user.cookie);
    expect(out.status).toBe(200);

    const after = await request(ctx.app).get("/api/v1/auth/me").set("Cookie", user.cookie);
    expect(after.status).toBe(401);

    // Cookie palsu/asing ditolak sebagai anonim, bukan error 500.
    const fake = await request(ctx.app)
      .get("/api/v1/auth/me")
      .set("Cookie", "nasabku_session=penghunipalsubukanisinyata");
    expect(fake.status).toBe(401);
  });

  it("idToken sampah → 401 + audit login gagal tercatat", async () => {
    const res = await request(ctx.app)
      .post("/api/v1/auth/login")
      .send({ idToken: "ini-bukan-token-yang-sah-banget" });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");

    const audits = await ctx.db
      .collection("auditEvents")
      .where("action", "==", "user.login_failed")
      .limit(5)
      .get();
    expect(audits.size).toBeGreaterThan(0);
    expect(audits.docs[0]?.data().outcome).toBe("failure");
  });

  it("body login bukan JSON → 400 VALIDATION_ERROR", async () => {
    const res = await request(ctx.app)
      .post("/api/v1/auth/login")
      .set("Content-Type", "application/json")
      .send("{rusak");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.details?.[0]?.reason).toBe("INVALID_JSON");
  });

  it("endpoint /workspaces menolak anonim (401)", async () => {
    const res = await request(ctx.app).get("/api/v1/workspaces");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });
});

describe("Penjaga asal (anti-CSRF) & rate limit", () => {
  it("metode tulis dengan Origin asing ditolak 403 — meski dengan cookie sah", async () => {
    const app2 = buildTestApp().app;
    const user = await newSession(app2, "csrf");
    const res = await request(app2)
      .post("/api/v1/workspaces")
      .set("Cookie", user.cookie)
      .set("Origin", "https://contoh-jahat.example")
      .send({ name: "Ruang CSRF" });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("Origin dari allowlist diterima", async () => {
    const app2 = buildTestApp().app;
    const user = await newSession(app2, "csrfok");
    const res = await request(app2)
      .post("/api/v1/workspaces")
      .set("Cookie", user.cookie)
      .set("Origin", "http://localhost:3000")
      .send({ name: "Ruang Sah" });
    expect(res.status).toBe(201);
  });

  it("preflight OPTIONS dijawab 204", async () => {
    const res = await request(ctx.app)
      .options("/api/v1/workspaces")
      .set("Origin", "http://localhost:3000");
    expect(res.status).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:3000");
    expect(res.headers["access-control-allow-credentials"]).toBe("true");
  });

  it("login dibatasi: percobaan ke-N gagal dengan 429 + Retry-After", async () => {
    const tight = buildTestApp({ RATE_LIMIT_AUTH_MAX: "3" }).app;
    let last: request.Response | undefined;
    for (let i = 0; i < 4; i++) {
      last = await request(tight)
        .post("/api/v1/auth/login")
        .send({ idToken: "token-tidak-sah-yang-panjang-banget" });
    }
    expect(last?.status).toBe(429);
    expect(last?.body.error.code).toBe("RATE_LIMITED");
    expect(Number(last?.headers["retry-after"])).toBeGreaterThan(0);
  });
});
