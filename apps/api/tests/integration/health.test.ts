import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import type { TestApp } from "./helpers";
import { buildTestApp } from "./helpers";

let ctx: TestApp;

beforeAll(() => {
  ctx = buildTestApp();
});

describe("Kesehatan & kontrak envelope", () => {
  it("GET /api/v1/health/live → 200 + envelope meta.requestId + header X-Request-Id", async () => {
    const res = await request(ctx.app).get("/api/v1/health/live");
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ status: "ok" });
    expect(typeof res.body.meta.requestId).toBe("string");
    expect(res.headers["x-request-id"]).toBe(res.body.meta.requestId);
  });

  it("X-Request-Id klien diterima bila valid, dibuang bila tidak", async () => {
    const ok = await request(ctx.app)
      .get("/api/v1/health/live")
      .set("X-Request-Id", "trace-12345678");
    expect(ok.headers["x-request-id"]).toBe("trace-12345678");
    expect(ok.body.meta.requestId).toBe("trace-12345678");

    const bad = await request(ctx.app)
      .get("/api/v1/health/live")
      .set("X-Request-Id", "x");
    expect(bad.headers["x-request-id"]).toMatch(/^req_/);
  });

  it("GET /api/v1/health/ready → 200 + keterangan database saat emulator terjangkau", async () => {
    const res = await request(ctx.app).get("/api/v1/health/ready");
    // Kesiapan TIDAK bergantung pada Firestore: 200 selalu, status
    // database sekadar keterangan (lihat komentar healthRouter).
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ status: "siap", database: "tersedia" });
  });

  it("rute tak dikenal → 404 envelope NOT_FOUND", async () => {
    const res = await request(ctx.app).get("/api/v1/tidak-ada");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
    expect(res.body.error.requestId).toBe(res.headers["x-request-id"]);
  });

  it("tidak membocorkan banner powered-by", async () => {
    const res = await request(ctx.app).get("/api/v1/health/live");
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });
});
