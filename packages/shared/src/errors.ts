/**
 * Kontrak error dan sukses API yang konsisten.
 *
 * Sukses : { data, meta: { requestId } }
 * Gagal  : { error: { code, message, details?, requestId } }
 *
 * Pesan tidak boleh membocorkan keberadaan data yang tidak boleh
 * diketahui pemohon (mis. individu privat) — gunakan NOT_FOUND generik.
 */

export const ERROR_CODES = [
  "VALIDATION_ERROR",
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "RATE_LIMITED",
  "INTERNAL_ERROR",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ErrorDetail {
  field: string;
  reason: string;
}

export interface ErrorEnvelope {
  error: {
    code: ErrorCode;
    message: string;
    details?: ErrorDetail[];
    requestId: string;
  };
}

export interface SuccessEnvelope<T> {
  data: T;
  meta: { requestId: string };
}

export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: ErrorDetail[];

  constructor(code: ErrorCode, status: number, message: string, details?: ErrorDetail[]) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }

  static validation(message: string, details: ErrorDetail[]): ApiError {
    return new ApiError("VALIDATION_ERROR", 400, message, details);
  }

  static unauthenticated(message = "Autentikasi diperlukan."): ApiError {
    return new ApiError("UNAUTHENTICATED", 401, message);
  }

  static forbidden(message = "Anda tidak memiliki izin untuk melakukan aksi ini."): ApiError {
    return new ApiError("FORBIDDEN", 403, message);
  }

  static notFound(message = "Sumber daya tidak ditemukan."): ApiError {
    return new ApiError("NOT_FOUND", 404, message);
  }

  static conflict(message: string, details?: ErrorDetail[]): ApiError {
    return new ApiError("CONFLICT", 409, message, details);
  }

  static rateLimited(retryAfterSeconds: number): ApiError {
    return new ApiError(
      "RATE_LIMITED",
      429,
      `Terlalu banyak permintaan. Coba lagi dalam ${retryAfterSeconds} detik.`,
      [{ field: "rateLimit", reason: "RATE_LIMITED" }],
    );
  }

  static internal(message = "Terjadi kesalahan pada server."): ApiError {
    return new ApiError("INTERNAL_ERROR", 500, message);
  }
}

export function errorEnvelope(
  code: ErrorCode,
  message: string,
  requestId: string,
  details?: ErrorDetail[],
): ErrorEnvelope {
  return {
    error: {
      code,
      message,
      ...(details && details.length > 0 ? { details } : {}),
      requestId,
    },
  };
}

export function successEnvelope<T>(data: T, requestId: string): SuccessEnvelope<T> {
  return { data, meta: { requestId } };
}
