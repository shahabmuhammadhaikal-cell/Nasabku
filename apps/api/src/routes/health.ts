import { successEnvelope } from "@nasabku/shared";
import { Router } from "express";
import type { ApiDeps } from "../types/context";

/**
 * Kesehatan:
 *  /live  — 200 selama proses hidup.
 *  /ready — 200 selama proses hidup dan konfigurasi termuat; status
 *           jangkauan Firestore dilaporkan sebagai keterangan
 *           (`database: "tersedia" | "tidak tersedia"`), BUKAN 503.
 *
 * Alasan /ready tidak 503 saat Firestore gagal: Render memakai
 * healthCheckPath untuk memutuskan apakah build baru boleh menggantikan
 * instance lama. Bila pemeriksaan ini bergantung pada Firestore dan
 * Firestore sedang bermasalah (izin IAM, API mati, gangguan jaringan),
 * Render menolak promosi — instance lama terus disajikan, sementara
 * perbaikan dan diagnostik di build baru tak pernah aktif. Itu justru
 * membuat gangguan izin berubah menjadi kebuntuan deploy.
 *
 * Jadi: kesiapan = "proses ini bisa melayani permintaan". Kegagalan
 * database tampil jujur di sini sebagai keterangan, dan di rute data
 * sebagai galat 500 berlabel tahap + kode database.
 */
export function healthRouter(deps: ApiDeps): Router {
  const { db } = deps;
  const router = Router();

  router.get("/live", (req, res) => {
    res.status(200).json(successEnvelope({ status: "ok" }, req.requestId ?? "req_unknown"));
  });

  router.get("/ready", async (req, res) => {
    const rid = req.requestId ?? "req_unknown";
    const database = await dbTerjangkau();
    res.status(200).json(
      successEnvelope(
        {
          status: database ? "siap" : "siap-terbatas",
          database: database ? "tersedia" : "tidak tersedia",
        },
        rid,
      ),
    );
  });

  /** Satu baca ringan ke Firestore; gagal/timeout dianggap "tidak tersedia". */
  async function dbTerjangkau(): Promise<boolean> {
    try {
      await Promise.race([
        db.collection("_health").doc("ready").get(),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error("ready check timeout")), 2000).unref?.();
        }),
      ]);
      return true;
    } catch {
      return false;
    }
  }

  return router;
}
