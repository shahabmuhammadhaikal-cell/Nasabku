import { ApiError, type Role } from "@nasabku/shared";
import type { Auth } from "firebase-admin/auth";
import { Timestamp, type Firestore } from "firebase-admin/firestore";
import { buildAuditDoc } from "./audit";
import { listUserMemberships, toIso } from "./user";

export interface WorkspaceDto {
  id: string;
  name: string;
  slug: string;
  status: string;
  role?: string;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface MemberDto {
  userId: string;
  email: string | null;
  name: string | null;
  role: string;
  status: string;
  grantedBy: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface AuditEventDto {
  id: string;
  action: string;
  actorType: string;
  actorUserId: string | null;
  workspaceId: string | null;
  resourceType: string;
  resourceId: string | null;
  requestId: string;
  outcome: string;
  metadata: Record<string, unknown> | null;
  timestamp: string | null;
}

function workspaceDto(id: string, data: Record<string, unknown>, role?: string): WorkspaceDto {
  return {
    id,
    name: String(data.name ?? ""),
    slug: String(data.slug ?? ""),
    status: String(data.status ?? ""),
    ...(role ? { role } : {}),
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
  };
}

/**
 * Buat workspace + keanggotaan PLATFORM_ADMIN + audit dalam SATU
 * transaksi. Slug dikunci lewat dokumen sentinel `workspaceSlugs/{slug}`
 * sehingga slug unik secara atomik (balapan → 409, bukan dokumen ganda).
 */
export async function createWorkspace(
  db: Firestore,
  input: { name: string; slug: string; userId: string; requestId: string },
): Promise<WorkspaceDto> {
  const wsRef = db.collection("workspaces").doc();
  const slugRef = db.collection("workspaceSlugs").doc(input.slug);
  const memRef = wsRef.collection("memberships").doc(input.userId);
  const now = Timestamp.now();

  await db.runTransaction(async (tx) => {
    const slugSnap = await tx.get(slugRef);
    if (slugSnap.exists) {
      throw ApiError.conflict("Slug sudah digunakan oleh workspace lain.", [
        { field: "slug", reason: "ALREADY_EXISTS" },
      ]);
    }
    tx.set(wsRef, {
      name: input.name,
      slug: input.slug,
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    });
    tx.set(slugRef, { workspaceId: wsRef.id });
    tx.set(memRef, {
      userId: input.userId,
      workspaceId: wsRef.id,
      role: "PLATFORM_ADMIN",
      status: "ACTIVE",
      grantedBy: input.userId,
      createdAt: now,
      updatedAt: now,
    });
    tx.set(
      db.collection("auditEvents").doc(),
      buildAuditDoc({
        action: "workspace.created",
        actorType: "user",
        actorUserId: input.userId,
        workspaceId: wsRef.id,
        resourceType: "workspace",
        resourceId: wsRef.id,
        requestId: input.requestId,
        outcome: "success",
        metadata: { slug: input.slug },
      }),
    );
  });

  return workspaceDto(
    wsRef.id,
    { name: input.name, slug: input.slug, status: "ACTIVE", createdAt: now, updatedAt: now },
    "PLATFORM_ADMIN",
  );
}

export async function getWorkspace(
  db: Firestore,
  workspaceId: string,
): Promise<WorkspaceDto> {
  const snap = await db.doc(`workspaces/${workspaceId}`).get();
  if (!snap.exists) throw ApiError.notFound();
  return workspaceDto(snap.id, snap.data() as Record<string, unknown>);
}

export async function updateWorkspace(
  db: Firestore,
  input: { workspaceId: string; name: string; actorUid: string; requestId: string },
): Promise<WorkspaceDto> {
  const ref = db.doc(`workspaces/${input.workspaceId}`);
  const now = Timestamp.now();
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw ApiError.notFound();
    tx.set(ref, { name: input.name, updatedAt: now }, { merge: true });
    tx.set(
      db.collection("auditEvents").doc(),
      buildAuditDoc({
        action: "workspace.updated",
        actorType: "user",
        actorUserId: input.actorUid,
        workspaceId: input.workspaceId,
        resourceType: "workspace",
        resourceId: input.workspaceId,
        requestId: input.requestId,
        outcome: "success",
        metadata: { field: "name" },
      }),
    );
  });
  const snap = await ref.get();
  return workspaceDto(snap.id, snap.data() as Record<string, unknown>);
}

/** Workspace yang menjadi milik pengguna (keanggotaan aktif). */
export async function listWorkspacesForUser(
  db: Firestore,
  uid: string,
): Promise<WorkspaceDto[]> {
  const memberships = (await listUserMemberships(db, uid)).filter(
    (m) => m.status === "ACTIVE" && m.workspaceId,
  );
  if (memberships.length === 0) return [];
  const refs = memberships.map((m) => db.doc(`workspaces/${m.workspaceId}`));
  const snaps = await db.getAll(...refs);
  const roleByWs = new Map(memberships.map((m) => [m.workspaceId, m.role]));
  return snaps
    .filter((s) => s.exists)
    .map((s) => workspaceDto(s.id, s.data() as Record<string, unknown>, roleByWs.get(s.id)));
}

