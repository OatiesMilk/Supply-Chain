import { Router, type Request, type Response } from 'express';
import { prisma } from '../db';
import { requireAuth, requireResource, requireRole } from '../middleware/auth';
import { asyncRoute } from '../middleware/asyncRoute';
import { hasActionPermission } from '../services/permissionEvaluator';
import {
  DirectoryInputError, directoryWrite, normalizedDirectoryName, body, has, displayName, optionalEmail, optionalId, flag,
  expectedVersion, accountManagerInclude, accountManagerDto, accountManagerOption, accountManagerAudit, linkableUser,
  uniqueViolationMessage,
} from '../services/accountDirectory';

const router = Router();
const handler = (work: (req: Request, res: Response) => Promise<unknown>) => asyncRoute(async (req, res) => {
  try { return await work(req, res); }
  catch (error) {
    if (error instanceof DirectoryInputError) return res.status(error.status).json({ error: error.message });
    const unique = uniqueViolationMessage(error);
    if (unique) return res.status(409).json({ error: unique.replace('A record', 'An Account Manager') });
    throw error;
  }
});
// Account Managers are part of the Company lookup directory: the same
// companies resource gates reads and writes, plus Admin Panel write and role.
const manage = (action: 'CREATE' | 'WRITE') =>
  [requireAuth, requireResource('companies', action), requireResource('admin', 'WRITE'), requireRole('ADMIN')];
const isDirectoryAdmin = (req: Request) => req.user?.role === 'ADMIN' && (req.user.activeMode === 'V1'
  ? !!req.user.snapshot && hasActionPermission(req.user.snapshot, 'RESOURCE', 'admin', 'READ')
  : req.user.resources.includes('admin'));

/** Pickers get id/name/status. Admins get contact and linked-login details. */
router.get('/', requireAuth, requireResource('companies'), handler(async (req, res) => {
  const activeOnly = req.query.active === 'true';
  const rows = await prisma.accountManager.findMany({ where: activeOnly ? { isActive: true } : {},
    orderBy: [{ name: 'asc' }, { id: 'asc' }], include: accountManagerInclude });
  res.json(isDirectoryAdmin(req) ? rows.map(accountManagerDto) : rows.map(accountManagerOption));
}));

router.post('/', ...manage('CREATE'), handler(async (req, res) => {
  const input = body(req.body, ['name', 'email', 'user_id']);
  const name = displayName(input.name, 'Name', 100);
  const email = optionalEmail(input.email);
  const requestedUser = has(input, 'user_id') ? optionalId(input.user_id, 'Portal user') : null;
  const created = await directoryWrite(async tx => {
    const userId = requestedUser ? await linkableUser(tx, requestedUser) : null;
    const row = await tx.accountManager.create({
      data: { name, normalizedName: await normalizedDirectoryName(tx, name), email, userId }, include: accountManagerInclude });
    await tx.auditLog.create({ data: { recordId: row.id, recordType: 'AccountManager', action: 'CREATE', changedById: req.user!.id,
      previousValue: null, newValue: JSON.stringify(accountManagerAudit(row)) } });
    return row;
  });
  res.status(201).json(accountManagerDto(created));
}));

router.patch('/:id', ...manage('WRITE'), handler(async (req, res) => {
  const input = body(req.body, ['name', 'email', 'user_id', 'is_active', 'expected_version']);
  const version = expectedVersion(input.expected_version);
  const name = has(input, 'name') ? displayName(input.name, 'Name', 100) : undefined;
  const email = has(input, 'email') ? optionalEmail(input.email) : undefined;
  const requestedUser = has(input, 'user_id') ? optionalId(input.user_id, 'Portal user') : undefined;
  const isActive = has(input, 'is_active') ? flag(input.is_active, 'is_active') : undefined;
  if ([name, email, requestedUser, isActive].every(value => value === undefined)) throw new DirectoryInputError('Nothing to change');
  const updated = await directoryWrite(async tx => {
    const previous = await tx.accountManager.findUnique({ where: { id: req.params.id }, include: accountManagerInclude });
    if (!previous) throw new DirectoryInputError('Account Manager not found', 404);
    if (previous.version !== version) throw new DirectoryInputError('This Account Manager was changed by someone else. Refresh and try again.', 409);
    const userId = requestedUser === undefined || requestedUser === previous.userId ? undefined
      : requestedUser === null ? null : await linkableUser(tx, requestedUser);
    const data = {
      ...(name !== undefined && name !== previous.name ? { name, normalizedName: await normalizedDirectoryName(tx, name) } : {}),
      ...(email !== undefined && email !== previous.email ? { email } : {}),
      ...(userId !== undefined ? { userId } : {}),
      ...(isActive !== undefined && isActive !== previous.isActive ? { isActive } : {}),
    };
    if (!Object.keys(data).length) return previous;
    const row = await tx.accountManager.update({ where: { id: previous.id }, data: { ...data, version: { increment: 1 } }, include: accountManagerInclude });
    await tx.auditLog.create({ data: { recordId: row.id, recordType: 'AccountManager', action: 'UPDATE', changedById: req.user!.id,
      previousValue: JSON.stringify(accountManagerAudit(previous)), newValue: JSON.stringify(accountManagerAudit(row)) } });
    return row;
  });
  res.json(accountManagerDto(updated));
}));

export default router;
