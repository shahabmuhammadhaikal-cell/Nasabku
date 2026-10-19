import { ApiError, successEnvelope } from "@nasabku/shared";
import { Router } from "express";
import { createRateLimiter } from "../middleware/rateLimit";
import { requireAuth } from "../middleware/auth";
import { createSession, destroySession } from "../services/session";
import { listUserMemberships, upsertUserOnLogin } from "../services/user";
import { recordAudit } from "../services/audit";
import { loginSchema } from "../schemas";
import type { ApiDeps } from "../types/context";

/**
 * Autentikasi: pertukaran ID token Firebase Auth → cookie sesi
 * HttpOnly SameSite=Lax (token acak tersimpan ter-hash di Firestore).
 * Endpoint reset kata sandi memerlukan penyedia email transaksional
 * (keputusan produk) dan dijadwalkan pada fase berikutnya.
 */
export function authRouter(deps: ApiDeps): Router {
  const { env, db, firebaseAuth, logger } = deps;
  const router = Router();
  const loginLimiter = createRateLimiter({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    max: env.RATE_LIMIT_AUTH_MAX,
    keyPrefix: "auth",
  });

  router.post("/login", loginLimiter, async (req, res) => {
    const rid = req.requestId ?? "req_unknown";
    const { idToken } = loginSchema.parse(req.body);

    let profile: { uid: string; email: string; name: string | null; emailVerified: boolean };
    try {
      const decoded = await firebaseAuth.verifyIdToken(idToken);
      if (!decoded.email) {
        throw ApiError.unauthenticated("Token autentikasi tidak memiliki email.");
      }
      profile = {
        uid: decoded.uid,
        email: decoded.email.toLowerCase(),
        name: decoded.name ?? null,
        emailVerified: Boolean(decoded.email_verified),
      };
    } catch (err) {
      if (err instanceof ApiError) throw err;
      logger.warn({ err: String(err), requestId: rid }, "verifikasi idToken gagal");
      await recordAudit(db, {
        action: "user.login_failed",
        actorType: "user",
        resourceType: "session",
        resourceId: null,
        requestId: rid,
        outcome: "failure",
        metadata: { reason: "invalid_id_token" },
      }).catch((auditErr: unknown) => {
        logger.error({ err: auditErr, requestId: rid }, "audit login gagal tersimpan");
      });
      throw ApiError.unauthenticated("Token autentikasi tidak valid.");
    }

    const user = await upsertUserOnLogin(db, profile, rid);
    const { token, expiresAt } = await createSession(
      db,
      profile.uid,
      env.SESSION_TTL_HOURS * 3600 * 1000,
    );
    res.cookie(env.SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires: new Date(expiresAt),
    });

    const memberships = await listUserMemberships(db, profile.uid);
    res.status(200).json(successEnvelope({ user, memberships }, rid));
  });

  router.post("/logout", async (req, res) => {
    const rid = req.requestId ?? "req_unknown";
    const token = req.cookies?.[env.SESSION_COOKIE_NAME];
    if (typeof token === "string" && token.length > 0) {
      await destroySession(db, token);
    }
    res.clearCookie(env.SESSION_COOKIE_NAME, { path: "/" });
    if (req.auth) {
      await recordAudit(db, {
        action: "user.logout",
        actorType: "user",
        actorUserId: req.auth.uid,
        resourceType: "session",
        resourceId: null,
        requestId: rid,
        outcome: "success",
      });
    }
    res.status(200).json(successEnvelope({ loggedOut: true }, rid));
  });

  router.get("/me", requireAuth, async (req, res) => {
    const rid = req.requestId ?? "req_unknown";
    const memberships = await listUserMemberships(db, req.auth?.uid ?? "");
    res.status(200).json(
      successEnvelope(
        {
          user: {
            uid: req.auth?.uid,
            email: req.auth?.email,
            name: req.auth?.name ?? null,
            emailVerified: req.auth?.emailVerified ?? false,
          },
          memberships,
        },
        rid,
      ),
    );
  });

  return router;
}
