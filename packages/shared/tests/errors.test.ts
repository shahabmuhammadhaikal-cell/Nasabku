import { describe, expect, it } from "vitest";
import {
  ApiError,
  ERROR_CODES,
  errorEnvelope,
  sanitizeAuditMetadata,
  successEnvelope,
} from "../src/index";

describe("Envelope error & sukses", () => {
  it("sukses memuat data + meta.requestId", () => {
    const env = successEnvelope({ ok: true }, "req_abc");
    expect(env).toEqual({ data: { ok: true }, meta: { requestId: "req_abc" } });
  });

  it("error memuat code, message, details, requestId sesuai kontrak", () => {
    const env = errorEnvelope("VALIDATION_ERROR", "Data tidak valid.", "req_xyz", [
      { field: "email", reason: "INVALID_EMAIL" },
    ]);
    expect(env.error.code).toBe("VALIDATION_ERROR");
    expect(env.error.requestId).toBe("req_xyz");
    expect(env.error.details).toEqual([{ field: "email", reason: "INVALID_EMAIL" }]);
  });

  it("details kosong tidak ikut terkirim", () => {
    const env = errorEnvelope("NOT_FOUND", "Tidak ditemukan.", "req_1");
    expect("details" in env.error).toBe(false);
  });

  it("semua ApiError punya status HTTP yang sesuai kontrak", () => {
    expect(ApiError.validation("x", []).status).toBe(400);
    expect(ApiError.unauthenticated().status).toBe(401);
    expect(ApiError.forbidden().status).toBe(403);
    expect(ApiError.notFound().status).toBe(404);
    expect(ApiError.conflict("x").status).toBe(409);
    expect(ApiError.rateLimited(60).status).toBe(429);
    expect(ApiError.internal().status).toBe(500);
    expect(ApiError.unauthenticated().code).toBe("UNAUTHENTICATED");
  });

  it("ApiError.rateLimited menyebut waktu tunggu", () => {
    const err = ApiError.rateLimited(60);
    expect(err.message).toContain("60");
    expect(err.code).toBe("RATE_LIMITED");
  });

  it("daftar kode error stabil (kontrak API)", () => {
    expect([...ERROR_CODES].sort()).toEqual(
      [
        "CONFLICT",
        "FORBIDDEN",
        "INTERNAL_ERROR",
        "NOT_FOUND",
        "RATE_LIMITED",
        "UNAUTHENTICATED",
        "VALIDATION_ERROR",
      ].sort(),
    );
  });
});

describe("Redaksi metadata audit", () => {
  it("membuang kunci terlarang (password/token/cookie/dll.)", () => {
    const out = sanitizeAuditMetadata({
      targetUserId: "u_123",
      password: "rahasia",
      sessionToken: "tok",
      myCookieHeader: "x",
      Authorization: "Bearer x",
      apiKey: "k",
    });
    expect(out).toEqual({ targetUserId: "u_123" });
  });

  it("objek/array disimpan hanya sebagai tipe, bukan isi", () => {
    const out = sanitizeAuditMetadata({
      payload: { quote: "isi sensitif" },
      list: [1, 2, 3],
      count: 4,
      ok: true,
      none: null,
    });
    expect(out).toEqual({ payload: "[object]", list: "[array]", count: 4, ok: true, none: null });
  });

  it("string panjang dipotong", () => {
    const out = sanitizeAuditMetadata({ note: "x".repeat(600) });
    expect(out?.note).toHaveLength(501);
    expect(String(out?.note).endsWith("…")).toBe(true);
  });

  it("metadata kosong/tidak ada → undefined", () => {
    expect(sanitizeAuditMetadata(undefined)).toBeUndefined();
    expect(sanitizeAuditMetadata({})).toBeUndefined();
    expect(sanitizeAuditMetadata({ password: "x" })).toBeUndefined();
  });
});
