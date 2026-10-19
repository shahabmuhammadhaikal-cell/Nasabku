import { errorEnvelope, successEnvelope } from "@nasabku/shared";
import { Router } from "express";
import type { ApiDeps } from "../types/context";

/**
 * Kesehatan: /live selalu 200 (proses hidup); /ready 200 bila
 * Firestore dapat dijangkau (dengan batas waktu 2 detik),
 * selain itu 503. Tidak ada detail internal pada respons.
 */
export function healthRouter(deps: ApiDeps): Router {
  const { db } = deps;
  const router = Router();

  router.get("/live", (req, res) => {
    res.status(200).json(successEnvelope({ status: "ok" }, req.requestId ?? "req_unknown"));
  });

  router.get("/ready", async (req, res) => {
    const rid = req.requestId ?? "req_unknown";
    try {
      await Promise.race([
        db.collection("_health").doc("ready").get(),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error("ready check timeout")), 2000).unref?.();
        }),
      ]);
      res.status(200).json(successEnvelope({ status: "ok" }, rid));
    } catch {
      res.status(503).json(errorEnvelope("INTERNAL_ERROR", "Layanan belum siap.", rid));
    }
  });

  return router;
}