function memberDto(userId: string, mem: Record<string, unknown>, user: Record<string, unknown> | undefined): MemberDto {
  return {
    userId,
    email: typeof user?.email === "string" ? user.email : null,
    name: typeof user?.name === "string" ? user.name : null,
    role: String(mem.role ?? ""),
    status: String(mem.status ?? ""),
    grantedBy: typeof mem.grantedBy === "string" ? mem.grantedBy : null,
    createdAt: toIso(mem.createdAt),
    updatedAt: toIso(mem.updatedAt),
  };
}

export async function listMembers(db: Firestore, workspaceId: string): Promise<MemberDto[]> {
  const snap = await db.collection(`workspaces/${workspaceId}/memberships`).get();
  const mems = snap.docs.map((d) => ({ userId: d.id, data: d.data() }));
  if (mems.length === 0) return [];
  const userRefs = mems.map((m) => db.collection("users").doc(m.userId));
  const userSnaps = await db.getAll(...userRefs);
  const usersById = new Map(
    userSnaps.map((s) => [s.id, s.exists ? (s.data() as Record<string, unknown>) : undefined]),
  );
  return mems.map((m) => memberDto(m.userId, m.data, usersById.get(m.userId)));
}

/**
 * Tambah anggota (undangan fase menyusul): pengguna harus sudah ada
 * di Firebase Auth. Konflik bila sudah menjadi anggota aktif.
 * Mutasi + audit dalam satu transaksi.
 */
export async function addMember(
  db: Firestore,
  firebaseAuth: Auth,
  input: {
    workspaceId: string;
    email: string;
    role: Role;
    actorUid: string;
    requestId: string;
  },
): Promise<MemberDto> {
  const email = input.email.trim().toLowerCase();
  let authUser: { uid: string; emailVerified?: boolean; displayName?: string };
  try {
    authUser = await firebaseAuth.getUserByEmail(email);
  } catch {
    throw ApiError.notFound("Pengguna dengan email tersebut tidak terdaftar.");
  }

  const memRef = db.collection(`workspaces/${input.workspaceId}/memberships`).doc(authUser.uid);
  const userRef = db.collection("users").doc(authUser.uid);
  const now = Timestamp.now();

  await db.runTransaction(async (tx) => {
    const mem = await tx.get(memRef);
    const user = await tx.get(userRef);
    if (mem.exists && (mem.data() as { status?: string }).status === "ACTIVE") {
      throw ApiError.conflict("Pengguna sudah menjadi anggota aktif workspace ini.", [
        { field: "email", reason: "ALREADY_MEMBER" },
      ]);
    }
    tx.set(memRef, {
      userId: authUser.uid,
      workspaceId: input.workspaceId,
      role: input.role,
      status: "ACTIVE",
      grantedBy: input.actorUid,
      createdAt: now,
      updatedAt: now,
    });
    if (!user.exists) {
      tx.set(userRef, {
        uid: authUser.uid,
        email,
        name: typeof authUser.displayName === "string" ? authUser.displayName : null,
        emailVerified: Boolean(authUser.emailVerified),
        status: "ACTIVE",
        createdAt: now,
        updatedAt: now,
      });
    }
    tx.set(
      db.collection("auditEvents").doc(),
      buildAuditDoc({
        action: "member.added",
        actorType: "user",
        actorUserId: input.actorUid,
        workspaceId: input.workspaceId,
        resourceType: "membership",
        resourceId: authUser.uid,
        requestId: input.requestId,
        outcome: "success",
        metadata: { targetUserId: authUser.uid, role: input.role },
      }),
    );
  });

  const [memSnap, userSnap] = await Promise.all([memRef.get(), userRef.get()]);
  return memberDto(
    authUser.uid,
    memSnap.data() as Record<string, unknown>,
    userSnap.exists ? (userSnap.data() as Record<string, unknown>) : undefined,
  );
}

export type AuditActionName = "member.updated" | "member.removed";

/**
 * Ubah/cabut keanggotaan.
 *
 * Aturan:
 * - Tidak bisa mengubah keanggotaan sendiri (pemisahan tugas).
 * - Workspace tidak boleh kehilangan PLATFORM_ADMIN aktif terakhir.
 * - Pencabutan = status REVOKED (soft-revoke, jejak tetap untuk audit).
 * Mutasi + audit dalam satu transaksi.
 */
