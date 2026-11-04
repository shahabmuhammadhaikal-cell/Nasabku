import { ApiError } from "@nasabku/shared";
import type { Logger } from "pino";

/**
 * Pustaka tahap — pembalut satu operasi I/O (Firestore/Firebase Auth)
 * dengan nama tahap yang jelas. Mayoritas penyebab gangguan 500 ialah
 * kegagalan operasional (izin/indeks/kuota), bukan cacat kode, karena
 * itu tiap tahap:
 * - dicatat di log berlevel error lengkap dengan err mentah;
 * - diubah menjadi ApiError 500 generik yang membawa diagnostik
 *   { stage, dbCode } — bagian "tahap bernama + kode database".
 */

/** Ambil kode galat Firestore/Admin SDK dari galat asing, dengan aman. */
export function kodeDatabase(err: unknown): string | undefined {
  if (!err || typeof err !== "object") return undefined;
  const kandidat = err as { code?: unknown; extraInfo?: { code?: unknown } };
  if (typeof kandidat.code === "string" && kandidat.code.length > 0) {
    return kandidat.code;
  }
  if (typeof kandidat.extraInfo?.code === "string" && kandidat.extraInfo.code.length > 0) {
    return kandidat.extraInfo.code;
  }
  return undefined;
}

/**
 * Jalankan satu operasi di dalam tahap bernama. Galat ApiError
 * diwariskan apa adanya (tetap memakai status yang telah ditetapkan
 * penelepon); galat lain dikonversi menjadi 500 generik yang membawa
 * diagnostik { stage, dbCode }.
 */
export async function denganTahap<T>(
  logger: Logger,
  requestId: string,
  stage: string,
  operation: () => Promise<T>,
  message = "Operasi gagal. Coba lagi nanti.",
): Promise<T> {
  try {
    return await operation();
  } catch (err) {
    if (err instanceof ApiError) {
      logger.warn({ stage, requestId, code: err.code, status: err.status }, "tahap gagal: ApiError");
      throw err;
    }
    const dbCode = kodeDatabase(err);
    logger.error({ stage, requestId, err }, "tahap gagal");
    const apiError = ApiError.internal(message);
    apiError.debug = { stage, dbCode };
    throw apiError;
  }
}
