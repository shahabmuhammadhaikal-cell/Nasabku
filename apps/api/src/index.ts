import { ConfigError, loadEnv, type Env } from "@nasabku/config";
import { createApp } from "./app";
import { initFirebase } from "./lib/firebase";
import { createLogger } from "./lib/logger";

async function main(): Promise<void> {
  let env: Env;
  try {
    env = loadEnv();
  } catch (err) {
    // Gagal-loud: hanya NAMA variabel yang dicetak, tidak ada nilai.
    if (err instanceof ConfigError) {
      console.error(err.message);
      process.exit(1);
    }
    throw err;
  }

  const logger = createLogger(env);
  const { auth, db } = initFirebase(env);
  const app = createApp({ env, logger, db, firebaseAuth: auth });

  const server = app.listen(env.PORT, "0.0.0.0", () => {
    logger.info({ port: env.PORT, nodeEnv: env.NODE_ENV }, "API Nasabku berjalan");
  });

  let shuttingDown = false;
  const shutdown = (signal: string): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, "mematikan server");
    server.close(() => {
      process.exit(0);
    });
    // Jangan tunggu selamanya bila koneksi menggantung.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
