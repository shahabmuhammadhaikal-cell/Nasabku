import { ApiError } from "@nasabku/shared";
import type { NextFunction, Request, Response } from "express";
import { describe, expect, it } from "vitest";
import { createRateLimiter } from "../../src/middleware/rateLimit";

interface FakeExchange {
  req: Request;
  res: Response;
  headers: Record<string, string>;
  next: NextFunction;
  calls: unknown[];
}

function fakeExchange(ip = "203.0.113.7"): FakeExchange {
  const headers: Record<string, string> = {};
  const calls: unknown[] = [];
  const req = {
    ip,
    socket: { remoteAddress: ip },
    method: "POST",
    header: () => undefined,
  } as unknown as Request;
  const res = {
    setHeader: (key: string, value: string) => {
      headers[key.toLowerCase()] = value;
    },
  } as unknown as Response;
  const next: NextFunction = (err?: unknown) => {
    if (err !== undefined) calls.push(err);
  };
  return { req, res, headers, next, calls };
}

describe("createRateLimiter", () => {
  it("mengizinkan hingga batas lalu menolak dengan 429 + Retry-After", () => {
    const clock = 1_000_000;
    const limiter = createRateLimiter({
      windowMs: 60_000,
      max: 3,
      keyPrefix: "unit",
      now: () => clock,
    });

    for (let i = 1; i <= 3; i++) {
      const ex = fakeExchange();
      limiter(ex.req, ex.res, ex.next);
      expect(ex.calls).toEqual([]);
      expect(ex.headers["x-ratelimit-limit"]).toBe("3");
      expect(ex.headers["x-ratelimit-remaining"]).toBe(String(3 - i));
    }

    const rejected = fakeExchange();
    limiter(rejected.req, rejected.res, rejected.next);
    expect(rejected.calls).toHaveLength(1);
    const err = rejected.calls[0] as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe("RATE_LIMITED");
    expect(err.status).toBe(429);
    expect(Number(rejected.headers["retry-after"])).toBeGreaterThan(0);
  });

  it("jendela baru menghitung ulang", () => {
    let clock = 5_000;
    const limiter = createRateLimiter({
      windowMs: 1_000,
      max: 1,
      keyPrefix: "unit",
      now: () => clock,
    });

    const first = fakeExchange();
    limiter(first.req, first.res, first.next);
    expect(first.calls).toEqual([]);

    const second = fakeExchange();
    limiter(second.req, second.res, second.next);
    expect(second.calls).toHaveLength(1);

    clock += 1_500; // jendela lewat
    const third = fakeExchange();
    limiter(third.req, third.res, third.next);
    expect(third.calls).toEqual([]);
  });

  it("bucket terpisah per IP", () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 1, keyPrefix: "unit" });
    const a = fakeExchange("203.0.113.7");
    limiter(a.req, a.res, a.next);
    const b = fakeExchange("198.51.100.9");
    limiter(b.req, b.res, b.next);
    expect(a.calls).toEqual([]);
    expect(b.calls).toEqual([]);
  });
});
