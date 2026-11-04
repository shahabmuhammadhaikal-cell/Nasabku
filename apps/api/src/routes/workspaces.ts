import { ApiError, successEnvelope } from "@nasabku/shared";
import { Router } from "express";
import { requireAuth, requireWorkspacePermission } from "../middleware/auth";
import { SLUG_PATTERN, slugify } from "../lib/slug";
import {
  addMemberSchema,
  changeMemberSchema,
  createWorkspaceSchema,
  personCreateSchema,
  personPatchSchema,
  sourceCreateSchema,
  updateWorkspaceSchema,
} from "../schemas";
import {
  addMember,
  changeMember,
  createWorkspace,
  getWorkspace,
  getWorkspaceStats,
  listMembers,
  listWorkspacesForUser,
  updateWorkspace,
} from "../services/workspace";
import {
  ancestorsOf,
  createPerson,
  descendantsOf,
  createSource,
  deletePerson,
  deleteSource,
  listPersons,
  listSources,
  relationBetween,
  updatePerson,
} from "../services/person";
import type { ApiDeps } from "../types/context";

function paramId(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function workspacesRouter(deps: ApiDeps): Router {
  const { db, firebaseAuth } = deps;
  const router = Router();

  router.use(requireAuth);

  router.post("/", async (req, res) => {
    const rid = req.requestId ?? "req_unknown";
    const body = createWorkspaceSchema.parse(req.body);
    const slug = body.slug ?? slugify(body.name);
    if (!SLUG_PATTERN.test(slug) || slug.length < 3) {
      throw ApiError.validation("Slug tidak valid. Gunakan nama workspace lain.", [
        { field: "slug", reason: "INVALID_SLUG" },
      ]);
    }
    const workspace = await createWorkspace(db, {
      name: body.name,
      slug,
      userId: req.auth?.uid ?? "",
      requestId: rid,
    });
    res.status(201).json(successEnvelope({ workspace }, rid));
  });

  router.get("/", async (req, res) => {
    const rid = req.requestId ?? "req_unknown";
    const items = await listWorkspacesForUser(db, req.auth?.uid ?? "");
    res.status(200).json(successEnvelope({ items }, rid));
  });

  router.get(
    "/:workspaceId",
    requireWorkspacePermission(deps, "workspace:read"),
    async (req, res) => {
      const rid = req.requestId ?? "req_unknown";
      const workspace = await getWorkspace(db, req.workspace?.id ?? "");
      res.status(200).json(
        successEnvelope({ workspace: { ...workspace, role: req.workspace?.role } }, rid),
      );
    },
  );

  router.patch(
    "/:workspaceId",
    requireWorkspacePermission(deps, "workspace:update"),
    async (req, res) => {
      const rid = req.requestId ?? "req_unknown";
      const body = updateWorkspaceSchema.parse(req.body);
      if (body.name === undefined) {
        throw ApiError.validation("Tidak ada perubahan yang diberikan.", [
          { field: "name", reason: "NO_CHANGES" },
        ]);
      }
      const workspace = await updateWorkspace(db, {
        workspaceId: req.workspace?.id ?? "",
        name: body.name,
        actorUid: req.auth?.uid ?? "",
        requestId: rid,
      });
      res.status(200).json(
        successEnvelope({ workspace: { ...workspace, role: req.workspace?.role } }, rid),
      );
    },
  );

  router.get(
    "/:workspaceId/stats",
    requireWorkspacePermission(deps, "workspace:read"),
    async (req, res) => {
      const rid = req.requestId ?? "req_unknown";
      const stats = await getWorkspaceStats(db, req.workspace?.id ?? "");
      res.status(200).json(successEnvelope({ stats }, rid));
    },
  );

  router.get(
    "/:workspaceId/persons",
    requireWorkspacePermission(deps, "person:read"),
    async (req, res) => {
      const rid = req.requestId ?? "req_unknown";
      const items = await listPersons(db, req.workspace?.id ?? "");
      res.status(200).json(successEnvelope({ items }, rid));
    },
  );

  router.post(
    "/:workspaceId/persons",
    requireWorkspacePermission(deps, "person:write"),
    async (req, res) => {
      const rid = req.requestId ?? "req_unknown";
      const body = personCreateSchema.parse(req.body);
      const person = await createPerson(db, {
        workspaceId: req.workspace?.id ?? "",
        actorUid: req.auth?.uid ?? "",
        requestId: rid,
        data: {
          name: body.name,
          gender: body.gender,
          birthDate: body.birthDate ?? null,
          birthPlace: body.birthPlace ?? null,
          deathDate: body.deathDate ?? null,
          deathPlace: body.deathPlace ?? null,
          fatherId: body.fatherId ?? null,
          motherId: body.motherId ?? null,
          spouseId: body.spouseId ?? null,
          notes: body.notes ?? null,
        },
      });
      res.status(201).json(successEnvelope({ person }, rid));
    },
  );

  router.patch(
    "/:workspaceId/persons/:personId",
    requireWorkspacePermission(deps, "person:write"),
    async (req, res) => {
      const rid = req.requestId ?? "req_unknown";
      const body = personPatchSchema.parse(req.body);
      const person = await updatePerson(db, {
        workspaceId: req.workspace?.id ?? "",
        personId: paramId(req.params.personId),
        actorUid: req.auth?.uid ?? "",
        requestId: rid,
        patch: {
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.gender !== undefined ? { gender: body.gender } : {}),
          ...("birthDate" in body ? { birthDate: body.birthDate ?? null } : {}),
          ...("birthPlace" in body ? { birthPlace: body.birthPlace ?? null } : {}),
          ...("deathDate" in body ? { deathDate: body.deathDate ?? null } : {}),
          ...("deathPlace" in body ? { deathPlace: body.deathPlace ?? null } : {}),
          ...("fatherId" in body ? { fatherId: body.fatherId ?? null } : {}),
          ...("motherId" in body ? { motherId: body.motherId ?? null } : {}),
          ...("spouseId" in body ? { spouseId: body.spouseId ?? null } : {}),
          ...("notes" in body ? { notes: body.notes ?? null } : {}),
        },
      });
      res.status(200).json(successEnvelope({ person }, rid));
    },
  );

  router.delete(
    "/:workspaceId/persons/:personId",
    requireWorkspacePermission(deps, "person:write"),
    async (req, res) => {
      const rid = req.requestId ?? "req_unknown";
      await deletePerson(db, {
        workspaceId: req.workspace?.id ?? "",
        personId: paramId(req.params.personId),
        actorUid: req.auth?.uid ?? "",
        requestId: rid,
      });
      res.status(200).json(successEnvelope({ deleted: true }, rid));
    },
  );

  router.get(
    "/:workspaceId/persons/:personId/ancestors",
    requireWorkspacePermission(deps, "person:read"),
    async (req, res) => {
      const rid = req.requestId ?? "req_unknown";
      const items = await ancestorsOf(
        db,
        req.workspace?.id ?? "",
        paramId(req.params.personId),
      );
      res.status(200).json(successEnvelope({ items }, rid));
    },
  );

  router.get(
    "/:workspaceId/persons/:personId/descendants",
    requireWorkspacePermission(deps, "person:read"),
    async (req, res) => {
      const rid = req.requestId ?? "req_unknown";
      const items = await descendantsOf(
        db,
        req.workspace?.id ?? "",
        paramId(req.params.personId),
      );
      res.status(200).json(successEnvelope({ items }, rid));
    },
  );

  router.get(
    "/:workspaceId/person-relations",
    requireWorkspacePermission(deps, "person:read"),
    async (req, res) => {
      const rid = req.requestId ?? "req_unknown";
      const a = paramId(req.query.a);
      const b = paramId(req.query.b);
      const pattern = /^[A-Za-z0-9_-]{4,64}$/;
      if (!pattern.test(a) || !pattern.test(b)) {
        throw ApiError.validation("Parameter a dan b wajib ID individu yang valid.", [
          { field: "a", reason: "INVALID", },
        ]);
      }
      const relation = await relationBetween(db, req.workspace?.id ?? "", a, b);
      res.status(200).json(successEnvelope({ relation }, rid));
    },
  );

  router.get(
    "/:workspaceId/persons/:personId/sources",
    requireWorkspacePermission(deps, "person:read"),
    async (req, res) => {
      const rid = req.requestId ?? "req_unknown";
      const items = await listSources(
        db,
        req.workspace?.id ?? "",
        paramId(req.params.personId),
      );
      res.status(200).json(successEnvelope({ items }, rid));
    },
  );

  router.post(
    "/:workspaceId/persons/:personId/sources",
    requireWorkspacePermission(deps, "person:write"),
    async (req, res) => {
      const rid = req.requestId ?? "req_unknown";
      const body = sourceCreateSchema.parse(req.body);
      const source = await createSource(db, {
        workspaceId: req.workspace?.id ?? "",
        personId: paramId(req.params.personId),
        actorUid: req.auth?.uid ?? "",
        requestId: rid,
        data: body,
      });
      res.status(201).json(successEnvelope({ source }, rid));
    },
  );

  router.delete(
    "/:workspaceId/persons/:personId/sources/:sourceId",
    requireWorkspacePermission(deps, "person:write"),
    async (req, res) => {
      const rid = req.requestId ?? "req_unknown";
      await deleteSource(db, {
        workspaceId: req.workspace?.id ?? "",
        personId: paramId(req.params.personId),
        sourceId: paramId(req.params.sourceId),
        actorUid: req.auth?.uid ?? "",
        requestId: rid,
      });
      res.status(200).json(successEnvelope({ deleted: true }, rid));
    },
  );

  router.get(
    "/:workspaceId/members",
    requireWorkspacePermission(deps, "member:read"),
    async (req, res) => {
      const rid = req.requestId ?? "req_unknown";
      const items = await listMembers(db, req.workspace?.id ?? "");
      res.status(200).json(successEnvelope({ items }, rid));
    },
  );

  router.post(
    "/:workspaceId/members",
    requireWorkspacePermission(deps, "member:invite"),
    async (req, res) => {
      const rid = req.requestId ?? "req_unknown";
      const body = addMemberSchema.parse(req.body);
      const member = await addMember(db, firebaseAuth, {
        workspaceId: req.workspace?.id ?? "",
        email: body.email,
        role: body.role,
        actorUid: req.auth?.uid ?? "",
        requestId: rid,
      });
      res.status(201).json(successEnvelope({ member }, rid));
    },
  );

  router.patch(
    "/:workspaceId/members/:membershipId",
    requireWorkspacePermission(deps, "member:update"),
    async (req, res) => {
      const rid = req.requestId ?? "req_unknown";
      const body = changeMemberSchema.parse(req.body);
      const member = await changeMember(db, {
        workspaceId: req.workspace?.id ?? "",
        targetUid: paramId(req.params.membershipId),
        role: body.role,
        status: body.status,
        actorUid: req.auth?.uid ?? "",
        requestId: rid,
        auditAction: "member.updated",
      });
      res.status(200).json(successEnvelope({ member }, rid));
    },
  );

  router.delete(
    "/:workspaceId/members/:membershipId",
    requireWorkspacePermission(deps, "member:remove"),
    async (req, res) => {
      const rid = req.requestId ?? "req_unknown";
      const member = await changeMember(db, {
        workspaceId: req.workspace?.id ?? "",
        targetUid: paramId(req.params.membershipId),
        status: "REVOKED",
        actorUid: req.auth?.uid ?? "",
        requestId: rid,
        auditAction: "member.removed",
      });
      res.status(200).json(successEnvelope({ member }, rid));
    },
  );

  return router;
}
