import { describe, expect, it } from "vitest";
import type { ZodError } from "zod";
import { zodIssuesToDetails } from "../../src/lib/validation";
import {
  addMemberSchema,
  auditQuerySchema,
  changeMemberSchema,
  createWorkspaceSchema,
  loginSchema,
  updateWorkspaceSchema,
} from "../../src/schemas";

function detailsOf(result: { success: false; error: ZodError }) {
  return zodIssuesToDetails(result.error);
}

describe("Skema validasi rute", () => {
  it("login: idToken wajib dan berukuran wajar", () => {
    expect(loginSchema.safeParse({ idToken: "x".repeat(40) }).success).toBe(true);
    const bad = loginSchema.safeParse({});
    expect(bad.success).toBe(false);
    const details = detailsOf(bad as never);
    expect(details).toContainEqual(expect.objectContaining({ field: "idToken" }));
  });

  it("email tidak valid → INVALID_EMAIL; peran tidak dikenal → INVALID_VALUE", () => {
    const bad = addMemberSchema.safeParse({ email: "bukan-email", role: "HACKER" });
    expect(bad.success).toBe(false);
    const details = detailsOf(bad as never);
    expect(details).toContainEqual({ field: "email", reason: "INVALID_EMAIL" });
    expect(details).toContainEqual({ field: "role", reason: "INVALID_VALUE" });
  });

  it("email dinormalkan oleh layanan (skema menerima kapital), peran sah diterima", () => {
    const ok = addMemberSchema.safeParse({ email: "Budi@Contoh.ID", role: "AUDITOR" });
    expect(ok.success).toBe(true);
  });

  it("createWorkspace: nama terlalu pendek, slug harus pola yang sah", () => {
    const tooShort = createWorkspaceSchema.safeParse({ name: "ab" });
    expect(tooShort.success).toBe(false);
    expect(detailsOf(tooShort as never)).toContainEqual({
      field: "name",
      reason: "TOO_SMALL",
    });

    const badSlug = createWorkspaceSchema.safeParse({ name: "Nama Ruang", slug: "Slug Buruk!" });
    expect(badSlug.success).toBe(false);
    expect(detailsOf(badSlug as never)).toContainEqual(
      expect.objectContaining({ field: "slug" }),
    );

    expect(createWorkspaceSchema.safeParse({ name: "Nama Ruang", slug: "nama-ruang" }).success).toBe(
      true,
    );
  });

  it("updateWorkspace: tanpa perubahan → NO_CHANGES", () => {
    const empty = updateWorkspaceSchema.safeParse({});
    expect(empty.success).toBe(false);
    expect(detailsOf(empty as never)).toContainEqual({
      field: "name",
      reason: "NO_CHANGES",
    });
    expect(updateWorkspaceSchema.safeParse({ name: "Baru" }).success).toBe(true);
  });

  it("changeMember: butuh minimal satu field yang diubah", () => {
    expect(changeMemberSchema.safeParse({}).success).toBe(false);
    expect(changeMemberSchema.safeParse({ status: "REVOKED" }).success).toBe(true);
    expect(changeMemberSchema.safeParse({ status: "DISETUJUI" }).success).toBe(false);
  });

  it("auditQuery: limit di-coerce, aksi harus angka aksi yang dikenal", () => {
    const parsed = auditQuerySchema.safeParse({ workspaceId: "ws_123", limit: "50" });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.limit).toBe(50);

    const badAction = auditQuerySchema.safeParse({ workspaceId: "ws_123", action: "hack.bos" });
    expect(badAction.success).toBe(false);
    expect(detailsOf(badAction as never)).toContainEqual({
      field: "action",
      reason: "INVALID_VALUE",
    });

    const missingWs = auditQuerySchema.safeParse({});
    expect(missingWs.success).toBe(false);
    expect(detailsOf(missingWs as never)).toContainEqual(
      expect.objectContaining({ field: "workspaceId" }),
    );
  });
});
