import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";

/** Memberi setiap permintaan sebuah id yang ikut tercatat di log dan di header balasan. */
export const idPermintaan: RequestHandler = (req, res, next) => {
  const dariKlien = req.header("x-request-id");
  const id = dariKlien && dariKlien.length <= 100 ? dariKlien : randomUUID();
  req.idPermintaan = id;
  res.setHeader("x-request-id", id);
  next();
};
