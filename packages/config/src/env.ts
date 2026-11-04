import { z } from "zod";

/**
 * Skema konfigurasi — divalidasi saat startup.
 *
 * Kebijakan keamanan:
 * - Nilai env tidak pernah dicetak (hanya NAMA variabel yang gagal).
 * - Di production, emulator Firebase dilarang aktif.
 */

const boolFromEnv = (defaultValue: boolean) =>
  z.preprocess(
    (v) => (v === undefined || v === "" ? defaultValue : v === "true" || v === "1"),
    z.boolean(),
  );

const port = z.coerce.number().int().min(1).max(65535).default(8080);

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: port,
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),

    APP_ORIGIN: z.string().url().default("http://localhost:3000"),
    API_CORS_ORIGINS: z.string().default(""),

    SESSION_COOKIE_NAME: z
      .string()
      .regex(/^[A-Za-z0-9_-]{3,64}$/)
      .default("nasabku_session"),
    SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(336).default(12),

    BODY_LIMIT_BYTES: z.coerce
      .number()
      .int()
      .min(1024)
      .max(5 * 1024 * 1024)
      .default(102400),

    RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(60000),
    RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(300),
    RATE_LIMIT_AUTH_MAX: z.coerce.number().int().min(1).default(10),

    USE_FIREBASE_EMULATORS: boolFromEnv(true),
    FIREBASE_PROJECT_ID: z.string().min(1).default("demo-nasabku"),
    // Isi JSON service account penuh ( production, non-GCP host seperti Render).
    // Bila kosong, Admin SDK memakai Application Default Credentials.
    FIREBASE_SERVICE_ACCOUNT_JSON: z.string().default(""),
    // Bila aktif, respons 500 menyertakan debug { stage, dbCode } —
    // diagnosa operasi Firestore tanpa harus membuka log host.
    // Set "false" setelah penyebab diketahui bila tidak ingin
    // diagnostik tampak di API.
    SHOW_DB_ERRORS: boolFromEnv(true),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === "production" && env.USE_FIREBASE_EMULATORS) {
      ctx.addIssue({
        code: "custom",
        path: ["USE_FIREBASE_EMULATORS"],
        message: "USE_FIREBASE_EMULATORS harus false di production",
      });
    }
  });

export type Env = z.infer<typeof EnvSchema>;

/** Kumpulkan daftar asal yang diizinkan CORS/Origin (APP_ORIGIN selalu termasuk). */
export function corsAllowlist(env: Pick<Env, "APP_ORIGIN" | "API_CORS_ORIGINS">): string[] {
  const extra = env.API_CORS_ORIGINS.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return [...new Set([env.APP_ORIGIN, ...extra])];
}

export class ConfigError extends Error {
  readonly variableNames: string[];
  constructor(variableNames: string[]) {
    super(`Konfigurasi tidak valid: ${variableNames.join(", ")}`);
    this.name = "ConfigError";
    this.variableNames = variableNames;
  }
}

/**
 * Parse env. Melempar ConfigError berisi daftar NAMA variabel saja
 * (tanpa nilai apa pun) bila skema gagal.
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const names = [
      ...new Set(parsed.error.issues.map((i) => (i.path.length ? i.path.join(".") : "(root)"))),
    ].sort();
    throw new ConfigError(names);
  }
  return parsed.data;
}
