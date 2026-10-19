import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

/** Request ID yang sah: 8–64 karakter [A-Za-z0-9_-]. */
export const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

/**
 * ID permintaan: terima header X-Request-Id yang sah dari klien
 * (dipakai lintas log), selain itu buat baru. Selalu dikembalikan
 * di header respons dan disematkan ke req.requestId.
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header("X-Request-Id");
  const id =
    incoming && REQUEST_ID_PATTERN.test(incoming) ? incoming : `req_${randomUUID()}`;
  req.requestId = id;
  res.setHeader("X-Request-Id", id);
  next();
}
