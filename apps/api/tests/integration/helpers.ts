import { loadEnv, type Env } from "@nasabku/config";
import type { Express } from "express";
import type { Auth } from "firebase-admin/auth";
import type { Firestore } from "firebase-admin/firestore";
import request from "supertest";
import { createApp } from "../../src/app";
import { initFirebase } from "../../src/lib/firebase";
import { createLogger } from "../../src/lib/logger";

export interface TestApp {
  app: Express;
  db: Firestore;
  firebaseAuth: Auth;
  env: Env;
}

/**
 * Bangun aplikasi segar (termasuk rate limiter in-memory segar)
 * yang menunjuk ke Emulator Suite (env diset oleh emulators:exec).
 */
export function buildTestApp(overrides: Record<string, string> = {}): TestApp {
  const env = loadEnv({
    ...process.env,
    NODE_ENV: "test",
    LOG_LEVEL: "silent",
    RATE_LIMIT_MAX: "100000",
    ...overrides,
  });
  const logger = createLogger(env);
  const { auth, db } = initFirebase(env);
  return { app: createApp({ env, logger, db, firebaseAuth: auth }), db, firebaseAuth: auth, env };
}

function authBase(): string {
  const host = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "localhost:9099";
  return `http://${host}`;
}

/** Buat pengguna langsung di Auth Emulator; kembalikan uid + idToken. */
export async function signUpUser(
  email: string,
  password = "KataSandi!123",
): Promise<{ uid: string; idToken: string }> {
  const project = process.env.GCLOUD_PROJECT ?? "demo-nasabku";
  const key = "emulator-api-key";
  // Auth Emulator firebase-tools v15: rute v1 + alias legacy relyingparty.
  const candidates = [
    `${authBase()}/identitytoolkit.googleapis.com/v1/projects/${project}/accounts:signUp?key=${key}`,
    `${authBase()}/www.googleapis.com/identitytoolkit/v3/relyingparty/signupNewUser?key=${key}`,
  ];
  const body = JSON.stringify({ email, password, returnSecureToken: true });

  let lastStatus = 0;
  let lastBody = "";
  for (const url of candidates) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    if (res.ok) {
      const data = (await res.json()) as { localId: string; idToken: string };
      return { uid: data.localId, idToken: data.idToken };
    }
    lastStatus = res.status;
    lastBody = await res.text();
  }
  throw new Error(`signUp emulator gagal: ${lastStatus} ${lastBody}`);
}

/** Ambil header cookie sesi dari respons login. */
export function extractSessionCookie(res: request.Response, name: string): string {
  const raw = (res.headers["set-cookie"] ?? []) as unknown as string[];
  const found = raw.find((c) => c.startsWith(`${name}=`));
  if (!found) throw new Error("cookie sesi tidak ditemukan pada respons login");
  const pair = found.split(";")[0];
  if (!pair) throw new Error("cookie sesi kosong");
  return pair;
}

export interface TestUser {
  uid: string;
  email: string;
  cookie: string;
}

let counter = 0;

/** Pengguna unik + sesi login siap pakai. */
export async function newSession(app: Express, prefix = "user"): Promise<TestUser> {
  counter += 1;
  const email = `${prefix}${counter}_${Math.random().toString(36).slice(2, 10)}@nasabku.test`;
  const { uid, idToken } = await signUpUser(email);
  const res = await request(app).post("/api/v1/auth/login").send({ idToken });
  if (res.status !== 200) {
    throw new Error(`login gagal: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return { uid, email, cookie: extractSessionCookie(res, "nasabku_session") };
}