export async function changeMember(
  db: Firestore,
  input: {
    workspaceId: string;
    targetUid: string;
    role?: Role;
    status?: "ACTIVE" | "REVOKED";
    actorUid: string;
    requestId: string;
    auditAction: AuditActionName;
  },
): Promise<MemberDto> {
  if (input.targetUid === input.actorUid) {
    throw ApiError.forbidden("Anda tidak dapat mengubah keanggotaan Anda sendiri.");
  }
  const memCol = db.collection(`workspaces/${input.workspaceId}/memberships`);
  const now = Timestamp.now();

  const memSnap = await db.runTransaction(async (tx) => {
    const all = await tx.get(memCol);
    const targetDoc = all.docs.find((d) => d.id === input.targetUid);
    if (!targetDoc || !targetDoc.exists) {
      throw ApiError.notFound("Keanggotaan tidak ditemukan.");
    }
    const target = targetDoc.data() as Record<string, unknown>;
    const nextRole = input.role ?? String(target.role ?? "");
    const nextStatus = input.status ?? String(target.status ?? "");

    const wasActiveAdmin = target.role === "PLATFORM_ADMIN" && target.status === "ACTIVE";
    const willBeActiveAdmin = nextRole === "PLATFORM_ADMIN" && nextStatus === "ACTIVE";
    if (wasActiveAdmin && !willBeActiveAdmin) {
      const remainingAdmins = all.docs.filter((d) => {
        if (d.id === input.targetUid) return false;
        const x = d.data() as Record<string, unknown>;
        return x.role === "PLATFORM_ADMIN" && x.status === "ACTIVE";
      }).length;
      if (remainingAdmins === 0) {
        throw ApiError.conflict(
          "Workspace harus memiliki minimal satu PLATFORM_ADMIN aktif.",
          [{ field: "role", reason: "LAST_ADMIN" }],
        );
      }
    }

    const patch: Record<string, unknown> = { updatedAt: now };
    if (input.role !== undefined) patch.role = input.role;
    if (input.status !== undefined) patch.status = input.status;
    tx.set(targetDoc.ref, patch, { merge: true });

    tx.set(
      db.collection("auditEvents").doc(),
      buildAuditDoc({
        action: input.auditAction,
        actorType: "user",
        actorUserId: input.actorUid,
        workspaceId: input.workspaceId,
        resourceType: "membership",
        resourceId: input.targetUid,
        requestId: input.requestId,
        outcome: "success",
        metadata: {
          targetUserId: input.targetUid,
          ...(input.role !== undefined ? { role: input.role } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
        },
      }),
    );
    return targetDoc.ref;
  });

  const [fresh, userSnap] = await Promise.all([
    memSnap.get(),
    db.collection("users").doc(input.targetUid).get(),
  ]);
  return memberDto(
    input.targetUid,
    (fresh.data() ?? {}) as Record<string, unknown>,
    userSnap.exists ? (userSnap.data() as Record<string, unknown>) : undefined,
  );
}

export interface AuditPage {
  items: AuditEventDto[];
  nextCursor: string | null;
}

/** Halaman riwayat audit satu workspace (urut terbaru, kursor = id dokumen). */
export async function listAuditEvents(
  db: Firestore,
  input: { workspaceId: string; action?: string; limit: number; cursor?: string },
): Promise<AuditPage> {
  let query = db
    .collection("auditEvents")
    .where("workspaceId", "==", input.workspaceId)
    .orderBy("timestamp", "desc");
  if (input.action) {
    query = query.where("action", "==", input.action) as typeof query;
  }
  query = query.limit(input.limit + 1);

  if (input.cursor) {
    const cursorSnap = await db.doc(`auditEvents/${input.cursor}`).get();
    if (!cursorSnap.exists) {
      throw ApiError.validation("Kursor tidak valid.", [{ field: "cursor", reason: "INVALID_CURSOR" }]);
    }
    query = query.startAfter(cursorSnap) as typeof query;
  }

  const snap = await query.get();
  const pageDocs = snap.docs.slice(0, input.limit);
  const items = pageDocs.map((d) => {
    const data = d.data() as Record<string, unknown>;
    return {
      id: d.id,
      action: String(data.action ?? ""),
      actorType: String(data.actorType ?? ""),
      actorUserId: typeof data.actorUserId === "string" ? data.actorUserId : null,
      workspaceId: typeof data.workspaceId === "string" ? data.workspaceId : null,
      resourceType: String(data.resourceType ?? ""),
      resourceId: typeof data.resourceId === "string" ? data.resourceId : null,
      requestId: String(data.requestId ?? ""),
      outcome: String(data.outcome ?? ""),
      metadata: (data.metadata as Record<string, unknown> | null) ?? null,
      timestamp: toIso(data.timestamp),
    };
  });
  const nextCursor = snap.docs.length > input.limit ? (pageDocs[pageDocs.length - 1]?.id ?? null) : null;
  return { items, nextCursor };
}
