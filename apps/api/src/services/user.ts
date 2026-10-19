import type { AuthContext } from "../types/context";
import type { Firestore } from "firebase-admin/firestore";
import { Timestamp } from "firebase-admin/firestore";
import { buildAuditDoc } from "./audit";

export interface UserProfile {
  uid: string;
  email: string;
  name: string | null;
  emailVerified: boolean;
}

export interface UserDto extends AuthContext {
  status: string;
  createdAt: string | null;
  lastLoginAt: string | null;
}

export interface MembershipSummary {
  workspaceId: string;
  role: string;
  status: string;
}

export function toIso(value: unknown): string | null {
  if (value && typeof value === "object" && "toMillis" in value) {
    try {
      return new Date((value as { toMillis: () => number }).toMillis()).toISOString();
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Upsert dokumen pengguna + audit user.login dalam SATU transaksi
 * (mutasi lastLoginAt dan audit konsisten).
 */
export async function upsertUserOnLogin(
  db: Firestore,
  profile: UserProfile,
  requestId: string,
): Promise<UserDto> {
  const ref = db.collection("users").doc(profile.uid);
  const now = Timestamp.now();
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const existing = snap.exists ? (snap.data() as Record<string, unknown>) : {};
    const status = typeof existing.status === "string" ? existing.status : "ACTIVE";
    const name =
      profile.name ?? (typeof existing.name === "string" ? existing.name : null);
    const createdAt = existing.createdAt ?? now;

    tx.set(
      ref,
      {
        uid: profile.uid,
        email: profile.email,
        name,
        status,
        emailVerified: profile.emailVerified,
        lastLoginAt: now,
        updatedAt: now,
        createdAt,
      },
      { merge: true },
    );

    tx.set(
      db.collection("auditEvents").doc(),
      buildAuditDoc({
        action: "user.login",
        actorType: "user",
        actorUserId: profile.uid,
        resourceType: "user",
        resourceId: profile.uid,
        requestId,
        outcome: "success",
        metadata: { emailVerified: profile.emailVerified },
      }),
    );

    return {
      uid: profile.uid,
      email: profile.email,
      name,
      emailVerified: profile.emailVerified,
      status,
      createdAt: toIso(createdAt),
      lastLoginAt: toIso(now),
    };
  });
}

export async function getUserById(db: Firestore, uid: string): Promise<AuthContext | null> {
  const snap = await db.collection("users").doc(uid).get();
  if (!snap.exists) return null;
  const data = snap.data() as Record<string, unknown>;
  return {
    uid,
    email: typeof data.email === "string" ? data.email : "",
    name: typeof data.name === "string" ? data.name : null,
    emailVerified: Boolean(data.emailVerified),
  };
}

/** Semua keanggotaan milik satu pengguna (collection group query). */
export async function listUserMemberships(
  db: Firestore,
  uid: string,
): Promise<MembershipSummary[]> {
  const snap = await db.collectionGroup("memberships").where("userId", "==", uid).get();
  return snap.docs.map((doc) => {
    const data = doc.data();
    return {
      workspaceId:
        typeof data.workspaceId === "string"
          ? data.workspaceId
          : (doc.ref.parent.parent?.id ?? ""),
      role: String(data.role ?? ""),
      status: String(data.status ?? ""),
    };
  });
}
