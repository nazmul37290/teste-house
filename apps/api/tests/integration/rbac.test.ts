import { SUPER_ADMIN_ROLE, type PermissionKey } from '@shop/shared';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createAdminUserWithPassword } from '../../src/auth/admin-users';
import { cookiesFrom, createTestContext, WEB_ORIGIN } from './helpers';

const ctx = createTestContext();
afterAll(() => ctx.close());

const { prisma } = ctx.deps;
const password = 'Admin-Password-2026';
const uid = () => `${Date.now()}${Math.floor(Math.random() * 1e6)}`;

/** A role with exactly these permissions (created directly; the API is what is under test). */
async function customRole(permissions: PermissionKey[]) {
  const role = await prisma.role.create({ data: { name: `Role ${uid()}` } });
  const rows = await prisma.permission.findMany({ where: { key: { in: permissions } } });
  await prisma.rolePermission.createMany({
    data: rows.map((p) => ({ roleId: role.id, permissionId: p.id })),
  });
  return role;
}

async function adminSession(role: { id: string } | 'super') {
  const roleId =
    role === 'super'
      ? (await prisma.role.findUniqueOrThrow({ where: { name: SUPER_ADMIN_ROLE } })).id
      : role.id;
  const email = `rbac${uid()}@example.com`;
  const user = await createAdminUserWithPassword(ctx.deps.adminAuth, {
    name: 'RBAC Admin',
    email,
    password,
    roleId,
  });
  const login = await request(ctx.app)
    .post('/api/v1/admin/auth/sign-in/email')
    .set('Origin', WEB_ORIGIN)
    .send({ email, password });
  return { id: user.id, email, cookie: cookiesFrom(login) };
}

/** Admin API call with the CSRF header. */
function api(cookie: string) {
  const headers = { Cookie: cookie, Origin: WEB_ORIGIN, 'X-Requested-With': 'XMLHttpRequest' };
  return {
    get: (path: string) => request(ctx.app).get(`/api/v1/admin${path}`).set(headers),
    post: (path: string, body: object) =>
      request(ctx.app).post(`/api/v1/admin${path}`).set(headers).send(body),
    patch: (path: string, body: object) =>
      request(ctx.app).patch(`/api/v1/admin${path}`).set(headers).send(body),
    put: (path: string, body: object) =>
      request(ctx.app).put(`/api/v1/admin${path}`).set(headers).send(body),
    delete: (path: string) => request(ctx.app).delete(`/api/v1/admin${path}`).set(headers),
  };
}

const lastAudit = (entityId: string) =>
  prisma.auditLog.findFirst({ where: { entityId }, orderBy: { createdAt: 'desc' } });
const reasonOf = (res: request.Response) => res.body.error?.details?.[0]?.reason;

describe('requirePermission', () => {
  it('is 401 without a session, 403 without the permission, 200 with it', async () => {
    expect(
      (await request(ctx.app).get('/api/v1/admin/roles').set('X-Requested-With', 'x')).status,
    ).toBe(401);
    const salesman = await adminSession(
      await prisma.role.findUniqueOrThrow({ where: { name: 'Salesman' } }),
    );
    const denied = await api(salesman.cookie).get('/roles');
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('FORBIDDEN');

    const viewer = await adminSession(await customRole(['roles.manage']));
    expect((await api(viewer.cookie).get('/roles')).status).toBe(200);
  });

  it('accepts either key where a route lists several (roles list for users.manage)', async () => {
    const staffManager = await adminSession(await customRole(['users.manage']));
    expect((await api(staffManager.cookie).get('/roles')).status).toBe(200);
    expect((await api(staffManager.cookie).get('/permissions')).status).toBe(403);
  });

  it('requires X-Requested-With on admin writes', async () => {
    const admin = await adminSession('super');
    const res = await request(ctx.app)
      .post('/api/v1/admin/roles')
      .set({ Cookie: admin.cookie })
      .send({ name: 'No Header' });
    expect(res.status).toBe(403);
  });

  it('sees permission changes at once (Redis cache invalidated)', async () => {
    const role = await customRole(['users.manage']);
    const admin = await adminSession(role);
    expect((await api(admin.cookie).get('/permissions')).status).toBe(403); // cache now warm

    const owner = await adminSession('super');
    expect(
      (
        await api(owner.cookie).put(`/roles/${role.id}/permissions`, {
          permissions: ['users.manage', 'roles.manage'],
        })
      ).status,
    ).toBe(200);
    expect((await api(admin.cookie).get('/permissions')).status).toBe(200);
  });
});

