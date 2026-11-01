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

describe("Individu & silsilah (person CRUD)", () => {
  it("RESEARCHER membuat individu; list terurut; data historis tersimpan", async () => {
    const admin = await newSession(ctx.app, "pAdmin");
    const researcher = await newSession(ctx.app, "pRes");
    const ws = await createWorkspace(admin, "Silsilah Halim");
    await request(ctx.app)
      .post(`/api/v1/workspaces/${ws.id}/members`)
      .set("Cookie", admin.cookie)
      .send({ email: researcher.email, role: "RESEARCHER" });

    const dada = await request(ctx.app)
      .post(`/api/v1/workspaces/${ws.id}/persons`)
      .set("Cookie", researcher.cookie)
      .send({ name: "Halim bin Abdul", gender: "L", birthDate: "1331" });
    expect(dada.status).toBe(201);
    const idAyah = dada.body.data.person.id as string;

    const ibu = await request(ctx.app)
      .post(`/api/v1/workspaces/${ws.id}/persons`)
      .set("Cookie", researcher.cookie)
      .send({ name: "Nur binti Salim", gender: "P", birthDate: "1336" });
    expect(ibu.status).toBe(201);
    const idIbu = ibu.body.data.person.id as string;

    const anak = await request(ctx.app)
      .post(`/api/v1/workspaces/${ws.id}/persons`)
      .set("Cookie", researcher.cookie)
      .send({ name: "Musa bin Halim", gender: "L", fatherId: idAyah, motherId: idIbu });
    expect(anak.status).toBe(201);
    expect(anak.body.data.person.fatherId).toBe(idAyah);
    expect(anak.body.data.person.motherId).toBe(idIbu);

    const list = await request(ctx.app)
      .get(`/api/v1/workspaces/${ws.id}/persons`)
      .set("Cookie", admin.cookie);
    expect(list.status).toBe(200);
    expect(list.body.data.items).toHaveLength(3);
    const names: string[] = list.body.data.items.map(
      (p: { name: string }) => p.name,
    );
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, "id")));

    // Audit tercatat.
    const audit = await request(ctx.app)
      .get(`/api/v1/audit-events?workspaceId=${ws.id}&limit=20`)
      .set("Cookie", admin.cookie);
    const actions: string[] = audit.body.data.items.map((e: { action: string }) => e.action);
    expect(actions).toContain("person.created");
  });

  it("validasi: nama terlalu pendek 400; relasi diri-sendiri 400; target tidak ada 400", async () => {
    const admin = await newSession(ctx.app, "pVal");
    const researcher = await newSession(ctx.app, "pValR");
    const ws = await createWorkspace(admin, "Silsilah Validasi");
    await request(ctx.app)
      .post(`/api/v1/workspaces/${ws.id}/members`)
      .set("Cookie", admin.cookie)
      .send({ email: researcher.email, role: "RESEARCHER" });

    const pendek = await request(ctx.app)
      .post(`/api/v1/workspaces/${ws.id}/persons`)
      .set("Cookie", researcher.cookie)
      .send({ name: "A" });
    expect(pendek.status).toBe(400);
    expect(pendek.body.error.code).toBe("VALIDATION_ERROR");

    const selfRef = await request(ctx.app)
      .post(`/api/v1/workspaces/${ws.id}/persons`)
      .set("Cookie", researcher.cookie)
      .send({ name: "Musa Sendiri", fatherId: "TO_BE_SET_LATER" });
    expect(selfRef.status).toBe(400);
    expect(selfRef.body.error.details?.[0]?.reason).toBe("PERSON_NOT_FOUND");

    const dibuat = await request(ctx.app)
      .post(`/api/v1/workspaces/${ws.id}/persons`)
      .set("Cookie", researcher.cookie)
      .send({ name: "Musa Asli" });
    const id = dibuat.body.data.person.id as string;

    const patchSelf = await request(ctx.app)
      .patch(`/api/v1/workspaces/${ws.id}/persons/${id}`)
      .set("Cookie", researcher.cookie)
      .send({ fatherId: id });
    expect(patchSelf.status).toBe(400);
    expect(patchSelf.body.error.details?.[0]?.reason).toBe("SELF_REFERENCE");

    const kosong = await request(ctx.app)
      .patch(`/api/v1/workspaces/${ws.id}/persons/${id}`)
      .set("Cookie", researcher.cookie)
      .send({});
    expect(kosong.status).toBe(400);
  });

  it("siklus silsilah ditolak 400 (ayah-ibu tidak boleh kembali ke titik asal)", async () => {
    const admin = await newSession(ctx.app, "pCyc");
    const researcher = await newSession(ctx.app, "pCycR");
    const ws = await createWorkspace(admin, "Silsilah Siklus");
    await request(ctx.app)
      .post(`/api/v1/workspaces/${ws.id}/members`)
      .set("Cookie", admin.cookie)
      .send({ email: researcher.email, role: "RESEARCHER" });

    const a = await request(ctx.app)
      .post(`/api/v1/workspaces/${ws.id}/persons`)
      .set("Cookie", researcher.cookie)
      .send({ name: "Tokoh A" });
    const idA = a.body.data.person.id as string;
    const b = await request(ctx.app)
      .post(`/api/v1/workspaces/${ws.id}/persons`)
      .set("Cookie", researcher.cookie)
      .send({ name: "Tokoh B", fatherId: idA });
    const idB = b.body.data.person.id as string;

    // A menjadi anak B → B kakek-nenek dirinya sendiri melalui rantai.
    const cycle = await request(ctx.app)
      .patch(`/api/v1/workspaces/${ws.id}/persons/${idA}`)
      .set("Cookie", researcher.cookie)
      .send({ fatherId: idB });
    expect(cycle.status).toBe(400);
    expect(cycle.body.error.details?.[0]?.reason).toBe("CYCLE");
  });

  it("isolasi & RBAC: SUBMITTER hanya baca (403 menulis); non-anggota 404", async () => {
    const admin = await newSession(ctx.app, "pRbac");
    const submitter = await newSession(ctx.app, "pSub");
    const outsider = await newSession(ctx.app, "pOut");
    const ws = await createWorkspace(admin, "Silsilah RBAC");
    await request(ctx.app)
      .post(`/api/v1/workspaces/${ws.id}/members`)
      .set("Cookie", admin.cookie)
      .send({ email: submitter.email, role: "SUBMITTER" });

    const read = await request(ctx.app)
      .get(`/api/v1/workspaces/${ws.id}/persons`)
      .set("Cookie", submitter.cookie);
    expect(read.status).toBe(200);

    const writeDenied = await request(ctx.app)
      .post(`/api/v1/workspaces/${ws.id}/persons`)
      .set("Cookie", submitter.cookie)
      .send({ name: "Tidak berhak" });
    expect(writeDenied.status).toBe(403);
    expect(writeDenied.body.error.code).toBe("FORBIDDEN");

    const outRead = await request(ctx.app)
      .get(`/api/v1/workspaces/${ws.id}/persons`)
      .set("Cookie", outsider.cookie);
    expect(outRead.status).toBe(404);
  });

  it("hapus lunak: status DELETED; relasi anak dibersihkan; list tidak memuatnya lagi", async () => {
    const admin = await newSession(ctx.app, "pDel");
    const researcher = await newSession(ctx.app, "pDelR");
    const ws = await createWorkspace(admin, "Silsilah Hapus");
    await request(ctx.app)
      .post(`/api/v1/workspaces/${ws.id}/members`)
      .set("Cookie", admin.cookie)
      .send({ email: researcher.email, role: "RESEARCHER" });

    const ayah = await request(ctx.app)
      .post(`/api/v1/workspaces/${ws.id}/persons`)
      .set("Cookie", researcher.cookie)
      .send({ name: "Ayah Dihapus" });
    const idAyah = ayah.body.data.person.id as string;
    const anak = await request(ctx.app)
      .post(`/api/v1/workspaces/${ws.id}/persons`)
      .set("Cookie", researcher.cookie)
      .send({ name: "Anak Tinggal", fatherId: idAyah });
    const idAnak = anak.body.data.person.id as string;

    const del = await request(ctx.app)
      .delete(`/api/v1/workspaces/${ws.id}/persons/${idAyah}`)
      .set("Cookie", researcher.cookie);
    expect(del.status).toBe(200);
    expect(del.body.data.deleted).toBe(true);

    const list = await request(ctx.app)
      .get(`/api/v1/workspaces/${ws.id}/persons`)
      .set("Cookie", researcher.cookie);
    const items = list.body.data.items as Array<{ id: string; fatherId: string | null }>;
    expect(items.map((p) => p.id)).not.toContain(idAyah);
    const anakSetelah = items.find((p) => p.id === idAnak);
    expect(anakSetelah?.fatherId).toBeNull();

    const audit = await request(ctx.app)
      .get(`/api/v1/audit-events?workspaceId=${ws.id}&limit=30`)
      .set("Cookie", admin.cookie);
    const actions: string[] = audit.body.data.items.map((e: { action: string }) => e.action);
    expect(actions).toContain("person.deleted");
  });
});
