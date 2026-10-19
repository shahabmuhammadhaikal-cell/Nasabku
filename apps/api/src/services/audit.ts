import type { AuditEventInput } from "@nasabku/shared";
import { sanitizeAuditMetadata } from "@nasabku/shared";
import { FieldValue, type Firestore } from "firebase-admin/firestore";

/**
 * Bangun dokumen audit (append-only). Metadata diredaksi dulu —
 * rahasia dan PII berlebihan tidak pernah tersimpan.
 */
export function buildAuditDoc(input: AuditEventInput): Record<string, unknown> {
  const metadata = sanitizeAuditMetadata(input.metadata);
  return {
    action: input.action,
    actorType: input.actorType,
    actorUserId: input.actorUserId ?? null,
    workspaceId: input.workspaceId ?? null,
    resourceType: input.resourceType,
    resourceId: input.resourceId ?? null,
    requestId: input.requestId,
    outcome: input.outcome,
    ...(metadata ? { metadata } : {}),
    timestamp: FieldValue.serverTimestamp(),
  };
}

/** Tulis satu peristiwa audit. */
export async function recordAudit(db: Firestore, input: AuditEventInput): Promise<void> {
  await db.collection("auditEvents").add(buildAuditDoc(input));
}
