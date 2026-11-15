import {
  createAdminUserSchema,
  createRoleSchema,
  idParamSchema,
  listQuerySchema,
  setAdminPasswordSchema,
  setRolePermissionsSchema,
  updateAdminUserSchema,
  updateRoleSchema,
} from '@shop/shared';
import type { RequestHandler } from 'express';
import type { Deps } from '../deps';
import * as adminUsers from '../services/admin-user.service';
import { actorFrom } from '../services/audit.service';
import * as roles from '../services/role.service';

/** Roles, permissions and staff accounts. Controllers parse and respond; rules live in services. */
export function staffController(deps: Deps) {
  const actor = (req: Parameters<RequestHandler>[0]) => actorFrom(req, deps.env);
  const id = (req: Parameters<RequestHandler>[0]) => idParamSchema.parse(req.params).id;

  return {
    listPermissions: (async (_req, res) => {
      res.json({ data: await roles.listPermissions(deps.prisma) });
    }) satisfies RequestHandler,

    listRoles: (async (_req, res) => {
      res.json({ data: await roles.listRoles(deps.prisma) });
    }) satisfies RequestHandler,

    getRole: (async (req, res) => {
      res.json({ data: await roles.getRole(deps.prisma, id(req)) });
    }) satisfies RequestHandler,

    createRole: (async (req, res) => {
      res
        .status(201)
        .json({ data: await roles.createRole(deps, actor(req), createRoleSchema.parse(req.body)) });
    }) satisfies RequestHandler,

    updateRole: (async (req, res) => {
      res.json({
        data: await roles.updateRole(deps, actor(req), id(req), updateRoleSchema.parse(req.body)),
      });
    }) satisfies RequestHandler,

    setRolePermissions: (async (req, res) => {
      const { permissions } = setRolePermissionsSchema.parse(req.body);
      res.json({ data: await roles.setRolePermissions(deps, actor(req), id(req), permissions) });
    }) satisfies RequestHandler,

    deleteRole: (async (req, res) => {
      await roles.deleteRole(deps, actor(req), id(req));
      res.status(204).end();
    }) satisfies RequestHandler,

    listUsers: (async (req, res) => {
      const query = listQuerySchema.parse(req.query);
      const { items, total } = await adminUsers.listAdminUsers(deps.prisma, query);
      res.json({ data: items, meta: { page: query.page, pageSize: query.pageSize, total } });
    }) satisfies RequestHandler,

    getUser: (async (req, res) => {
      res.json({ data: await adminUsers.getAdminUser(deps.prisma, id(req)) });
    }) satisfies RequestHandler,

    createUser: (async (req, res) => {
      const input = createAdminUserSchema.parse(req.body);
      res.status(201).json({ data: await adminUsers.createAdminUser(deps, actor(req), input) });
    }) satisfies RequestHandler,

    updateUser: (async (req, res) => {
      const input = updateAdminUserSchema.parse(req.body);
      res.json({ data: await adminUsers.updateAdminUser(deps, actor(req), id(req), input) });
    }) satisfies RequestHandler,

    setUserPassword: (async (req, res) => {
      const { password } = setAdminPasswordSchema.parse(req.body);
      await adminUsers.setAdminPassword(deps, actor(req), id(req), password);
      res.status(204).end();
    }) satisfies RequestHandler,
  };
}
