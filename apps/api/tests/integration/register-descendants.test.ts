import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, newSession, type TestApp, type TestUser } from "./helpers";

let ctx: TestApp;

beforeAll(() => {
  ctx = buildTestApp({ RATE_LIMIT_AUTH_MAX: "100000" });
});

async function createWorkspace(user: TestUser, name: string): Promise<{ id: string }> {
  const res = await request(ctx.app)
    .post("/api/v1/workspaces")
    .set("Cookie", user.cookie)
    .send({ name });
  expect(res.status).toBe(201);
  return res.body.data.workspace;
}

async function buatPerson(user: TestUser, wsId: string, body: Record<string, unknown>) {
  const res = await request(ctx.app)
    .post(`/api/v1/workspaces/${wsId}/persons`)
    .set("Cookie", user.cookie)
    .send(body);
  expect(res.status).toBe(201);
  return res.body.data.person;
}

describe("Pendaftaran langsung via backend (POST /auth/register)", () => {
  it("201: akun dibuat + sesi cookie diterbitkan; /auth/me dikenali", async () => {
    const email = `reg-be-${Date.now()}-a@contoh.test`;
    const res = await request(ctx.app)
      .post("/api/v1/auth/register")
      .send({ email, password: "Rahasia!12345" });
    expect(res.status).toBe(201);
    expect(res.body.data.user.email).toBe(email.toLowerCase());
    const setCookie = res.headers["set-cookie"];
    expect(setCookie).toBeTruthy();

    const me = await request(ctx.app)
      .get("/api/v1/auth/me")
      .set("Cookie", setCookie);
    expect(me.status).toBe(200);
    expect(me.body.data.user.email).toBe(email.toLowerCase());

    // Riwayat audit sengaja terbatas per workspace: tanpa workspaceId → 400.
    const audit = await request(ctx.app)
      .get("/api/v1/audit-events?limit=15")
      .set("Cookie", setCookie);
    expect(audit.status).toBe(400);
  });

  it("409: email sudah terpakai; 400: sandi terlalu pendek atau email tak sah", async () => {
    const email = `reg-be-${Date.now()}-b@contoh.test`;
    const pertama = await request(ctx.app)
      .post("/api/v1/auth/register")
      .send({ email, password: "Rahasia!12345" });
    expect(pertama.status).toBe(201);

    const bentrok = await request(ctx.app)
      .post("/api/v1/auth/register")
      .send({ email, password: "Rahasia!12345" });
    expect(bentrok.status).toBe(409);
    expect(bentrok.body.error.code).toBe("CONFLICT");

    const pendek = await request(ctx.app)
      .post("/api/v1/auth/register")
      .send({ email: `reg-be-${Date.now()}-c@contoh.test`, password: "ab12" });
    expect(pendek.status).toBe(400);
    expect(pendek.body.error.code).toBe("VALIDATION_ERROR");

    const emailSalah = await request(ctx.app)
      .post("/api/v1/auth/register")
      .send({ email: "bukan-email", password: "Rahasia!12345" });
    expect(emailSalah.status).toBe(400);
  });
});

describe("Tracer: keturunan (descendants)", () => {
  it("descendants: kakek → anak dan ambang cucu terbaca berlapis; 404 saat pangkal hilang", async () => {
    const admin = await newSession(ctx.app, "desAdmin");
    const res = await newSession(ctx.app, "desRes");
    const ws = await createWorkspace(admin, "Silsilah Keturunan");
    await request(ctx.app)
      .post(`/api/v1/workspaces/${ws.id}/members`)
      .set("Cookie", admin.cookie)
      .send({ email: res.email, role: "RESEARCHER" });

    const kakek = await buatPerson(res, ws.id, { name: "Kakek Turunan", gender: "L" });
    const anak = await buatPerson(res, ws.id, { name: "Anak Turunan", fatherId: kakek.id });
    const ibu = await buatPerson(res, ws.id, { name: "Ibu Turunan", spouseId: anak.id });
    const cucu = await buatPerson(res, ws.id, {
      name: "Cucu Turunan",
      fatherId: anak.id,
      motherId: ibu.id,
    });

    const hasil = await request(ctx.app)
      .get(`/api/v1/workspaces/${ws.id}/persons/${kakek.id}/descendants`)
      .set("Cookie", admin.cookie);
    expect(hasil.status).toBe(200);
    const items = hasil.body.data.items as Array<{
      person: { id: string };
      depth: number;
      via: string;
    }>;
    expect(items.find((i) => i.person.id === anak.id)?.depth).toBe(1);
    expect(items.find((i) => i.person.id === cucu.id)?.depth).toBe(2);

    const hilang = await request(ctx.app)
      .get(`/api/v1/workspaces/${ws.id}/persons/TIDAK_ADA_OK/descendants`)
      .set("Cookie", admin.cookie);
    expect(hilang.status).toBe(404);
  });
});
