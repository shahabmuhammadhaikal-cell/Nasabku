import { fileURLToPath } from "node:url";
import express, { type Express } from "express";
import type { DatabaseSync } from "node:sqlite";
import type { Konfigurasi } from "./config.js";
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
  db: DatabaseSync;
  konfigurasi: Konfigurasi;
}

export function buatAplikasi({ db, konfigurasi }: KetergantunganAplikasi): Express {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  app.use(idPermintaan);
  app.use(express.json({ limit: "100kb" }));
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "same-origin");
    next();
  });

  const api = express.Router();
  api.use("/health", ruteKesehatan(db, konfigurasi));
  api.use("/auth", ruteAuth(db, konfigurasi));

  api.use("/workspaces", wajibMasuk(db), ruteRuangKerja(db));
  api.use("/workspaces/:workspaceId/persons", wajibMasuk(db), muatRuangKerja(db), ruteOrang(db));
  api.use("/workspaces/:workspaceId/relations", wajibMasuk(db), muatRuangKerja(db), ruteRelasi(db));
  api.use("/workspaces/:workspaceId/tree", wajibMasuk(db), muatRuangKerja(db), ruteSilsilah(db));

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
