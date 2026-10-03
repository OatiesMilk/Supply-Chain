import { Router } from 'express';
import { prisma } from '../db';
import { requireAuth, requireRole } from '../middleware/auth';
import { sendEmail } from '../services/mailer';

const router = Router();

// Full audit log with pagination and optional filters — ADMIN only.
router.get('/audit-log', requireAuth, requireRole('ADMIN'), async (req, res) => {
  const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10));
  const limit = Math.max(1, Math.min(200, parseInt(String(req.query.limit ?? '50'), 10)));
  const skip = (page - 1) * limit;

  const where: any = {};

  if (req.query.userId) {
    where.changedById = String(req.query.userId);
  }

  const validActions = ['CREATE', 'UPDATE', 'DELETE'];
  if (req.query.action && validActions.includes(String(req.query.action))) {
    where.action = String(req.query.action);
  }

  if (req.query.from || req.query.to) {
    where.timestamp = {};
    if (req.query.from) where.timestamp.gte = new Date(String(req.query.from));
    if (req.query.to) where.timestamp.lte = new Date(String(req.query.to));
  }

  const [entries, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: { changedBy: true },
      orderBy: { timestamp: 'desc' },
      skip,
      take: limit
    }),
    prisma.auditLog.count({ where })
  ]);

  res.json({
    page,
    limit,
    total,
    pages: Math.ceil(total / limit),
    entries: entries.map(e => ({
      id: e.id,
      record_id: e.recordId,
      record_type: e.recordType,
      action: e.action,
      changed_by: e.changedBy.name,
      changed_by_id: e.changedById,
      timestamp: e.timestamp
    }))
  });
});

// ─── Integration diagnostics — ADMIN only ──────────────────────────────────

router.get('/integration-status', requireAuth, requireRole('ADMIN'), async (_req, res) => {
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
      redirect_uri: azureConfigured ? `${appUrl}/api/auth/microsoft/callback` : null,
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
});

// ─── Test email — ADMIN only ───────────────────────────────────────────────

router.post('/test-email', requireAuth, requireRole('ADMIN'), async (req, res) => {
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
});

export default router;
