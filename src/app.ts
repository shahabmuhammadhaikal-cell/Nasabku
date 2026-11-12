import { fileURLToPath } from "node:url";
import express, { type Express } from "express";
import type { Konfigurasi } from "./config.js";
import type { Penyimpanan } from "./data/penyimpanan.js";
import { ruteAuth } from "./routes/auth.js";
import { ruteKesehatan } from "./routes/health.js";
import { ruteOrang } from "./routes/orang.js";
import { ruteRelasi } from "./routes/relasi.js";
import { ruteRuangKerja } from "./routes/ruangKerja.js";
import { ruteSilsilah } from "./routes/silsilah.js";
import { muatRuangKerja, wajibMasuk } from "./middleware/auth.js";
import { ruteTidakAda, tanganiGalat } from "./middleware/galat.js";
import { idPermintaan } from "./middleware/idPermintaan.js";

export const DIREKTORI_PUBLIK = fileURLToPath(new URL("../public", import.meta.url));

export interface KetergantunganAplikasi {
  penyimpanan: Penyimpanan;
  konfigurasi: Konfigurasi;
}

export function buatAplikasi({ penyimpanan, konfigurasi }: KetergantunganAplikasi): Express {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  app.use(idPermintaan);
  // Badan JSON boleh memuat berkas GEDCOM untuk impor silsilah (sekitar 2000 orang).
  app.use(express.json({ limit: "2mb" }));
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "same-origin");
    next();
  });

  const api = express.Router();
  api.use("/health", ruteKesehatan(penyimpanan, konfigurasi));
  api.use("/auth", ruteAuth(penyimpanan, konfigurasi));

  api.use("/workspaces", wajibMasuk(penyimpanan), ruteRuangKerja(penyimpanan));
  api.use(
    "/workspaces/:workspaceId/persons",
    wajibMasuk(penyimpanan),
    muatRuangKerja(penyimpanan),
    ruteOrang(penyimpanan),
  );
  api.use(
    "/workspaces/:workspaceId/relations",
    wajibMasuk(penyimpanan),
    muatRuangKerja(penyimpanan),
    ruteRelasi(penyimpanan),
  );
  api.use(
    "/workspaces/:workspaceId/tree",
    wajibMasuk(penyimpanan),
    muatRuangKerja(penyimpanan),
    ruteSilsilah(penyimpanan),
  );

  api.use(ruteTidakAda);
  app.use("/api/v1", api);

  app.use(express.static(DIREKTORI_PUBLIK, { index: "index.html", maxAge: 0 }));

  // Semua jalur non-API dilayani aplikasi satu halaman.
  app.use((req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      next();
      return;
    }
    res.sendFile("index.html", { root: DIREKTORI_PUBLIK });
  });

  app.use(tanganiGalat);

  return app;
}