describe('roles', () => {
  it('creates, renames, sets permissions and deletes, with an audit row for each write', async () => {
    const owner = await adminSession('super');
    const a = api(owner.cookie);
    const name = `Packer ${uid()}`;

    const created = await a.post('/roles', {
      name,
      permissions: ['orders.view', 'orders.add_note'],
    });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({
      name,
      isSystem: false,
      userCount: 0,
      permissions: ['orders.add_note', 'orders.view'],
    });
    const id = created.body.data.id as string;
    expect(await lastAudit(id)).toMatchObject({
      action: 'role.create',
      adminUserId: owner.id,
      entityType: 'role',
    });

    expect((await a.post('/roles', { name })).status).toBe(409);
    expect(
      (await a.post('/roles', { name: `X ${uid()}`, permissions: ['orders.fly'] })).status,
    ).toBe(400);

    expect((await a.patch(`/roles/${id}`, { name: `${name} 2` })).body.data.name).toBe(`${name} 2`);
    const perms = await a.put(`/roles/${id}/permissions`, { permissions: ['orders.view'] });
    expect(perms.body.data.permissions).toEqual(['orders.view']);
    expect((await lastAudit(id))?.after).toEqual({ permissions: ['orders.view'] });

    expect((await a.delete(`/roles/${id}`)).status).toBe(204);
    expect(await prisma.role.count({ where: { id } })).toBe(0);
    expect((await lastAudit(id))?.action).toBe('role.delete');
  });

  it('protects the Super Admin role from every change', async () => {
    const a = api((await adminSession('super')).cookie);
    const system = await prisma.role.findUniqueOrThrow({ where: { name: SUPER_ADMIN_ROLE } });
    for (const res of [
      await a.patch(`/roles/${system.id}`, { name: 'Renamed' }),
      await a.put(`/roles/${system.id}/permissions`, { permissions: [] }),
      await a.delete(`/roles/${system.id}`),
    ]) {
      expect(res.status).toBe(422);
      expect(reasonOf(res)).toBe('SYSTEM_ROLE');
    }
  });

  it('refuses to delete a role that still has staff', async () => {
    const role = await customRole(['orders.view']);
    await adminSession(role);
    const res = await api((await adminSession('super')).cookie).delete(`/roles/${role.id}`);
    expect(res.status).toBe(409);
    expect(reasonOf(res)).toBe('ROLE_IN_USE');
  });

  it('lets non-Super Admins grant only permissions they hold', async () => {
    const manager = await adminSession(await customRole(['roles.manage', 'products.view']));
    const a = api(manager.cookie);
    expect(
      (await a.post('/roles', { name: `Ok ${uid()}`, permissions: ['products.view'] })).status,
    ).toBe(201);
    expect(
      (
        await a.post('/roles', {
          name: `Up ${uid()}`,
          permissions: ['products.view', 'settings.manage'],
        })
      ).status,
    ).toBe(403);
  });
});

