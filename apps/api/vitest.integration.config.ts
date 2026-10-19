import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  test: {
    include: ["tests/integration/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
    environment: "node",
    testTimeout: 30000,
    hookTimeout: 30000,
    // Satu proyek emulator → jalankan berurutan agar deterministik.
    fileParallelism: false,
    sequence: { concurrent: false },
  },
});
