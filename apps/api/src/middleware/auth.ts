import { ApiError, hasPermission, isRole, type Permission } from "@nasabku/shared";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { Firestore } from "firebase-admin/firestore";
import { getSession } from "../services/session";
import { getUserById } from "../services/user";
import type { ApiDeps, WorkspaceContext } from "../types/context";

/**
 * Membaca cookie sesi → dokumen sesi → dokumen pengguna.
 * Bila tidak ada/kedaluwarsa, lanjut tanpa req.auth (tanpa error).
 */
export function authenticate(deps: ApiDeps): RequestHandler {
  const { env, db, logger } = deps;
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const token = req.cookies?.[env.SESSION_COOKIE_NAME];
      if (typeof token !== "string" || token.length === 0) {
        next();
        return;
      }
      const session = await getSession(db, token);
      if (!session) {
        next();
        return;
      }
      const user = await getUserById(db, session.uid);
      if (!user || !user.email) {
        next();
        return;
      }
      req.auth = user;
      next();
    } catch (err) {
      // Gagal membaca sesi → perlakukan sebagai anonim (401 menyusul
      // bila endpoint memerlukan autentikasi).
      logger.error({ err, requestId: req.requestId }, "gagal membaca sesi");
      next();
    }
  };
}

export const requireAuth: RequestHandler = (req, _res, next) => {
  if (!req.auth) {
    next(ApiError.unauthenticated());
    return;
  }
  next();
};

/**
 * Verifikasi keanggotaan workspace + permission.
 *
 * Kebijakan: non-anggota (atau anggota nonaktif) menerima 404, bukan
 * 403 — keberadaan workspace tidak boleh bocor ke pihak yang tidak
 * berhak. Anggota aktif tanpa izin menerima 403.
 */
export async function assertWorkspaceAccess(
  db: Firestore,
  workspaceId: string,
  uid: string,
  permission: Permission,
): Promise<WorkspaceContext> {
  const wsSnap = await db.doc(`workspaces/${workspaceId}`).get();
  const memSnap = await db.doc(`workspaces/${workspaceId}/memberships/${uid}`).get();
  const ws = wsSnap.exists ? wsSnap.data() : undefined;
  const mem = memSnap.exists ? memSnap.data() : undefined;

  if (!ws || !mem || mem.status !== "ACTIVE") {
    throw ApiError.notFound();
  }
  const role = mem.role;
  if (!isRole(role) || !hasPermission(role, permission)) {
    throw ApiError.forbidden();
  }
  return {
    id: workspaceId,
    slug: String(ws.slug ?? ""),
    status: String(ws.status ?? ""),
    role,
    membershipId: uid,
  };
}

/** Middleware: wajib auth + akses workspace dengan permission tertentu. */
export function requireWorkspacePermission(deps: ApiDeps, permission: Permission): RequestHandler {
  const { db } = deps;
  return async (req, _res, next) => {
    try {
      if (!req.auth) {
        next(ApiError.unauthenticated());
        return;
      }
      const workspaceId =
        typeof req.params.workspaceId === "string" ? req.params.workspaceId : undefined;
      if (!workspaceId) {
        next(ApiError.notFound());
        return;
      }
      req.workspace = await assertWorkspaceAccess(db, workspaceId, req.auth.uid, permission);
      next();
    } catch (err) {
      next(err);
    }
  };
}
