import type { Env } from "@nasabku/config";
import { pino, type Logger } from "pino";

/**
 * Logger dengan redaksi bawaan: header cookie/authorization, kata sandi,
 * dan token tidak pernah masuk log.
 */
export function createLogger(env: Pick<Env, "LOG_LEVEL" | "NODE_ENV">): Logger {
  return pino({
    level: env.LOG_LEVEL,
    redact: {
      paths: [
        "req.headers.cookie",
        "req.headers.authorization",
        "res.headers['set-cookie']",
        "password",
        "idToken",
        "sessionToken",
        "*.password",
        "*.idToken",
        "*.sessionToken",
      ],
      censor: "[REDACTED]",
    },
    // Di test, log senyap agar output jest/vitest bersih.
    ...(env.NODE_ENV === "test" ? { level: "silent" as const } : {}),
  });
}
