import { Router } from "express";
import type { Role, RolesResponse } from "../types.js";
import { ApiError } from "../errors.js";
import type { RoleRegistry } from "../services/roles.js";

export function rolesRouter(roles: RoleRegistry): Router {
  const router = Router();
  router.get("/roles", (_req, res) => {
    const body: RolesResponse = { roles: roles.list() };
    res.json(body);
  });
  router.get("/roles/:roleId", (req, res) => {
    const role: Role | undefined = roles.get(req.params.roleId);
    if (!role) throw new ApiError("ROLE_NOT_FOUND", `Role ${req.params.roleId} not found`);
    res.json(role);
  });
  return router;
}
