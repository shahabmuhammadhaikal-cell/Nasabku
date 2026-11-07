import { createHash, randomBytes } from "node:crypto";

export const NAMA_KUE_SESI = "nasabku_sesi";

/** Token acak yang dikirim ke peramban; hanya sidiknya yang disimpan di Firestore. */
export function buatTokenSesi(): string {
  return randomBytes(32).toString("base64url");
}

export function sidikToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
