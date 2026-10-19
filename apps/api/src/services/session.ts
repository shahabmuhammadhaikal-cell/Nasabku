import { FieldValue, Timestamp, type Firestore } from "firebase-admin/firestore";
import { createHash, randomBytes } from "node:crypto";

function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/**
 * Sesi berbasis token acak tersimpan di Firestore (di-hash SHA-256).
 *
 * Keputusan desain (ADR-0001): memilih token sisi-server alih-alih
 * session cookie buatan Firebase Admin karena: (a) dapat dicabut
 * seketika (logout = hapus dokumen), (b) tidak bergantung pada
 * dukungan createSessionCookie di Emulator Suite, (c) TTL dan
 * pemeriksaan kedaluwarsa berada di bawah kendali kita.
 * Token asli tidak pernah disimpan — hanya hash-nya.
 */
export interface SessionRecord {
  uid: string;
  expiresAt: number;
}

export async function createSession(
  db: Firestore,
  uid: string,
  ttlMs: number,
): Promise<{ token: string; expiresAt: number }> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = Date.now() + ttlMs;
  await db.collection("sessions").doc(hashToken(token)).set({
    uid,
    createdAt: FieldValue.serverTimestamp(),
    expiresAt: Timestamp.fromMillis(expiresAt),
  });
  return { token, expiresAt };
}

export async function getSession(db: Firestore, token: string): Promise<SessionRecord | null> {
  if (!token || token.length < 16 || token.length > 512) return null;
  const ref = db.collection("sessions").doc(hashToken(token));
  const snap = await ref.get();
  if (!snap.exists) return null;
  const data = snap.data() as { uid?: unknown; expiresAt?: Timestamp };
  const expiresAt = data.expiresAt instanceof Timestamp ? data.expiresAt.toMillis() : 0;
  if (!data.uid || expiresAt <= Date.now()) {
    // Hapus sesi kedaluwarsa secara otoritatif.
    await ref.delete().catch(() => undefined);
    return null;
  }
  return { uid: String(data.uid), expiresAt };
}

export async function destroySession(db: Firestore, token: string): Promise<void> {
  if (!token) return;
  await db.collection("sessions").doc(hashToken(token)).delete();
}
