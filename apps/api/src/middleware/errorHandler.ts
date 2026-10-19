import { ApiError, errorEnvelope } from "@nasabku/shared";
import type { NextFunction, Request, Response } from "express";
import type { Logger } from "pino";
import { ZodError } from "zod";
import { zodIssuesToDetails } from "../lib/validation";

/**
 * Penangan kesalahan terpusat — semua respons gagal memakai envelope
 * { error: { code, message, details?, requestId } }.
 * Pesan 500 selalu generik (tanpa detail internal/stack).
 */
export function errorHandler(logger: Logger) {
  return (err: unknown, req: Request, res: Response, next: NextFunction): void => {
    if (res.headersSent) {
      next(err);
      return;
    }
    const requestId = req.requestId ?? "req_unknown";

    if (err instanceof ApiError) {
      if (err.status >= 500) {
        logger.error({ code: err.code, status: err.status, requestId }, "api error");
      } else {
        logger.warn({ code: err.code, status: err.status, requestId }, "api error");
      }
      res
        .status(err.status)
        .json(errorEnvelope(err.code, err.message, requestId, err.details));
      return;
    }

    if (err instanceof ZodError) {
      res
        .status(400)
        .json(
          errorEnvelope("VALIDATION_ERROR", "Data tidak valid.", requestId, zodIssuesToDetails(err)),
        );
      return;
    }

    const bodyErr = err as { type?: string } | null;
    if (bodyErr?.type === "entity.parse.failed") {
      res
        .status(400)
        .json(
          errorEnvelope("VALIDATION_ERROR", "Body bukan JSON yang valid.", requestId, [
            { field: "body", reason: "INVALID_JSON" },
          ]),
        );
      return;
    }
    if (bodyErr?.type === "entity.too.large") {
      res
        .status(413)
        .json(
          errorEnvelope("VALIDATION_ERROR", "Ukuran body melebihi batas.", requestId, [
            { field: "body", reason: "PAYLOAD_TOO_LARGE" },
          ]),
        );
      return;
    }

    logger.error({ err, requestId }, "unhandled error");
    res
      .status(500)
      .json(errorEnvelope("INTERNAL_ERROR", "Terjadi kesalahan pada server.", requestId));
  };
}
