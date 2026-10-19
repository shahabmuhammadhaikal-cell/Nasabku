import { ApiError, successEnvelope } from "@nasabku/shared";
import { Router } from "express";
import { requireAuth, requireWorkspacePermission } from "../middleware/auth";
import { SLUG_PATTERN, slugify } from "../lib/slug";
import {
  addMemberSchema,
  changeMemberSchema,
  createWorkspaceSchema,
  updateWorkspaceSchema,
} from "../schemas";
import {
  addMember,
  changeMember,
  createWorkspace,
  getWorkspace,
  listMembers,
  listWorkspacesForUser,
  updateWorkspace,
} from "../services/workspace";
import type { ApiDeps } from "../types/context";

function paramId(value: string | string[] | undefined): string {
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
