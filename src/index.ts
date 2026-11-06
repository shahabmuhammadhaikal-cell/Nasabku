import process from "node:process";
import { buatAplikasi } from "./app.js";
import { muatKonfigurasi } from "./config.js";
import { bukaDatabase } from "./db.js";

const konfigurasi = muatKonfigurasi();
const db = bukaDatabase(konfigurasi.berkasDatabase);
const app = buatAplikasi({ db, konfigurasi });

const server = app.listen(konfigurasi.port, "0.0.0.0", () => {
  console.log(
    JSON.stringify({
      tingkat: "info",
      pesan: "Nasabku berjalan",
      port: konfigurasi.port,
      lingkungan: konfigurasi.lingkungan,
      database: konfigurasi.berkasDatabase,
    }),
  );
});

function tutup(sinyal: string): void {
  console.log(JSON.stringify({ tingkat: "info", pesan: `Menerima ${sinyal}, menutup server.` }));
  server.close(() => {
    try {
      db.close();
    } catch {
      // basis data mungkin sudah tertutup
    }
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", () => tutup("SIGTERM"));
process.on("SIGINT", () => tutup("SIGINT"));
