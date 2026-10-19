import { ApiError } from "@nasabku/shared";
import type { NextFunction, Request, RequestHandler, Response } from "express";

/**
 * CORS (allowlist) sekaligus penjaga asal untuk mencegah CSRF:
 * - Preflight OPTIONS dijawab 204.
 * - Metode aman (GET/HEAD) tidak dibatasi.
 * - Metode tulis dengan header Origin yang tidak ada di allowlist → 403.
 *   (Permintaan tanpa Origin — mis. curl/supertest — diizinkan; perlindungan
 *   tambahan berasal dari SameSite=Lax pada cookie sesi.)
 */
export function corsAndOriginGuard(allowlist: string[]): RequestHandler {
  const allowed = new Set(allowlist);
  const allowHeaders = "content-type,authorization,x-request-id,idempotency-key";

  return (req: Request, res: Response, next: NextFunction): void => {
    const origin = req.header("Origin");

    if (origin && allowed.has(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", allowHeaders);
      res.setHeader("Access-Control-Max-Age", "600");
    }

    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }

    const isWrite = req.method !== "GET" && req.method !== "HEAD";
    if (isWrite && origin && !allowed.has(origin)) {
      next(ApiError.forbidden("Origin tidak diizinkan."));
      return;
    }

    next();
  };
}
