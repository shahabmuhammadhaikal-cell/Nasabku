import { describe, expect, it } from "vitest";
import {
  PERMISSIONS,
  ROLES,
  ROLE_PERMISSIONS,
  hasPermission,
  isRole,
  permissionsForRole,
} from "../src/index";

describe("RBAC matriks peran–izin", () => {
  it("setiap peran hanya mendapat izin yang ada di daftar izin", () => {
    for (const role of ROLES) {
      for (const perm of ROLE_PERMISSIONS[role]) {
        expect(PERMISSIONS).toContain(perm);
      }
    }
  });

  it("deny by default: peran/izin tak dikenal ditolak", () => {
    expect(hasPermission("HACKER", "claim:decide")).toBe(false);
    expect(hasPermission("PLATFORM_ADMIN", "claim:hack")).toBe(false);
    expect(hasPermission(undefined, "workspace:read")).toBe(false);
    expect(hasPermission(null, "workspace:read")).toBe(false);
    expect(hasPermission("PLATFORM_ADMIN", undefined)).toBe(false);
    expect(isRole("PLATFORM_ADMIN")).toBe(true);
    expect(isRole("platform_admin")).toBe(false);
  });

  it("pemisahan tugas: PLATFORM_ADMIN tidak boleh memutuskan klaim substantif", () => {
    expect(hasPermission("PLATFORM_ADMIN", "claim:decide")).toBe(false);
    expect(hasPermission("PLATFORM_ADMIN", "person:write")).toBe(false);
    expect(hasPermission("PLATFORM_ADMIN", "member:invite")).toBe(true);
    expect(hasPermission("PLATFORM_ADMIN", "audit:read")).toBe(true);
  });

  it("pemisahan tugas: SUBMITTER/REVIEWER tidak boleh memutuskan klaim", () => {
    expect(hasPermission("SUBMITTER", "claim:decide")).toBe(false);
    expect(hasPermission("SUBMITTER", "claim:submit")).toBe(true);
    expect(hasPermission("REVIEWER", "claim:review")).toBe(true);
    expect(hasPermission("REVIEWER", "claim:decide")).toBe(false);
  });

  it("AUTHORITY_SIGNER memutuskan klaim & sertifikat tapi tidak mengelola akses", () => {
    expect(hasPermission("AUTHORITY_SIGNER", "claim:decide")).toBe(true);
    expect(hasPermission("AUTHORITY_SIGNER", "certificate:issue")).toBe(true);
    expect(hasPermission("AUTHORITY_SIGNER", "member:update")).toBe(false);
    expect(hasPermission("AUTHORITY_SIGNER", "member:invite")).toBe(false);
  });

  it("AUDITOR bersifat baca-saja", () => {
    expect(hasPermission("AUDITOR", "audit:read")).toBe(true);
    expect(hasPermission("AUDITOR", "person:write")).toBe(false);
    expect(hasPermission("AUDITOR", "claim:submit")).toBe(false);
    expect(hasPermission("AUDITOR", "member:remove")).toBe(false);
  });

  it("RESEARCHER menulis data kerja tetapi tidak memutuskan klaim", () => {
    expect(hasPermission("RESEARCHER", "person:write")).toBe(true);
    expect(hasPermission("RESEARCHER", "source:write")).toBe(true);
    expect(hasPermission("RESEARCHER", "claim:submit")).toBe(true);
    expect(hasPermission("RESEARCHER", "claim:decide")).toBe(false);
    expect(hasPermission("RESEARCHER", "certificate:issue")).toBe(false);
  });

  it("INTEGRATION_CLIENT kosong (cakupan diberikan per API client, Fase 6)", () => {
    expect(ROLE_PERMISSIONS.INTEGRATION_CLIENT).toHaveLength(0);
    expect(hasPermission("INTEGRATION_CLIENT", "workspace:read")).toBe(false);
  });

  it("permissionsForRole aman untuk nilai acak", () => {
    expect(permissionsForRole("bogus")).toEqual([]);
    expect(permissionsForRole("AUDITOR")).toContain("audit:read");
  });
});
