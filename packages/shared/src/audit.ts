/**
 * Jenis audit — append-only.
 *
 * Metadata hanya berisi nilai non-rahasia dan semantik; kata sandi,
 * token, isi dokumen, dan PII berlebihan dilarang masuk metadata.
 * Layanan audit melakukan redaksi terakhir sebelum menulis.
 */

export const AUDIT_ACTIONS = [
  "user.login",
  "user.login_failed",
  "user.logout",
  "user.registered",
  "workspace.created",
  "workspace.updated",
  "member.added",
  "member.updated",
  "member.removed",
  "person.created",
  "person.updated",
  "person.deleted",
  "person.source_added",
  "person.source_removed",
  "access.denied",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export type ActorType = "user" | "api_client" | "system";
export type AuditOutcome = "success" | "failure";

export interface AuditEventInput {
  action: AuditAction;
  actorType: ActorType;
  actorUserId?: string | null;
  workspaceId?: string | null;
  resourceType: string;
  resourceId?: string | null;
  requestId: string;
  outcome: AuditOutcome;
  metadata?: Record<string, string | number | boolean | null>;
}

/** Kunci metadata yang tidak boleh pernah ditulis ke audit. */
export const FORBIDDEN_METADATA_KEYS = [
  "password",
  "passwordhash",
  "token",
  "idtoken",
  "sessiontoken",
  "cookie",
  "authorization",
  "secret",
  "apikey",
  "privatekey",
  "quote",
  "quotation",
];

/**
 * Redaksi metadata audit: buang kunci terlarang dan paksa nilai
 * ke tipe sederhana (string/number/boolean/null).
 */
export function sanitizeAuditMetadata(
  metadata: Record<string, unknown> | undefined,
): Record<string, string | number | boolean | null> | undefined {
  if (!metadata) return undefined;
  const out: Record<string, string | number | boolean | null> = {};
  for (const [rawKey, value] of Object.entries(metadata)) {
    const key = rawKey.toLowerCase();
    if (FORBIDDEN_METADATA_KEYS.some((forbidden) => key.includes(forbidden))) continue;
    if (value === null || value === undefined) {
      out[rawKey] = null;
    } else if (typeof value === "string") {
      out[rawKey] = value.length > 500 ? `${value.slice(0, 500)}…` : value;
    } else if (typeof value === "number" || typeof value === "boolean") {
      out[rawKey] = value;
    } else {
      // Objek/array tidak disimpan — cukup tipenya saja (redaksi).
      out[rawKey] = `[${Array.isArray(value) ? "array" : typeof value}]`;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}
