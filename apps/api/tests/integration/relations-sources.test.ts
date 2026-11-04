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

async function anggotakan(admin: TestUser, workspaceId: string, user: TestUser, role: string) {
  await request(ctx.app)
    .post(`/api/v1/workspaces/${workspaceId}/members`)
    .set("Cookie", admin.cookie)
    .send({ email: user.email, role });
}

async function buatPerson(
  user: TestUser,
  wsId: string,
  body: Record<string, unknown>,
): Promise<{ id: string; name: string }> {
  const res = await request(ctx.app)
    .post(`/api/v1/workspaces/${wsId}/persons`)
    .set("Cookie", user.cookie)
    .send(body);
  expect(res.status).toBe(201);
  return res.body.data.person;
}

describe("Garis leluhur, jalur hubungan, sumber/bukti", () => {
  it("ancestors: kakek→ortu→anak terbaca berlapis via ayah", async () => {
    const admin = await newSession(ctx.app, "relAnc");
    const res = await newSession(ctx.app, "relAncR");
    const ws = await createWorkspace(admin, "Silsilah Leluhur");
    await anggotakan(admin, ws.id, res, "RESEARCHER");

    const kakek = await buatPerson(res, ws.id, { name: "Kakek Ibrahim", gender: "L" });
    const ayah = await buatPerson(res, ws.id, {
      name: "Ayah Musa",
      gender: "L",
      fatherId: kakek.id,
    });
    const anak = await buatPerson(res, ws.id, {
      name: "Anak Harun",
      gender: "L",
      fatherId: ayah.id,
    });

    const list = await request(ctx.app)
      .get(`/api/v1/workspaces/${ws.id}/persons/${anak.id}/ancestors`)
      .set("Cookie", admin.cookie);
    expect(list.status).toBe(200);
    const items = list.body.data.items as Array<{
      person: { id: string };
      depth: number;
      via: string;
    }>;
    const dptKakek = items.find((i) => i.person.id === kakek.id);
    const dptAyah = items.find((i) => i.person.id === ayah.id);
    expect(dptAyah).toBeDefined();
    expect(dptAyah?.depth).toBe(1);
    expect(dptAyah?.via).toBe("ayah");
    expect(dptKakek).toBeDefined();
    expect(dptKakek?.depth).toBe(2);
  });

  it("relations: anak-ayah terhubung 1 langkah; asing terputus; pasangan terhubung", async () => {
    const admin = await newSession(ctx.app, "relRel");
    const res = await newSession(ctx.app, "relRelR");
    const ws = await createWorkspace(admin, "Silsilah Hubungan");
    await anggotakan(admin, ws.id, res, "RESEARCHER");

    const ayah = await buatPerson(res, ws.id, { name: "Buya Hamka", gender: "L" });
    const anak = await buatPerson(res, ws.id, { name: "Anak Hamka", fatherId: ayah.id });
    const pasangan = await buatPerson(res, ws.id, {
      name: "Istri Hamka",
      gender: "P",
      spouseId: ayah.id,
    });
    const asing = await buatPerson(res, ws.id, { name: "Tokoh Lain" });

    const dekat = await request(ctx.app)
      .get(`/api/v1/workspaces/${ws.id}/person-relations?a=${anak.id}&b=${ayah.id}`)
      .set("Cookie", admin.cookie);
    expect(dekat.status).toBe(200);
    expect(dekat.body.data.relation.connected).toBe(true);
    expect(dekat.body.data.relation.gapGenerations).toBe(1);

    const denganPasangan = await request(ctx.app)
      .get(`/api/v1/workspaces/${ws.id}/person-relations?a=${ayah.id}&b=${pasangan.id}`)
      .set("Cookie", admin.cookie);
    expect(denganPasangan.body.data.relation.connected).toBe(true);

    const terputus = await request(ctx.app)
      .get(`/api/v1/workspaces/${ws.id}/person-relations?a=${anak.id}&b=${asing.id}`)
      .set("Cookie", admin.cookie);
    expect(terputus.status).toBe(200);
    expect(terputus.body.data.relation.connected).toBe(false);

    const tidakValid = await request(ctx.app)
      .get(`/api/v1/workspaces/${ws.id}/person-relations?a=x&b=${anak.id}`)
      .set("Cookie", admin.cookie);
    expect(tidakValid.status).toBe(400);
  });

  it("sumber: RESEARCHER tambah; list berurut; audit source_added; hapus; list kosong", async () => {
    const admin = await newSession(ctx.app, "srcDel");
    const res = await newSession(ctx.app, "srcDelR");
    const ws = await createWorkspace(admin, "Silsilah Sumber");
    await anggotakan(admin, ws.id, res, "RESEARCHER");
    const orang = await buatPerson(res, ws.id, { name: "Tokoh Bersumber" });

    const buat = await request(ctx.app)
      .post(`/api/v1/workspaces/${ws.id}/persons/${orang.id}/sources`)
      .set("Cookie", res.cookie)
      .send({ kind: "KITAB_SILSILAH", title: "Kitab Silsilah Keluarga", ref: "https://contoh.id/k1", notes: "Hal 12" });
    expect(buat.status).toBe(201);
    const sourceId = buat.body.data.source.id as string;

    const buat2 = await request(ctx.app)
      .post(`/api/v1/workspaces/${ws.id}/persons/${orang.id}/sources`)
      .set("Cookie", res.cookie)
      .send({ kind: "WAWANCARA", title: "Wawancara tetua RT 02" });
    expect(buat2.status).toBe(201);

    const list = await request(ctx.app)
      .get(`/api/v1/workspaces/${ws.id}/persons/${orang.id}/sources`)
      .set("Cookie", admin.cookie);
    expect(list.status).toBe(200);
    expect(list.body.data.items).toHaveLength(2);
    const kinds: string[] = list.body.data.items.map((x: { kind: string }) => x.kind);
    expect(kinds).toContain("KITAB_SILSILAH");
    expect(kinds).toContain("WAWANCARA");

    const audit = await request(ctx.app)
      .get(`/api/v1/audit-events?workspaceId=${ws.id}&limit=30`)
      .set("Cookie", admin.cookie);
    const actions: string[] = audit.body.data.items.map((e: { action: string }) => e.action);
    expect(actions).toContain("person.source_added");

    const hapus = await request(ctx.app)
      .delete(`/api/v1/workspaces/${ws.id}/persons/${orang.id}/sources/${sourceId}`)
      .set("Cookie", res.cookie);
    expect(hapus.status).toBe(200);

    const list2 = await request(ctx.app)
      .get(`/api/v1/workspaces/${ws.id}/persons/${orang.id}/sources`)
      .set("Cookie", admin.cookie);
    expect(list2.body.data.items).toHaveLength(1);
  });

  it("sources tidak ada 404; kind tak resmi 400; RBAC: SUBMITTER baca 200 tulis 403", async () => {
    const admin = await newSession(ctx.app, "srcRb");
    const sub = await newSession(ctx.app, "srcRbS");
    const ws = await createWorkspace(admin, "Silsilah Sumber RBAC");
    await anggotakan(admin, ws.id, sub, "SUBMITTER");
    const res = await newSession(ctx.app, "srcRbR");
    await anggotakan(admin, ws.id, res, "RESEARCHER");
    const orang = await buatPerson(res, ws.id, { name: "Tokoh RBAC Sumber" });

    const baca = await request(ctx.app)
      .get(`/api/v1/workspaces/${ws.id}/persons/${orang.id}/sources`)
      .set("Cookie", sub.cookie);
    expect(baca.status).toBe(200);

    const tulis = await request(ctx.app)
      .post(`/api/v1/workspaces/${ws.id}/persons/${orang.id}/sources`)
      .set("Cookie", sub.cookie)
      .send({ kind: "KTP", title: "e-KTP tokoh" });
    expect(tulis.status).toBe(403);
    expect(tulis.body.error.code).toBe("FORBIDDEN");

    const kindSalah = await request(ctx.app)
      .post(`/api/v1/workspaces/${ws.id}/persons/${orang.id}/sources`)
      .set("Cookie", res.cookie)
      .send({ kind: "PIAGAM_APA_SAJA", title: "Judul apa adanya" });
    expect(kindSalah.status).toBe(400);

    const hilang = await request(ctx.app)
      .get(`/api/v1/workspaces/${ws.id}/persons/TIDAK_ADAONG/sources`)
      .set("Cookie", admin.cookie);
    expect(hilang.status).toBe(404);
  });
});
