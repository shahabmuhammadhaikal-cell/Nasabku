import process from "node:process";
import { buatAplikasi } from "./app.js";
import { muatKonfigurasi } from "./config.js";
import { buatPenyimpananFirestore } from "./data/firestore.js";
import { penyimpananBelumSiap } from "./data/penyimpanan.js";

const konfigurasi = muatKonfigurasi();
const penyimpanan = konfigurasi.firestore
  ? buatPenyimpananFirestore(konfigurasi.firestore)
  : penyimpananBelumSiap(
      konfigurasi.firestoreMasalah ??
        "Firestore belum dikonfigurasi. Setel FIREBASE_SERVICE_ACCOUNT_JSON dan FIREBASE_PROJECT_ID.",
    );

const app = buatAplikasi({ penyimpanan, konfigurasi });

const server = app.listen(konfigurasi.port, "0.0.0.0", () => {
  console.log(
    JSON.stringify({
      tingkat: "info",
      pesan: "Nasabku berjalan",
      port: konfigurasi.port,
      lingkungan: konfigurasi.lingkungan,
      penyimpanan: konfigurasi.firestore
        ? `firestore:${konfigurasi.firestore.projectId}`
        : "belum dikonfigurasi",
      ...(konfigurasi.firestoreMasalah ? { catatan: konfigurasi.firestoreMasalah } : {}),
    }),
  );
});

async function tutup(sinyal: string): Promise<void> {
  console.log(JSON.stringify({ tingkat: "info", pesan: `Menerima ${sinyal}, menutup server.` }));
  server.close(() => {
    void penyimpanan
      .tutup()
      .catch(() => undefined)
      .finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", () => {
  void tutup("SIGTERM");
});
process.on("SIGINT", () => {
  void tutup("SIGINT");
});
