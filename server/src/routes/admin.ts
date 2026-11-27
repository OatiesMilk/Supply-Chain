import { Router } from 'express';
import { prisma } from '../db';
import { requireResource, requireAuth, requireRole } from '../middleware/auth';
import { sendEmail } from '../services/mailer';
import { asyncRoute } from '../middleware/asyncRoute';
import { deploymentStatus } from '../services/deploymentStatus';
import { getRolePermissionEditor, saveRolePermissions, safePolicyAudit } from '../services/permissionManagement';
import { policyRoute } from '../middleware/policyRoute';
import { visibleBusinessAuditSnapshots } from '../services/businessAudit';
import { visibleAuditEntries, visibleAuditCount } from '../services/auditVisibility';
import { isValidDateOnly } from '../services/deliveryLifecycle';
import { manilaStartOfDay } from '../services/dateSemantics';
import { recordNumbersForAudit } from '../services/recordIds';

const router = Router();

router.get('/roles/:role/permissions', requireAuth, requireResource('admin'), requireRole('ADMIN'), policyRoute(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json(await getRolePermissionEditor(prisma, req.user!.id, req.params.role));
}));
router.put('/roles/:role/permissions', requireAuth, requireResource('admin', 'WRITE'), requireRole('ADMIN'), policyRoute(async (req, res) => {
  res.json(await saveRolePermissions(prisma, req.user!.id, req.params.role, req.body));
}));

// Full audit log with pagination and optional filters — ADMIN only.
router.get('/audit-log', requireAuth, requireResource('admin'), requireRole('ADMIN'), asyncRoute(async (req, res) => {
  const pagination = (value: unknown, fallback: number) => value === undefined ? fallback
    : typeof value === 'string' && /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : null;
  const page = pagination(req.query.page, 1);
  const requestedLimit = pagination(req.query.limit, 50);
  if (page === null || requestedLimit === null) return res.status(400).json({ error: 'page and limit must be positive whole numbers' });
  const limit = Math.min(200, requestedLimit);
  const skip = (page - 1) * limit;
  if (!Number.isSafeInteger(skip) || skip > 2147483647) return res.status(400).json({ error: 'Requested audit page is out of range' });

  const where: any = {};

  if (req.query.userId) {
    where.changedById = String(req.query.userId);
  }

  const validActions = ['CREATE', 'UPDATE', 'DELETE'];
  if (req.query.action && validActions.includes(String(req.query.action))) {
    where.action = String(req.query.action);
  }

  const timestamp: { gte?: Date; lt?: Date; lte?: Date } = {};
  for (const field of ['from', 'to'] as const) {
    const value = req.query[field];
    if (value === undefined || value === '') continue;
    if (typeof value !== 'string') return res.status(400).json({ error: `${field} must be a valid date or timestamp` });
    const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
    const calendarDate = /^\d{4}-\d{2}-\d{2}(?:$|T| )/.test(value) ? value.slice(0, 10) : null;
    if (calendarDate && !isValidDateOnly(calendarDate)) return res.status(400).json({ error: `${field} must be a valid calendar date` });
    const date = dateOnly ? manilaStartOfDay(value) : new Date(value);
    if (!Number.isFinite(date.getTime())) return res.status(400).json({ error: `${field} must be a valid date or timestamp` });
    if (field === 'from') timestamp.gte = date;
    else if (dateOnly) timestamp.lt = new Date(date.getTime() + 24 * 60 * 60 * 1000);
    else timestamp.lte = date;
  }
  if (timestamp.gte && (timestamp.lt && timestamp.gte >= timestamp.lt || timestamp.lte && timestamp.gte > timestamp.lte)) {
    return res.status(400).json({ error: 'from must be on or before to' });
  }
  if (Object.keys(timestamp).length) where.timestamp = timestamp;

  const [entries, total] = await Promise.all([
    req.user!.activeMode === 'V1' ? visibleAuditEntries(prisma, req.user!, limit, skip, where) : prisma.auditLog.findMany({
      where,
      include: { changedBy: true },
      orderBy: { timestamp: 'desc' },
      skip,
      take: limit
    }),
    req.user!.activeMode === 'V1' ? visibleAuditCount(prisma, req.user!, where) : prisma.auditLog.count({ where })
  ]);

  const [business, recordNumbers] = await Promise.all([visibleBusinessAuditSnapshots(entries, req.user!), recordNumbersForAudit(prisma, entries)]);
  res.json({
    page,
    limit,
    total,
    pages: Math.ceil(total / limit),
    entries: entries.map((e, index) => ({
      id: e.id,
      record_id: e.recordId,
      record_no: recordNumbers.get(e.recordId) ?? null,
      record_type: e.recordType,
      action: e.action,
      changed_by: e.changedBy.name,
      changed_by_id: e.changedById,
      timestamp: e.timestamp,
      previous: safePolicyAudit(e.recordType, e.previousValue) ?? business[index].previous,
      next: safePolicyAudit(e.recordType, e.newValue) ?? business[index].next
    }))
  });
}));

