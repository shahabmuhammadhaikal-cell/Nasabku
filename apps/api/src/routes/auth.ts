import { ApiError, successEnvelope } from "@nasabku/shared";
import { Router } from "express";
import { createRateLimiter } from "../middleware/rateLimit";
import { requireAuth } from "../middleware/auth";
import { createSession, destroySession } from "../services/session";
import { listUserMemberships, upsertUserOnLogin } from "../services/user";
import { recordAudit } from "../services/audit";
import { loginSchema, registerSchema } from "../schemas";
import type { ApiDeps } from "../types/context";

/**
 * Autentikasi: pertukaran ID token Firebase Auth → cookie sesi
 * HttpOnly SameSite=Lax (token acak tersimpan ter-hash di Firestore).
 * Endpoint reset kata sandi memerlukan penyedia email transaksional
 * (keputusan produk) dan dijadwalkan pada fase berikutnya.
 */
export function authRouter(deps: ApiDeps): Router {
  const { env, db, firebaseAuth, logger } = deps;

  // Bungkus galat tahap tulisFirestore dengan label tahap dan galat
  // penuh di log: kode Firestore (mis. PERMISSION_DENIED) langsung
  // terbaca di log Render tanpa menurunkan detail ke respons klien.
  function lemparTahap(label: string, rid: string, err: unknown): ApiError {
    logger.error({ stage: label, err, requestId: rid }, "tulis auth gagal");
    return ApiError.internal("Operasi autentikasi gagal. Coba lagi nanti.");
  }

  const router = Router();
  const loginLimiter = createRateLimiter({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    max: env.RATE_LIMIT_AUTH_MAX,
    keyPrefix: "auth",
  });

  // Pendaftaran langsung dari backend: akun dibuat di Firebase Auth
  // via Admin SDK, tanpa perlu SDK klien. Sesi cookie diterbitkan di
  // tempat sama sehingga pengguna langsung masuk setelah daftar.
  router.post("/register", loginLimiter, async (req, res) => {
    const rid = req.requestId ?? "req_unknown";
    const { email, password } = registerSchema.parse(req.body);

    let uid: string;
    try {
      const akun = await firebaseAuth.createUser({
        email,
        password,
        emailVerified: false,
        disabled: false,
      });
      uid = akun.uid;
    } catch (err) {
      const kode = (err as { code?: string })?.code ?? "";
      await recordAudit(db, {
        action: "user.registered",
        actorType: "user",
        resourceType: "session",
        resourceId: null,
        requestId: rid,
        outcome: "failure",
        metadata: { reason: kode || "unknown" },
      }).catch(() => {});
      // Admin SDK: auth/email-already-exists; klien SDK: auth/email-already-in-use.
      if (kode === "auth/email-already-exists" || kode === "auth/email-already-in-use") {
        throw ApiError.conflict("Email sudah terdaftar. Gunakan tombol Masuk.");
      }
      if (kode === "auth/weak-password" || kode === "auth/invalid-password" || kode === "auth/invalid-email") {
        throw ApiError.validation("Email atau sandi tidak memenuhi kebijakan.", [
          { field: "password", reason: "AUTH_RULE" },
        ]);
      }
      logger.warn({ err: String(err), requestId: rid }, "pembuatan akun gagal");
      throw ApiError.internal("Pendaftaran gagal. Coba lagi nanti.");
    }

    let user: Awaited<ReturnType<typeof upsertUserOnLogin>>;
    try {
      user = await upsertUserOnLogin(
        db,
        { uid, email, name: null, emailVerified: false },
        rid,
      );
    } catch (err) {
      throw lemparTahap("register_upsert_user", rid, err);
    }
    await recordAudit(db, {
      action: "user.registered",
      actorType: "user",
      resourceType: "session",
      resourceId: uid,
      requestId: rid,
      outcome: "success",
    }).catch(() => {});

    let tokenJanji: { token: string; expiresAt: number };
    try {
      tokenJanji = await createSession(db, uid, env.SESSION_TTL_HOURS * 3600 * 1000);
    } catch (err) {
      throw lemparTahap("register_create_session", rid, err);
    }
    const { token, expiresAt } = tokenJanji;
    res.cookie(env.SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires: new Date(expiresAt),
    });
    let memberships: Awaited<ReturnType<typeof listUserMemberships>>;
    try {
      memberships = await listUserMemberships(db, uid);
    } catch (err) {
      throw lemparTahap("register_list_memberships", rid, err);
    }
    res.status(201).json(successEnvelope({ user, memberships }, rid));
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

    let user: Awaited<ReturnType<typeof upsertUserOnLogin>>;
    try {
      user = await upsertUserOnLogin(db, profile, rid);
    } catch (err) {
      throw lemparTahap("login_upsert_user", rid, err);
    }
    let tokenJanji: { token: string; expiresAt: number };
    try {
      tokenJanji = await createSession(
        db,
        profile.uid,
        env.SESSION_TTL_HOURS * 3600 * 1000,
      );
    } catch (err) {
      throw lemparTahap("login_create_session", rid, err);
    }
    const { token, expiresAt } = tokenJanji;
    res.cookie(env.SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires: new Date(expiresAt),
    });

    let memberships: Awaited<ReturnType<typeof listUserMemberships>>;
    try {
      memberships = await listUserMemberships(db, profile.uid);
    } catch (err) {
      throw lemparTahap("login_list_memberships", rid, err);
    }
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
