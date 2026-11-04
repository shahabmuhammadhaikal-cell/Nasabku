import { ApiError, successEnvelope } from "@nasabku/shared";
import type { Response } from "express";
import { Router } from "express";
import { createRateLimiter } from "../middleware/rateLimit";
import { requireAuth } from "../middleware/auth";
import { createSession, destroySession } from "../services/session";
import { listUserMemberships, upsertUserOnLogin } from "../services/user";
import { recordAudit } from "../services/audit";
import { loginSchema, registerSchema } from "../schemas";
import { denganTahap } from "../lib/tahap";
import type { ApiDeps } from "../types/context";

/**
 * Autentikasi v2 — dibangun ulang dengan kebijakan:
 * 1. Setelah identitas valid (dibuat lewat /register atau terverifikasi
 *    lewat idToken di /login), SEMUA operasi Firestore berbalut tahap
 *    bernama (denganTahap). Kegagalan operasional menghasilkan 500
 *    generik dengan debug { stage, dbCode } bila SHOW_DB_ERRORS aktif.
 * 2. Identitas jahat tidak pernah menerima 500:
 *    - akun sudah ada → 409, kebijakan lemah → 400;
 *    - idToken sah-sah saja / jalur api gagal → 401.
 * 3. Sesi tak berubah: token acak yang di-hash di Firestore, cookie
 *    HttpOnly SameSite=Lax, TTL di bawah kendali server.
 */
export function authRouter(deps: ApiDeps): Router {
  const { env, db, firebaseAuth, logger } = deps;

  const router = Router();
  const loginLimiter = createRateLimiter({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    max: env.RATE_LIMIT_AUTH_MAX,
    keyPrefix: "auth",
  });

  /** Terbit sesi: cookie HttpOnly + masa kedaluwarsa yang sama di FE. */
  function terbitkanSesi(res: Response, token: string, expiresAt: number): void {
    res.cookie(env.SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires: new Date(expiresAt),
    });
  }

  // ── Pendaftaran langsung via backend (tanpa SDK klien) ────────────
  router.post("/register", loginLimiter, async (req, res) => {
    const rid = req.requestId ?? "req_unknown";
    const { email, password } = registerSchema.parse(req.body);

    // Tahap 1: buat akun Firebase Auth (Admin SDK).
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
      if (
        kode === "auth/weak-password" ||
        kode === "auth/invalid-password" ||
        kode === "auth/invalid-email"
      ) {
        throw ApiError.validation("Email atau sandi tidak memenuhi kebijakan.", [
          { field: "password", reason: "AUTH_RULE" },
        ]);
      }
      logger.warn({ err: String(err), requestId: rid }, "tahap register_create_auth_gagal");
      throw ApiError.internal("Pendaftaran gagal. Coba lagi nanti.");
    }

    // Tahap 2..4: penyimpanan pengguna, terbit sesi, daftar keanggotaan.
    const profil = { uid, email, name: null, emailVerified: false };
    const user = await denganTahap(
      logger,
      rid,
      "register_upsert_user",
      () => upsertUserOnLogin(db, profil, rid),
      "Pendaftaran gagal saat menyimpan pengguna. Coba lagi nanti.",
    );

    await recordAudit(db, {
      action: "user.registered",
      actorType: "user",
      resourceType: "session",
      resourceId: uid,
      requestId: rid,
      outcome: "success",
    }).catch((auditErr) => {
      logger.warn({ err: auditErr, requestId: rid }, "audit register gagal tersimpan");
    });

    const sesi = await denganTahap(
      logger,
      rid,
      "register_create_session",
      () => createSession(db, uid, env.SESSION_TTL_HOURS * 3600 * 1000),
      "Pendaftaran gagal saat menerbitkan sesi. Coba lagi nanti.",
    );
    terbitkanSesi(res, sesi.token, sesi.expiresAt);

    const memberships = await denganTahap(
      logger,
      rid,
      "register_list_memberships",
      () => listUserMemberships(db, uid),
      "Pendaftaran gagal saat membaca keanggotaan. Coba lagi nanti.",
    );
    res.status(201).json(successEnvelope({ user, memberships }, rid));
  });

  // ── Masuk: idToken dari peramban dikirim ke sertifikat publik ─────
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
      logger.warn({ err: String(err), requestId: rid }, "tahap login_verify_id_token gagal");
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

    const user = await denganTahap(
      logger,
      rid,
      "login_upsert_user",
      () => upsertUserOnLogin(db, profile, rid),
      "Masuk gagal saat menyimpan pengguna. Coba lagi nanti.",
    );

    const sesi = await denganTahap(
      logger,
      rid,
      "login_create_session",
      () => createSession(db, profile.uid, env.SESSION_TTL_HOURS * 3600 * 1000),
      "Masuk gagal saat menerbitkan sesi. Coba lagi nanti.",
    );
    terbitkanSesi(res, sesi.token, sesi.expiresAt);

    const memberships = await denganTahap(
      logger,
      rid,
      "login_list_memberships",
      () => listUserMemberships(db, profile.uid),
      "Masuk gagal saat membaca keanggotaan. Coba lagi nanti.",
    );
    res.status(200).json(successEnvelope({ user, memberships }, rid));
  });

  // ── Keluar: hapus sesi secara otoritatif + bersihkan cookie ────────
  router.post("/logout", async (req, res) => {
    const rid = req.requestId ?? "req_unknown";
    const token = req.cookies?.[env.SESSION_COOKIE_NAME];
    if (typeof token === "string" && token.length > 0) {
      await denganTahap(
        logger,
        rid,
        "logout_destroy_session",
        () => destroySession(db, token),
        "Keluar gagal. Coba lagi nanti.",
      );
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
      }).catch((auditErr) => {
        logger.warn({ err: auditErr, requestId: rid }, "audit logout gagal tersimpan");
      });
    }
    res.status(200).json(successEnvelope({ loggedOut: true }, rid));
  });

  // ── Siapa saya: pengguna + keanggotaan workspace-nya ───────────────
  router.get("/me", requireAuth, async (req, res) => {
    const rid = req.requestId ?? "req_unknown";
    const memberships = await denganTahap(
      logger,
      rid,
      "me_list_memberships",
      () => listUserMemberships(db, req.auth?.uid ?? ""),
      "Gagal membaca keanggotaan. Coba lagi nanti.",
    );
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