describe('staff accounts', () => {
  it('creates a staff member who can sign in; lists with search and paging meta', async () => {
    const a = api((await adminSession('super')).cookie);
    const role = await customRole(['orders.view']);
    const email = `staff${uid()}@example.com`;

    const created = await a.post('/users', {
      name: 'New Staff',
      email: email.toUpperCase(),
      password,
      roleId: role.id,
    });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ email, isActive: true, role: { id: role.id } });
    expect(JSON.stringify(await lastAudit(created.body.data.id))).not.toContain(password);
    expect(
      (
        await request(ctx.app)
          .post('/api/v1/admin/auth/sign-in/email')
          .set('Origin', WEB_ORIGIN)
          .send({ email, password })
      ).status,
    ).toBe(200);

    expect((await a.post('/users', { name: 'Dup', email, password, roleId: role.id })).status).toBe(
      409,
    );
    const list = await a.get(`/users?q=${encodeURIComponent(email)}&pageSize=5`);
    expect(list.body.meta).toEqual({ page: 1, pageSize: 5, total: 1 });
    expect(list.body.data[0].email).toBe(email);
  });

  it('deactivating revokes sessions at once and is audited', async () => {
    const owner = api((await adminSession('super')).cookie);
    const staff = await adminSession(await customRole(['orders.view']));
    expect(
      (await request(ctx.app).get('/api/v1/admin/auth/me').set('Cookie', staff.cookie)).status,
    ).toBe(200);

    expect((await owner.patch(`/users/${staff.id}`, { isActive: false })).body.data.isActive).toBe(
      false,
    );
    expect(
      (await request(ctx.app).get('/api/v1/admin/auth/me').set('Cookie', staff.cookie)).status,
    ).toBe(401);
    expect(await prisma.adminSession.count({ where: { userId: staff.id } })).toBe(0);
    expect((await lastAudit(staff.id))?.action).toBe('admin_user.deactivate');
  });

  it('blocks self-deactivation and changing your own role', async () => {
    const owner = await adminSession('super');
    const a = api(owner.cookie);
    expect(reasonOf(await a.patch(`/users/${owner.id}`, { isActive: false }))).toBe(
      'CANNOT_DEACTIVATE_SELF',
    );
    const other = await customRole(['orders.view']);
    expect(reasonOf(await a.patch(`/users/${owner.id}`, { roleId: other.id }))).toBe(
      'CANNOT_CHANGE_OWN_ROLE',
    );
  });

  it('stops non-Super Admins from escalating through staff accounts', async () => {
    const hr = await adminSession(await customRole(['users.manage', 'orders.view']));
    const a = api(hr.cookie);
    const superRole = await prisma.role.findUniqueOrThrow({ where: { name: SUPER_ADMIN_ROLE } });
    const bigRole = await customRole(['orders.view', 'settings.manage']);
    const smallRole = await customRole(['orders.view']);
    const email = () => `esc${uid()}@example.com`;

    expect(
      (await a.post('/users', { name: 'Esc', email: email(), password, roleId: superRole.id }))
        .status,
    ).toBe(403);
    expect(
      (await a.post('/users', { name: 'Esc', email: email(), password, roleId: bigRole.id }))
        .status,
    ).toBe(403);
    expect(
      (await a.post('/users', { name: 'Ok', email: email(), password, roleId: smallRole.id }))
        .status,
    ).toBe(201);

    const superAdmin = await adminSession('super');
    expect((await a.patch(`/users/${superAdmin.id}`, { name: 'Hijacked' })).status).toBe(403);
    expect(
      (await a.put(`/users/${superAdmin.id}/password`, { password: 'Taken-Over-2026' })).status,
    ).toBe(403);
  });

  it('resets another admin password: old one stops working, sessions end, no secret in the audit log', async () => {
    const owner = await adminSession('super');
    const staff = await adminSession(await customRole(['orders.view']));
    const newPassword = 'Fresh-Password-2026';

    expect(
      (await api(owner.cookie).put(`/users/${staff.id}/password`, { password: newPassword }))
        .status,
    ).toBe(204);
    expect(
      (await request(ctx.app).get('/api/v1/admin/auth/me').set('Cookie', staff.cookie)).status,
    ).toBe(401);
    const signIn = (pw: string) =>
      request(ctx.app)
        .post('/api/v1/admin/auth/sign-in/email')
        .set('Origin', WEB_ORIGIN)
        .send({ email: staff.email, password: pw });
    expect((await signIn(password)).status).toBe(401);
    expect((await signIn(newPassword)).status).toBe(200);

    const audit = await lastAudit(staff.id);
    expect(audit?.action).toBe('admin_user.password_reset');
    expect(JSON.stringify(audit)).not.toContain(newPassword);
    expect(
      reasonOf(
        await api(owner.cookie).put(`/users/${owner.id}/password`, { password: newPassword }),
      ),
    ).toBe('USE_CHANGE_PASSWORD');
  });

  it('always keeps one active Super Admin, even when two remove each other at the same moment', async () => {
    const a = await adminSession('super');
    const b = await adminSession('super');
    // Test database only: leave exactly these two active Super Admins.
    await prisma.adminUser.updateMany({
      where: { role: { isSystem: true }, id: { notIn: [a.id, b.id] } },
      data: { isActive: false },
    });

    const results = await Promise.all([
      api(a.cookie).patch(`/users/${b.id}`, { isActive: false }),
      api(b.cookie).patch(`/users/${a.id}`, { isActive: false }),
    ]);
    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([200, 422]);
    expect(reasonOf(results.find((r) => r.status === 422)!)).toBe('LAST_SUPER_ADMIN');
    expect(
      await prisma.adminUser.count({ where: { isActive: true, role: { isSystem: true } } }),
    ).toBe(1);
  });
});
