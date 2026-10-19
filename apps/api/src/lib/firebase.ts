import type { Env } from "@nasabku/config";
import { getApp, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

export interface FirebaseHandles {
  app: App;
  auth: Auth;
  db: Firestore;
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
  const app =
    getApps().length > 0
      ? getApp()
      : initializeApp({ projectId: env.FIREBASE_PROJECT_ID });
  const db = getFirestore(app);
  return { app, auth: getAuth(app), db };
}
