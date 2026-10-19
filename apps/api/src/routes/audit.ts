import { successEnvelope } from "@nasabku/shared";
import { Router } from "express";
import { assertWorkspaceAccess, requireAuth } from "../middleware/auth";
import { auditQuerySchema } from "../schemas";
import { listAuditEvents } from "../services/workspace";
import type { ApiDeps } from "../types/context";

/**
 * Riwayat audit per workspace — memerlukan permission audit:read
 * (PLATFORM_ADMIN, AUDITOR). Pemindaian seluruh workspace (tanpa
 * filter) sengaja tidak tersedia.
 */
export function auditRouter(deps: ApiDeps): Router {
  const { db } = deps;
  const router = Router();

  router.get("/", requireAuth, async (req, res) => {
    const rid = req.requestId ?? "req_unknown";
    const query = auditQuerySchema.parse(req.query);
    await assertWorkspaceAccess(db, query.workspaceId, req.auth?.uid ?? "", "audit:read");
    const page = await listAuditEvents(db, {
      workspaceId: query.workspaceId,
      action: query.action,
      limit: query.limit,
      cursor: query.cursor,
    });
    res.status(200).json(successEnvelope(page, rid));
  });

  return router;
}
