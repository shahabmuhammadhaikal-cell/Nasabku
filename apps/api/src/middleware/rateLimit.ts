import { ApiError } from "@nasabku/shared";
import type { RequestHandler } from "express";

export interface RateLimiterOptions {
  windowMs: number;
  max: number;
  keyPrefix: string;
  /** Pengganti jam untuk pengujian deterministik. */
  now?: () => number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * Rate limit jendela tetap per-IP, in-memory.
 *
 * KETERBATASAN INTERIM: state per-instance — di belakang beberapa
 * instance Cloud Functions, limit menjadi per-instance. Pengganti
 * terdistribusi (Redis/Memorystore) menyusul di fase infrastruktur.
 */
export function createRateLimiter(options: RateLimiterOptions): RequestHandler {
  const { windowMs, max, keyPrefix } = options;
  const buckets = new Map<string, Bucket>();
  const now = options.now ?? (() => Date.now());

  return (req, res, next) => {
    const current = now();
    const ip = req.ip ?? req.socket.remoteAddress ?? "unknown";
    const key = `${keyPrefix}:${ip}`;

    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= current) {
      bucket = { count: 0, resetAt: current + windowMs };
      buckets.set(key, bucket);
    }
    bucket.count += 1;

    res.setHeader("X-RateLimit-Limit", String(max));
    res.setHeader("X-RateLimit-Remaining", String(Math.max(0, max - bucket.count)));

    if (bucket.count > max) {
      const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - current) / 1000));
      res.setHeader("Retry-After", String(retryAfter));
      next(ApiError.rateLimited(retryAfter));
      return;
    }

    // Pembersihan sambil jalan agar peta tidak tumbuh tanpa batas.
    if (buckets.size > 10_000) {
      for (const [k, v] of buckets) {
        if (v.resetAt <= current) buckets.delete(k);
      }
    }

    next();
  };
}
