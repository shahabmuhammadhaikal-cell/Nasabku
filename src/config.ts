import process from "node:process";

export type Lingkungan = "development" | "production" | "test";

/** Kredensial Firestore. `clientEmail`/`privateKey` null berarti memakai emulator/ADC. */
export interface KonfigurasiFirestore {
  projectId: string;
  clientEmail: string | null;
  privateKey: string | null;
}

export interface Konfigurasi {
  port: number;
  lingkungan: Lingkungan;
  umurSesiHari: number;
  kueAman: boolean;
  versiAplikasi: string;
  /** null bila Firestore belum dikonfigurasi; aplikasi tetap hidup dan rute data menjawab 503. */
  firestore: KonfigurasiFirestore | null;
  firestoreMasalah?: string;
  /** Hanya penanda ada/tidaknya variabel lingkungan — tidak pernah memuat nilainya. */
  petunjukKredensial: PetunjukKredensial;
}

export interface PetunjukKredensial {
  serviceAccountJson: boolean;
  projectId: boolean;
  clientEmail: boolean;
  privateKey: boolean;
}

function angka(nilai: string | undefined, bawaan: number): number {
  const hasil = Number(nilai);
  return Number.isFinite(hasil) && hasil > 0 ? hasil : bawaan;
}

function lingkunganDari(nilai: string | undefined): Lingkungan {
  if (nilai === "production") return "production";
  if (nilai === "test") return "test";
  return "development";
}

interface ServiceAccount {
  projectId: string;
  clientEmail: string;
  privateKey: string;
}

/** Membaca service account dari JSON di env var, menoleransi baris baru yang ter-escape. */
function bacaServiceAccount(env: NodeJS.ProcessEnv): ServiceAccount | null {
  const mentah = (env.FIREBASE_SERVICE_ACCOUNT_JSON ?? env.FIREBASE_SERVICE_ACCOUNT ?? "").trim();
  if (!mentah) return null;

  let isi: Record<string, unknown>;
  try {
    isi = JSON.parse(mentah) as Record<string, unknown>;
  } catch {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON bukan JSON yang valid.");
  }

  const clientEmail = typeof isi.client_email === "string" ? isi.client_email.trim() : "";
  const privateKey =
    typeof isi.private_key === "string" ? isi.private_key.replace(/\\n/g, "\n").trim() : "";
  if (!clientEmail || !privateKey) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON wajib memuat client_email dan private_key.");
  }
  const projectId = typeof isi.project_id === "string" ? isi.project_id.trim() : "";
  return { projectId, clientEmail, privateKey };
}

function bacaFirestore(env: NodeJS.ProcessEnv): KonfigurasiFirestore | null {
  const emulator = (env.FIRESTORE_EMULATOR_HOST ?? "").trim();
  const akun = bacaServiceAccount(env);
  const projectId = (
    env.FIREBASE_PROJECT_ID ??
    env.FIRESTORE_PROJECT_ID ??
    env.GOOGLE_CLOUD_PROJECT ??
    akun?.projectId ??
    ""
  ).trim();

  if (emulator) {
    return { projectId: projectId || "demo-nasabku", clientEmail: null, privateKey: null };
  }

  const clientEmail = akun?.clientEmail ?? (env.FIREBASE_CLIENT_EMAIL ?? "").trim();
  const privateKey =
    akun?.privateKey ?? (env.FIREBASE_PRIVATE_KEY ?? "").replace(/\\n/g, "\n").trim();

  if (!clientEmail || !privateKey) return null;
  if (!projectId) {
    throw new Error("FIREBASE_PROJECT_ID wajib diisi bersama kredensial Firestore.");
  }
  return { projectId, clientEmail, privateKey };
}

/** Membaca konfigurasi dari variabel lingkungan; masalah Firestore dilaporkan, bukan mematikan proses. */
export function muatKonfigurasi(env: NodeJS.ProcessEnv = process.env): Konfigurasi {
  let firestore: KonfigurasiFirestore | null = null;
  let firestoreMasalah: string | undefined;

  try {
    firestore = bacaFirestore(env);
  } catch (kesalahan) {
    firestoreMasalah = kesalahan instanceof Error ? kesalahan.message : String(kesalahan);
  }

  return {
    port: angka(env.PORT, 3000),
    lingkungan: lingkunganDari(env.NODE_ENV),
    umurSesiHari: angka(env.SESSION_TTL_HARI, 30),
    kueAman: env.COOKIE_SECURE === "true",
    versiAplikasi: "1.0.0",
    petunjukKredensial: {
      serviceAccountJson: Boolean(
        (env.FIREBASE_SERVICE_ACCOUNT_JSON ?? env.FIREBASE_SERVICE_ACCOUNT ?? "").trim(),
      ),
      projectId: Boolean(
        (env.FIREBASE_PROJECT_ID ?? env.FIRESTORE_PROJECT_ID ?? env.GOOGLE_CLOUD_PROJECT ?? "").trim(),
      ),
      clientEmail: Boolean((env.FIREBASE_CLIENT_EMAIL ?? "").trim()),
      privateKey: Boolean((env.FIREBASE_PRIVATE_KEY ?? "").trim()),
    },
    firestore,
    ...(firestoreMasalah ? { firestoreMasalah } : {}),
    ...(firestoreMasalah ? { firestore: null } : {}),
  };
}
