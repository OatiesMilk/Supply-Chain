import { Router } from 'express';
import { prisma } from '../db';
import { requireAuth, requireResource, requireRole } from '../middleware/auth';
import { sendEmail } from '../services/mailer';

import { recordScope } from '../services/recordAccess';
import { notificationVisibility } from '../services/notificationVisibility';
import type { Notification } from '@prisma/client';
import { canDispatchRecordMail, mailInputError, recordMailRecipients } from '../services/mailPermissions';
import { asyncRoute } from '../middleware/asyncRoute';

const router = Router();

router.get('/', requireAuth, async (req, res) => {
  const notifications = await prisma.$queryRaw<Notification[]>`
    SELECT n.* FROM "Notification" n
    LEFT JOIN "DeliveryRecord" r ON n."recordType" = 'DeliveryRecord' AND r."id" = n."recordId"
    WHERE n."userId" = ${req.user!.id} AND ${notificationVisibility(req.user!)}
    ORDER BY n."createdAt" DESC LIMIT 50
  `;
  res.json(
    notifications.map(n => ({
      id: n.id,
      title: n.title,
      message: n.message,
      record_id: n.recordId,
      record_type: n.recordType,
      is_read: n.isRead,
      created_at: n.createdAt
    }))
  );
});

router.get('/unread-count', requireAuth, async (req, res) => {
  const [result] = await prisma.$queryRaw<Array<{ count: number }>>`
    SELECT COUNT(*)::integer AS count FROM "Notification" n
    LEFT JOIN "DeliveryRecord" r ON n."recordType" = 'DeliveryRecord' AND r."id" = n."recordId"
    WHERE n."userId" = ${req.user!.id} AND n."isRead" = false AND ${notificationVisibility(req.user!)}
  `;
  res.json({ count: result?.count ?? 0 });
});

router.patch('/read-all', requireAuth, requireRole('ADMIN', 'SALES_COORDINATOR', 'LOGISTICS', 'TASS', 'DRIVER'), async (req, res) => {
  await prisma.notification.updateMany({
    where: { userId: req.user!.id, isRead: false },
    data: { isRead: true }
  });
  res.json({ ok: true });
});

router.patch('/:id/read', requireAuth, requireRole('ADMIN', 'SALES_COORDINATOR', 'LOGISTICS', 'TASS', 'DRIVER'), async (req, res) => {
  const notif = await prisma.notification.findFirst({
    where: { id: req.params.id, userId: req.user!.id }
  });
  if (!notif) return res.status(404).json({ error: 'Notification not found' });

  await prisma.notification.update({
    where: { id: notif.id },
    data: { isRead: true }
  });
  res.json({ ok: true });
});

// ─── Email dispatch endpoint ────────────────────────────────────────────────

const TRIGGER_SUBJECTS: Record<string, (companyName: string) => string> = {
  'Accomplished':         c => `Delivery Accomplished — ${c}`,
  'Rescheduled':          c => `Delivery Rescheduled — ${c}`,
  'On-Hold':              c => `Delivery On Hold — ${c}`,
  'RMA Completed':        c => `RMA Completed — ${c}`,
  'Collection Verified':  c => `Collection Verified — ${c}`,
  'Record Created':       c => `New Record Created — ${c}`,
};

router.post('/send-email', requireAuth, requireResource('records'), requireRole('ADMIN', 'SALES_COORDINATOR', 'LOGISTICS', 'TASS'), asyncRoute(async (req, res) => {
  const inputError = mailInputError(req.body);
  if (inputError) return res.status(400).json({ error: inputError });
  const { recordId, trigger, recipients } = req.body ?? {};
  if (!recordId || !trigger || !Array.isArray(recipients) || recipients.length === 0) {
    return res.status(400).json({ error: 'recordId, trigger, and recipients[] are required' });
  }

  const record = await prisma.deliveryRecord.findFirst({
    where: { id: recordId, deletedAt: null, AND: [recordScope(req.user!)] },
    include: { company: true },
  });

  if (!record) {
    return res.status(404).json({ error: 'Record not found' });
  }
  if (!canDispatchRecordMail(req.user!, record, trigger)) return res.status(403).json({ error: 'Email dispatch is not permitted for this record and operation' });

  const companyName = record.company?.name || (record as any).companyName || 'Unknown';
  const subjectFn = TRIGGER_SUBJECTS[trigger] || ((c: string) => `${trigger} — ${c}`);
  const subject = subjectFn(companyName);

  const body = [
    `Trigger: ${trigger}`,
    `Company: ${companyName}`,
    `Reference: ${(record as any).reference || record.id}`,
    `Delivery Date: ${(record as any).deliveryDate || 'N/A'}`,
    `Updated by: ${req.user!.name}`,
  ].join('\n');

  const targets = await recordMailRecipients(recipients, record);

  let sent = 0;
  let failed = 0;

  for (const t of targets) {
    const result = await sendEmail({ to: t.email, subject, text: body });

    await prisma.notificationLog.create({
      data: {
        triggerEvent: trigger.toUpperCase().replace(/\s+/g, '_'),
        recipientRole: recipients.find(r => r === 'AM') ? 'ACCOUNT_MANAGER' : recipients[0],
        recipientName: t.name,
        message: `${subject}\n${body}`,
        status: result.ok ? (result.method === 'mock' ? 'MOCKED' : 'SENT') : 'FAILED',
      },
    });

    if (result.ok) sent++;
    else failed++;
  }

  res.json({ ok: true, sent, failed, resolvedCount: targets.length });
}));

export default router;
