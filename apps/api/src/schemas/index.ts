import { AUDIT_ACTIONS, ROLES } from "@nasabku/shared";
import { z } from "zod";
import { SLUG_PATTERN } from "../lib/slug";

export const loginSchema = z.object({
  idToken: z.string().min(16).max(40000),
});

export const createWorkspaceSchema = z.object({
  name: z.string().trim().min(3).max(120),
  slug: z.string().trim().min(3).max(64).regex(SLUG_PATTERN).optional(),
});

export const updateWorkspaceSchema = z
  .object({
    name: z.string().trim().min(3).max(120).optional(),
  })
  .refine((v) => v.name !== undefined, {
    path: ["name"],
    message: "NO_CHANGES",
  });

export const addMemberSchema = z.object({
  email: z.email(),
  role: z.enum(ROLES),
});

export const changeMemberSchema = z
  .object({
    role: z.enum(ROLES).optional(),
    status: z.enum(["ACTIVE", "REVOKED"]).optional(),
  })
  .refine((v) => v.role !== undefined || v.status !== undefined, {
    path: ["role"],
    message: "NO_CHANGES",
  });

export const auditQuerySchema = z.object({
  workspaceId: z
    .string()
    .regex(/^[A-Za-z0-9_-]{3,64}$/),
  action: z.enum(AUDIT_ACTIONS).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z
    .string()
    .regex(/^[A-Za-z0-9_-]{4,64}$/)
    .optional(),
});
