import type { Env } from "@nasabku/config";
import {
  cert,
  getApp,
  getApps,
  initializeApp,
  type App,
  type Credential,
} from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

export interface FirebaseHandles {
  app: App;
  auth: Auth;
  db: Firestore;
}

/**
 * Bangun kredensial dari JSON service account di env var.
 * Dipakai di host non-GCP (mis. Render) yang tidak punya
 * Application Default Credentials. Bila tidak di-set, kembalikan undefined
 * agar initializeApp jatuh ke ADC (GCP metadata / GOOGLE_APPLICATION_CREDENTIALS).
 */
function serviceAccountCredential(env: Env): Credential | undefined {
  const raw = env.FIREBASE_SERVICE_ACCOUNT_JSON.trim();
  if (!raw) return undefined;
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON bukan JSON yang valid");
  }
  const clientEmail =
    typeof parsed["client_email"] === "string" ? parsed["client_email"] : undefined;
  let privateKey =
    typeof parsed["private_key"] === "string" ? parsed["private_key"] : undefined;
  if (!clientEmail || !privateKey) {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT_JSON wajib memiliki client_email dan private_key",
    );
  }
  // Kembalikan ikatan baris private key yang sering hilang di env var.
  privateKey = privateKey.replace(/\\n/g, "\n");
  const projectId = typeof parsed["project_id"] === "string" ? parsed["project_id"] : undefined;
  return cert({ projectId, clientEmail, privateKey });
}

/**
 * Inisialisasi Firebase Admin sekali per proses.
 * Dengan USE_FIREBASE_EMULATORS=true, host emulator diarahkan ke lokal
 * (auth :9099, firestore :8080) bila belum di-set oleh emulators:exec.
 */
export function initFirebase(env: Env): FirebaseHandles {
  if (env.USE_FIREBASE_EMULATORS) {
    process.env.FIREBASE_AUTH_EMULATOR_HOST ??= "localhost:9099";
    process.env.FIRESTORE_EMULATOR_HOST ??= "localhost:8080";
  }
  const credential = serviceAccountCredential(env);
  const app =
    getApps().length > 0
      ? getApp()
      : initializeApp({
          projectId: env.FIREBASE_PROJECT_ID,
          // Jangan teruskan credential: undefined — Admin SDK menolaknya.
          // Bila tak ada service account (mis. lokal/GCP), biarkan ADC.
          ...(credential ? { credential } : {}),
        });
  const db = getFirestore(app);
  return { app, auth: getAuth(app), db };
}
