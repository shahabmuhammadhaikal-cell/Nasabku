/**
 * RBAC untuk Nasabku.
 *
 * Prinsip:
 * - Deny by default: peran/permission yang tidak dikenal → false.
 * - PLATFORM_ADMIN TIDAK memiliki claim:decide (pemisahan tugas;
 *   keputusan substantif nasab hanya otoritas bersangkutan).
 * - AUTHORITY_SIGNER tidak memiliki member:* (penandatangan tidak
 *   mengelola akses).
 * - INTEGRATION_CLIENT kosong; cakupannya diberikan per API client
 *   melalui allowedScopes (Fase 6), bukan peran statis ini.
 */

export const ROLES = [
  "PLATFORM_ADMIN",
  "RESEARCHER",
  "SUBMITTER",
  "REVIEWER",
  "AUTHORITY_SIGNER",
  "AUDITOR",
  "INTEGRATION_CLIENT",
] as const;

export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  "workspace:read",
  "workspace:update",
  "workspace:create",
  "member:read",
  "member:invite",
  "member:update",
  "member:remove",
  "person:read",
  "person:write",
  "source:read",
  "source:write",
  "claim:read",
  "claim:write",
  "claim:submit",
  "claim:review",
  "claim:decide",
  "certificate:read",
  "certificate:issue",
  "certificate:revoke",
  "appeal:file",
  "appeal:review",
  "audit:read",
  "api_client:manage",
  "config:manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  PLATFORM_ADMIN: [
    "workspace:read",
    "workspace:update",
    "member:read",
    "member:invite",
    "member:update",
    "member:remove",
    "person:read",
    "source:read",
    "claim:read",
    "certificate:read",
    "audit:read",
    "api_client:manage",
    "config:manage",
  ],
  RESEARCHER: [
    "workspace:read",
    "member:read",
    "person:read",
    "person:write",
    "source:read",
    "source:write",
    "claim:read",
    "claim:write",
    "claim:submit",
  ],
  SUBMITTER: [
    "workspace:read",
    "person:read",
    "source:read",
    "claim:read",
    "claim:write",
    "claim:submit",
    "appeal:file",
  ],
  REVIEWER: [
    "workspace:read",
    "member:read",
    "person:read",
    "source:read",
    "claim:read",
    "claim:review",
  ],
  AUTHORITY_SIGNER: [
    "workspace:read",
    "person:read",
    "source:read",
    "claim:read",
    "claim:decide",
    "certificate:read",
    "certificate:issue",
    "certificate:revoke",
    "appeal:review",
  ],
  AUDITOR: [
    "workspace:read",
    "member:read",
    "person:read",
    "source:read",
    "claim:read",
    "certificate:read",
    "audit:read",
  ],
  INTEGRATION_CLIENT: [],
};

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

/**
 * Deny by default: peran tidak dikenal atau permission tidak dikenal → false.
 */
export function hasPermission(role: unknown, permission: unknown): boolean {
  if (!isRole(role) || typeof permission !== "string") return false;
  const perms = ROLE_PERMISSIONS[role] as readonly string[];
  return perms.includes(permission);
}

export function permissionsForRole(role: unknown): readonly Permission[] {
  if (!isRole(role)) return [];
  return ROLE_PERMISSIONS[role];
}
