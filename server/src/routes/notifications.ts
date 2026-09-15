import { Router } from 'express';
import { prisma } from '../db';
import { requireAuth } from '../middleware/auth';
import { sendEmail } from '../services/mailer';

const router = Router();

router.get('/', requireAuth, async (req, res) => {
  const notifications = await prisma.notification.findMany({
    where: { userId: req.user!.id },
    orderBy: { createdAt: 'desc' },
    take: 50
  });
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
  const count = await prisma.notification.count({
    where: { userId: req.user!.id, isRead: false }
  });
  res.json({ count });
});

router.patch('/read-all', requireAuth, async (req, res) => {
  await prisma.notification.updateMany({
    where: { userId: req.user!.id, isRead: false },
    data: { isRead: true }
  });
  res.json({ ok: true });
});

router.patch('/:id/read', requireAuth, async (req, res) => {
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

async function resolveRecipients(recipients: string[], record: any): Promise<{ name: string; email: string }[]> {
  const resolved: { name: string; email: string }[] = [];

  for (const r of recipients) {
    if (r === 'AM') {
      const am = record.accountManager;
      if (am) {
        const user = await prisma.user.findFirst({
          where: { name: { equals: am, mode: 'insensitive' }, isActive: true },
        });
        if (user) resolved.push({ name: user.name, email: user.email });
      }
    } else if (r === 'LOGISTICS') {
      const users = await prisma.user.findMany({ where: { role: 'LOGISTICS', isActive: true } });
      for (const u of users) resolved.push({ name: u.name, email: u.email });
    } else if (r === 'TASS') {
      const users = await prisma.user.findMany({ where: { role: 'TASS', isActive: true } });
      for (const u of users) resolved.push({ name: u.name, email: u.email });
    }
  }

  return resolved;
}

router.post('/send-email', requireAuth, async (req, res) => {
  const { recordId, trigger, recipients } = req.body ?? {};
  if (!recordId || !trigger || !Array.isArray(recipients) || recipients.length === 0) {
    return res.status(400).json({ error: 'recordId, trigger, and recipients[] are required' });
  }

  const record = await prisma.deliveryRecord.findUnique({
    where: { id: recordId },
    include: { company: true },
  });

  if (!record) {
    return res.status(404).json({ error: 'Record not found' });
  }

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

  const targets = await resolveRecipients(recipients, record);

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
});

export default router;