// ─── Integration diagnostics — ADMIN only ──────────────────────────────────

router.get('/integration-status', requireAuth, requireResource('admin'), requireRole('ADMIN'), asyncRoute(async (_req, res) => {
  const azureConfigured = !!(process.env.AZURE_CLIENT_ID && process.env.AZURE_CLIENT_SECRET);
  const azureTenant = process.env.AZURE_TENANT_ID || 'common';
  const smtpConfigured = !!process.env.SMTP_HOST;
  const appUrl = process.env.APP_URL || 'http://localhost:3000';

  const totalUsers = await prisma.user.count();
  const activeUsers = await prisma.user.count({ where: { isActive: true } });
  const microsoftLinked = await prisma.user.count({ where: { microsoftOid: { not: null } } });

  let emailMethod: 'graph' | 'smtp' | 'mock' = 'mock';
  if (azureConfigured && process.env.AZURE_TENANT_ID) emailMethod = 'graph';
  else if (smtpConfigured) emailMethod = 'smtp';

  res.json({
    azure_sso: {
      configured: azureConfigured,
      tenant: azureConfigured ? azureTenant : null,
      redirect_uri: azureConfigured ? `${appUrl}/api/v1/auth/microsoft/callback` : null,
    },
    email: {
      method: emailMethod,
      smtp_host: smtpConfigured ? process.env.SMTP_HOST : null,
      from: process.env.SMTP_FROM || null,
    },
    users: {
      total: totalUsers,
      active: activeUsers,
      microsoft_linked: microsoftLinked,
    },
    app_url: appUrl,
    node_env: process.env.NODE_ENV || 'development',
  });
}));

// ─── Deployment check — ADMIN only ─────────────────────────────────────────
// Read-only: which database, file store, origins and proxy this running
// process is really using. Returns identities and yes/no flags, never a secret.

router.get('/deployment-status', requireAuth, requireResource('admin'), requireRole('ADMIN'), asyncRoute(async (req, res) => {
  res.json(await deploymentStatus(req));
}));

// ─── Test email — ADMIN only ───────────────────────────────────────────────

router.post('/test-email', requireAuth, requireResource('admin', 'WRITE'), requireRole('ADMIN'), asyncRoute(async (req, res) => {
  const { to } = req.body ?? {};
  if (!to || typeof to !== 'string') {
    return res.status(400).json({ error: 'A "to" email address is required' });
  }

  const timestamp = new Date().toISOString();
  const result = await sendEmail({
    to: to.trim(),
    subject: 'Microgenesis Supply Chain Portal — Test Email',
    text: `This is a test email sent from the Microgenesis Supply Chain Portal.\n\nTimestamp: ${timestamp}\n\nIf you received this, your email configuration is working correctly.`,
  });

  res.json({
    ok: result.ok,
    method: result.method,
    error: result.error || null,
  });
}));

export default router;
