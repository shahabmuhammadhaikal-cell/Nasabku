import { changeMember } from "../../src/services/workspace";
import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, newSession, type TestApp, type TestUser } from "./helpers";

let ctx: TestApp;

beforeAll(() => {
  // Banyak login dalam satu berkas tes — longgarkan limit autentikasi
  // (uji limit 429 sendiri berada di auth.test.ts dengan app terpisah).
  ctx = buildTestApp({ RATE_LIMIT_AUTH_MAX: "100000" });
});

async function createWorkspace(user: TestUser, name: string): Promise<{ id: string; slug: string }> {
  const res = await request(ctx.app)
    .post("/api/v1/workspaces")
    .set("Cookie", user.cookie)
    .send({ name });
  expect(res.status).toBe(201);
  return res.body.data.workspace;
}

describe("Workspace & anggota (Emulator Suite)", () => {
  it("pembuatan workspace atomik: slug turun dari nama, duplikat → 409", async () => {
    const admin = await newSession(ctx.app, "wsadmin");
    const ws = await createWorkspace(admin, "Arsip Nasab Demo");
    expect(ws.slug).toBe("arsip-nasab-demo");

    const dup = await request(ctx.app)
      .post("/api/v1/workspaces")
      .set("Cookie", admin.cookie)
      .send({ name: "Arsip Nasab Demo" });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe("CONFLICT");
    expect(dup.body.error.details?.[0]?.reason).toBe("ALREADY_EXISTS");
  });

  it("validasi gagal → 400 VALIDATION_ERROR dengan field & requestId", async () => {
    const admin = await newSession(ctx.app, "wvalid");
    const res = await request(ctx.app)
      .post("/api/v1/workspaces")
      .set("Cookie", admin.cookie)
      .send({ name: "ab" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.details).toContainEqual(
      expect.objectContaining({ field: "name", reason: expect.any(String) }),
    );
    expect(res.body.error.requestId).toBe(res.headers["x-request-id"]);
  });

  it("GET /workspaces hanya memuat workspace milik sendiri", async () => {
    const a = await newSession(ctx.app, "ownA");
    const b = await newSession(ctx.app, "ownB");
    await createWorkspace(a, "Ruang A Khusus");
    const res = await request(ctx.app).get("/api/v1/workspaces").set("Cookie", b.cookie);
    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(0);
  });

  it("isolasi: non-anggota menerima 404 (keberadaan workspace tidak bocor)", async () => {
    const admin = await newSession(ctx.app, "isoA");
    const outsider = await newSession(ctx.app, "isoB");
    const ws = await createWorkspace(admin, "Ruang Isolasi");

    const read = await request(ctx.app)
      .get(`/api/v1/workspaces/${ws.id}`)
      .set("Cookie", outsider.cookie);
    expect(read.status).toBe(404);
    expect(read.body.error.code).toBe("NOT_FOUND");

    const write = await request(ctx.app)
      .patch(`/api/v1/workspaces/${ws.id}`)
      .set("Cookie", outsider.cookie)
      .send({ name: "Dicolong" });
    expect(write.status).toBe(404);

    const members = await request(ctx.app)
      .get(`/api/v1/workspaces/${ws.id}/members`)
      .set("Cookie", outsider.cookie);
    expect(members.status).toBe(404);
  });

  it("RBAC: AUDITOR boleh membaca tapi tidak mengubah; tanpa izin → 403", async () => {
    const admin = await newSession(ctx.app, "rbacA");
    const auditorUser = await newSession(ctx.app, "rbacAud");
    const ws = await createWorkspace(admin, "Ruang RBAC Auditor");

    const invite = await request(ctx.app)
      .post(`/api/v1/workspaces/${ws.id}/members`)
      .set("Cookie", admin.cookie)
      .send({ email: auditorUser.email, role: "AUDITOR" });
    expect(invite.status).toBe(201);
    expect(invite.body.data.member.role).toBe("AUDITOR");
    expect(invite.body.data.member.email).toBe(auditorUser.email.toLowerCase());

    const readWs = await request(ctx.app)
      .get(`/api/v1/workspaces/${ws.id}`)
      .set("Cookie", auditorUser.cookie);
    expect(readWs.status).toBe(200);
    expect(readWs.body.data.workspace.role).toBe("AUDITOR");

    const readMembers = await request(ctx.app)
      .get(`/api/v1/workspaces/${ws.id}/members`)
      .set("Cookie", auditorUser.cookie);
    expect(readMembers.status).toBe(200);
    expect(readMembers.body.data.items.length).toBeGreaterThan(0);

    const updateWs = await request(ctx.app)
      .patch(`/api/v1/workspaces/${ws.id}`)
      .set("Cookie", auditorUser.cookie)
      .send({ name: "Dihack" });
    expect(updateWs.status).toBe(403);
    expect(updateWs.body.error.code).toBe("FORBIDDEN");

    const addMember = await request(ctx.app)
      .post(`/api/v1/workspaces/${ws.id}/members`)
      .set("Cookie", auditorUser.cookie)
      .send({ email: "target@nasabku.test", role: "SUBMITTER" });
    expect(addMember.status).toBe(403);

    const patchMember = await request(ctx.app)
      .patch(`/api/v1/workspaces/${ws.id}/members/${admin.uid}`)
      .set("Cookie", auditorUser.cookie)
      .send({ role: "AUDITOR" });
    expect(patchMember.status).toBe(403);

    const removeMember = await request(ctx.app)
      .delete(`/api/v1/workspaces/${ws.id}/members/${admin.uid}`)
      .set("Cookie", auditorUser.cookie);
    expect(removeMember.status).toBe(403);
  });

  it("AUDITOR membaca audit; SUBMITTER ditolak 403", async () => {
    const admin = await newSession(ctx.app, "audA");
    const auditorUser = await newSession(ctx.app, "audN");
    const submitter = await newSession(ctx.app, "audS");
    const ws = await createWorkspace(admin, "Ruang Audit");

    await request(ctx.app)
      .post(`/api/v1/workspaces/${ws.id}/members`)
      .set("Cookie", admin.cookie)
      .send({ email: auditorUser.email, role: "AUDITOR" });
    await request(ctx.app)
      .post(`/api/v1/workspaces/${ws.id}/members`)
      .set("Cookie", admin.cookie)
      .send({ email: submitter.email, role: "SUBMITTER" });

    const allowed = await request(ctx.app)
      .get(`/api/v1/audit-events?workspaceId=${ws.id}`)
      .set("Cookie", auditorUser.cookie);
    expect(allowed.status).toBe(200);
    const actions = allowed.body.data.items.map((i: { action: string }) => i.action);
    expect(actions).toContain("workspace.created");
    expect(actions).toContain("member.added");

    const denied = await request(ctx.app)
      .get(`/api/v1/audit-events?workspaceId=${ws.id}`)
      .set("Cookie", submitter.cookie);
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe("FORBIDDEN");
  });

  it("setiap peristiwa audit membawa requestId aktor + tanpa metadata rahasia", async () => {
    const admin = await newSession(ctx.app, "metaA");
    const ws = await createWorkspace(admin, "Ruang Metadata");
    const reqId = `trace_${Math.random().toString(36).slice(2, 12)}`;
    await request(ctx.app)
      .post(`/api/v1/workspaces/${ws.id}/members`)
      .set("Cookie", admin.cookie)
      .set("X-Request-Id", reqId)
      .send({ email: "belumada@nasabku.test", role: "SUBMITTER" }); // 404 — tak masalah

    const res = await request(ctx.app)
      .get(`/api/v1/audit-events?workspaceId=${ws.id}`)
      .set("Cookie", admin.cookie);
    expect(res.status).toBe(200);
    const events = res.body.data.items as Array<{ action: string; requestId: string; metadata: unknown }>;
    const created = events.find((e) => e.action === "workspace.created");
    expect(created?.requestId).toBeTruthy();
    const serialized = JSON.stringify(events).toLowerCase();
    expect(serialized).not.toContain("password");
    expect(serialized).not.toContain("token");
  });

  it("menambah anggota: email tidak terdaftar → 404; ganda → 409; diri sendiri ditolak saat diubah", async () => {
    const admin = await newSession(ctx.app, "memA");
    const member = await newSession(ctx.app, "memB");
    const ws = await createWorkspace(admin, "Ruang Keanggotaan");

    const unknown = await request(ctx.app)
      .post(`/api/v1/workspaces/${ws.id}/members`)
      .set("Cookie", admin.cookie)
      .send({ email: "tidak-ada@nasabku.test", role: "SUBMITTER" });
    expect(unknown.status).toBe(404);

    const first = await request(ctx.app)
      .post(`/api/v1/workspaces/${ws.id}/members`)
      .set("Cookie", admin.cookie)
      .send({ email: member.email.toUpperCase(), role: "SUBMITTER" });
    expect(first.status).toBe(201);

    const second = await request(ctx.app)
      .post(`/api/v1/workspaces/${ws.id}/members`)
      .set("Cookie", admin.cookie)
      .send({ email: member.email, role: "REVIEWER" });
    expect(second.status).toBe(409);
    expect(second.body.error.details?.[0]?.reason).toBe("ALREADY_MEMBER");

    // Pemisahan tugas: admin tidak bisa mengubah keanggotaannya sendiri.
    const selfPatch = await request(ctx.app)
      .patch(`/api/v1/workspaces/${ws.id}/members/${admin.uid}`)
      .set("Cookie", admin.cookie)
      .send({ role: "REVIEWER" });
    expect(selfPatch.status).toBe(403);

    const patch = await request(ctx.app)
      .patch(`/api/v1/workspaces/${ws.id}/members/${member.uid}`)
      .set("Cookie", admin.cookie)
      .send({ role: "REVIEWER" });
    expect(patch.status).toBe(200);
    expect(patch.body.data.member.role).toBe("REVIEWER");

    // Pencabutan = soft-revoke; akses langsung hilang.
    const revoke = await request(ctx.app)
      .delete(`/api/v1/workspaces/${ws.id}/members/${member.uid}`)
      .set("Cookie", admin.cookie);
    expect(revoke.status).toBe(200);
    expect(revoke.body.data.member.status).toBe("REVOKED");

    const after = await request(ctx.app)
      .get(`/api/v1/workspaces/${ws.id}`)
      .set("Cookie", member.cookie);
    expect(after.status).toBe(404);

    const audits = await request(ctx.app)
      .get(`/api/v1/audit-events?workspaceId=${ws.id}&limit=50`)
      .set("Cookie", admin.cookie);
    const actions = audits.body.data.items.map((i: { action: string }) => i.action);
    expect(actions).toContain("member.updated");
    expect(actions).toContain("member.removed");
  });

  it("penjaga admin terakhir (dipanggil langsung di tingkat layanan)", async () => {
    const admin = await newSession(ctx.app, "lastA");
    const ws = await createWorkspace(admin, "Ruang Admin Terakhir");
    await expect(
      changeMember(ctx.db, {
        workspaceId: ws.id,
        targetUid: admin.uid,
        role: "REVIEWER",
        actorUid: "pihak-lain-bukan-anggota",
        requestId: "req_unit_lastadmin",
        auditAction: "member.updated",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("kursor pagination audit: halaman kecil + kursor invalid → 400", async () => {
    const admin = await newSession(ctx.app, "pgA");
    const ws = await createWorkspace(admin, "Ruang Halaman Audit");
    // Tambah beberapa peristiwa audit.
    for (const name of ["Ruang X", "Ruang Y", "Ruang Z"]) {
      await request(ctx.app)
        .patch(`/api/v1/workspaces/${ws.id}`)
        .set("Cookie", admin.cookie)
        .send({ name });
    }

    const page1 = await request(ctx.app)
      .get(`/api/v1/audit-events?workspaceId=${ws.id}&limit=2`)
      .set("Cookie", admin.cookie);
    expect(page1.status).toBe(200);
    expect(page1.body.data.items).toHaveLength(2);
    expect(typeof page1.body.data.nextCursor).toBe("string");

    const page2 = await request(ctx.app)
      .get(
        `/api/v1/audit-events?workspaceId=${ws.id}&limit=2&cursor=${page1.body.data.nextCursor}`,
      )
      .set("Cookie", admin.cookie);
    expect(page2.status).toBe(200);
    expect(page2.body.data.items[0]?.id).not.toBe(page1.body.data.items[0]?.id);

    const badCursor = await request(ctx.app)
      .get(`/api/v1/audit-events?workspaceId=${ws.id}&cursor=doesnotexist123`)
      .set("Cookie", admin.cookie);
    expect(badCursor.status).toBe(400);
    expect(badCursor.body.error.details?.[0]?.reason).toBe("INVALID_CURSOR");

    const badAction = await request(ctx.app)
      .get(`/api/v1/audit-events?workspaceId=${ws.id}&action=hack.bos`)
      .set("Cookie", admin.cookie);
    expect(badAction.status).toBe(400);
  });
});
