import { corsAllowlist } from "@nasabku/config";
import { ApiError } from "@nasabku/shared";
import cookieParser from "cookie-parser";
import express, { Router, type Express, type Request } from "express";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pinoHttp from "pino-http";
import { authenticate } from "./middleware/auth";
import { corsAndOriginGuard } from "./middleware/cors";
import { errorHandler } from "./middleware/errorHandler";
import { requestIdMiddleware } from "./middleware/requestId";
import { createRateLimiter } from "./middleware/rateLimit";
import { auditRouter } from "./routes/audit";
import { authRouter } from "./routes/auth";
import { healthRouter } from "./routes/health";
import { workspacesRouter } from "./routes/workspaces";
import type { ApiDeps } from "./types/context";

const asRequest = (value: unknown): Request => value as Request;

/**
 * Folder statik web UI (apps/web/public). Dihitung relatif terhadap file ini
 * sehingga sama benar via tsx (src/) maupun bundle (dist/); keduanya
 * menghasilkan <root>/apps/web/public.
 */
const webPublicDir = fileURLToPath(new URL("../../web/public", import.meta.url));

/**
 * Susunan middleware (urutan penting):
 * 1. requestId      — ID untuk log + envelope + header respons
 * 2. pino-http      — akses log terstruktur (cookie/authorization diredaksi)
 * 3. CORS + origin  — allowlist; metode tulis dengan asal asing → 403 (anti-CSRF)
 * 4. body parser    — JSON dengan batas ukuran
 * 5. cookie parser
 * 6. rate limit     — jendela tetap per-IP (in-memory, interim)
 * 7. authenticate   — cookie sesi → req.auth (bila sah)
 * 8. rute /api/v1
 * 9. 404 + error handler terpusat (envelope seragam)
 */
export function createApp(deps: ApiDeps): Express {
  const { env, logger } = deps;
  const app = express();
  app.disable("x-powered-by");

  app.use(requestIdMiddleware);
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => asRequest(req).requestId ?? `pino_${randomUUID()}`,
      customProps: (req) => ({ requestId: asRequest(req).requestId }),
    }),
  );
  app.use(corsAndOriginGuard(corsAllowlist(env)));
  app.use(express.json({ limit: env.BODY_LIMIT_BYTES }));
  app.use(cookieParser());
  app.use(
    createRateLimiter({
      windowMs: env.RATE_LIMIT_WINDOW_MS,
      max: env.RATE_LIMIT_MAX,
      keyPrefix: "global",
    }),
  );
  app.use(authenticate(deps));

  const v1 = Router();
  v1.use("/health", healthRouter(deps));
  v1.use("/auth", authRouter(deps));
  v1.use("/workspaces", workspacesRouter(deps));
  v1.use("/audit-events", auditRouter(deps));
  app.use("/api/v1", v1);

  // Web UI statik — satu asal (same-origin) dengan API sehingga cookie
  // sesi HttpOnly berjalan alami dan penjaga origin tak menghalangi.
  app.use(express.static(webPublicDir));

  // Rute non-/api yang tidak cocok file statik → halaman SPA.
  app.use((req, res, next) => {
    if (req.method === "GET" && !req.path.startsWith("/api")) {
      res.sendFile(path.join(webPublicDir, "index.html"), (err) => {
        if (err) next(ApiError.notFound("Halaman tidak ditemukan."));
      });
      return;
    }
    next();
  });

  app.use((_req, _res, next) => next(ApiError.notFound("Endpoint tidak ditemukan.")));
  app.use(errorHandler(logger, env.SHOW_DB_ERRORS));

  return app;
}
