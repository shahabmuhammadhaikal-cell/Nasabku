import { describe, expect, it } from "vitest";
import { ConfigError, corsAllowlist, loadEnv } from "../src/index";

describe("loadEnv", () => {
  it("default aman untuk pengembangan", () => {
    const env = loadEnv({});
    expect(env.NODE_ENV).toBe("development");
    expect(env.PORT).toBe(8080);
    expect(env.USE_FIREBASE_EMULATORS).toBe(true);
    expect(env.SESSION_COOKIE_NAME).toBe("nasabku_session");
    expect(env.SESSION_TTL_HOURS).toBe(12);
    expect(env.RATE_LIMIT_AUTH_MAX).toBe(10);
  });

  it("mengubah nilai string dengan benar", () => {
    const env = loadEnv({
      PORT: "9999",
      RATE_LIMIT_MAX: "50",
      USE_FIREBASE_EMULATORS: "false",
      LOG_LEVEL: "debug",
    });
    expect(env.PORT).toBe(9999);
    expect(env.RATE_LIMIT_MAX).toBe(50);
    expect(env.USE_FIREBASE_EMULATORS).toBe(false);
    expect(env.LOG_LEVEL).toBe("debug");
  });

  it("gagal di production bila emulator masih aktif (tanpa membocorkan nilai)", () => {
    try {
      loadEnv({ NODE_ENV: "production", USE_FIREBASE_EMULATORS: "true" });
      expect.unreachable("seharusnya melempar ConfigError");
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigError);
      const cfgErr = err as ConfigError;
      expect(cfgErr.variableNames).toContain("USE_FIREBASE_EMULATORS");
      expect(cfgErr.message).not.toContain("true");
    }
  });

  it("daftar variabel sah yang rusak dilaporkan per nama", () => {
    try {
      loadEnv({ PORT: "70000", SESSION_COOKIE_NAME: "bad name!" });
      expect.unreachable("seharusnya melempar ConfigError");
    } catch (err) {
      const cfgErr = err as ConfigError;
      expect(cfgErr.variableNames.sort()).toEqual(["PORT", "SESSION_COOKIE_NAME"]);
    }
  });

  it("production valid ketika emulator dimatikan", () => {
    const env = loadEnv({
      NODE_ENV: "production",
      USE_FIREBASE_EMULATORS: "false",
      FIREBASE_PROJECT_ID: "nasabku-prod",
    });
    expect(env.FIREBASE_PROJECT_ID).toBe("nasabku-prod");
  });
});

describe("corsAllowlist", () => {
  it("selalu memuat APP_ORIGIN dan menambah origin lain dari API_CORS_ORIGINS", () => {
    const list = corsAllowlist({
      APP_ORIGIN: "http://localhost:3000",
      API_CORS_ORIGINS: "https://app.nasabku.id, http://localhost:5173",
    });
    expect(list).toEqual([
      "http://localhost:3000",
      "https://app.nasabku.id",
      "http://localhost:5173",
    ]);
  });

  it("tidak ada duplikat", () => {
    const list = corsAllowlist({
      APP_ORIGIN: "http://localhost:3000",
      API_CORS_ORIGINS: "http://localhost:3000,",
    });
    expect(list).toEqual(["http://localhost:3000"]);
  });
});
