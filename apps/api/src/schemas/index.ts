import { AUDIT_ACTIONS, ROLES } from "@nasabku/shared";
import { z } from "zod";
import { SLUG_PATTERN } from "../lib/slug";
import { SOURCE_KINDS } from "../services/person";

export const loginSchema = z.object({
  idToken: z.string().min(16).max(40000),
});

/** Pendaftaran langsung via backend (tanpa SDK klien). */
export const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
  password: z.string().min(8).max(72),
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

/**
 * Skema individu (entitas nasab historis).
 *
 - Tanggal dibuat bebas format (max 40 karakter) karena data historis
   sering hanya memuat tahun atau format tak standar, mis. "1331".
 - Relasi (ayah/ibu/pasangan) menyimpan ID dokumen person di workspace
   yang sama; validasi keberadaan dilakukan di layanan.
 */
const personIdField = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_-]{4,64}$/)
  .nullish();

const optionalText = (max: number) =>
  z.string().trim().max(max).nullish().transform((v) => (v === "" ? null : v));

export const personCreateSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    gender: z.enum(["L", "P", ""]).optional(),
    birthDate: optionalText(40),
    birthPlace: optionalText(160),
    deathDate: optionalText(40),
    deathPlace: optionalText(160),
    fatherId: personIdField,
    motherId: personIdField,
    spouseId: personIdField,
    notes: optionalText(2000),
  })
  .refine(
    (v) =>
      (!v.fatherId || v.fatherId !== v.motherId) &&
      (!v.fatherId || v.fatherId !== v.spouseId) &&
      (!v.motherId || v.motherId !== v.spouseId),
    { message: "INVALID_RELATION" },
  );

export const personPatchSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    gender: z.enum(["L", "P", ""]).optional(),
    birthDate: optionalText(40),
    birthPlace: optionalText(160),
    deathDate: optionalText(40),
    deathPlace: optionalText(160),
    fatherId: personIdField,
    motherId: personIdField,
    spouseId: personIdField,
    notes: optionalText(2000),
  })
  .refine(
    (v) => {
      const k = Object.values(v);
      return k.some((x) => x !== undefined);
    },
    { message: "NO_CHANGES" },
  )
  .refine(
    (v) =>
      (!v.fatherId || v.fatherId !== v.motherId) &&
      (!v.fatherId || v.fatherId !== v.spouseId) &&
      (!v.motherId || v.motherId !== v.spouseId),
    { message: "INVALID_RELATION" },
  );

export const sourceCreateSchema = z.object({
  kind: z.enum(SOURCE_KINDS),
  title: z.string().trim().min(2).max(160),
  ref: optionalText(400),
  notes: optionalText(1000),
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
