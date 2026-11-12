import { prisma } from '../db';
import { sendMail, type SendResult } from './mailer';
import { billingMailRecipients, recordMailRecipients } from './mailPermissions';

export interface CompletionNotificationResult {
  sent: number;
  failed: number;
  mocked: number;
  skipped: number;
}

// Completion email is an automatic workflow notification. Optional client output
// preferences govern additional output only; they do not suppress this handoff.
export async function notifyAccomplished(record: {
  id: string;
  companyName: string;
  deliveryDate: string;
  reference: string;
  accountManager: string;
  accomplishedByName: string;
  recipientOverride?: string;
}): Promise<CompletionNotificationResult> {
  const outcome = { sent: 0, failed: 0, mocked: 0, skipped: 0 };
  const source = await prisma.deliveryRecord.findFirst({ where: { id: record.id, deletedAt: null } });
  const billing = source?.category === 'ACCOUNTING_COLLECTION';
  const recipientRole = billing ? 'BILLING' : 'ACCOUNT_MANAGER';
  const subject = `${billing ? 'Collection Collected' : 'Delivery Accomplished'} — ${record.companyName}`;
  const text = [
    `Record: ${record.id}`,
    `Company: ${record.companyName}`,
    `Delivery Date: ${record.deliveryDate}`,
    `Reference / SAP Number: ${record.reference}`,
    `Accomplished By: ${record.accomplishedByName}`,
  ].join('\n');
  // No synthetic addresses and no arbitrary override destination. Collections
  // resolve only the reviewed deployment mapping; other records resolve an exact AM.
  const recipients = !source || source.status !== 'ACCOMPLISHED' || source.draft || source.category === 'RMA'
    || (record.recipientOverride && !billing)
    ? [] : billing ? await billingMailRecipients(source) : await recordMailRecipients(['AM'], source);
  if (!recipients.length) {
    outcome.skipped++;
    await prisma.notificationLog.create({ data: {
      triggerEvent: 'ACCOMPLISHED', recipientRole, recipientName: billing ? 'Billing Department' : record.accountManager,
      message: `${subject}\n${text}\nSkipped: no unique active recipient with record access; review recipient mapping and permissions.`, status: 'SKIPPED',
    } });
    return outcome;
  }
  for (const recipient of recipients) {
    let result: SendResult;
    try { result = await sendMail({ to: recipient.email, subject, text }); }
    catch { result = { ok: false, method: 'mock' }; }
    const status = !result.ok ? 'FAILED' : result.method === 'mock' ? 'MOCKED' : 'SENT';
    await prisma.notificationLog.create({ data: {
      triggerEvent: 'ACCOMPLISHED', recipientRole, recipientName: recipient.name,
      message: `${subject}\n${text}`, status,
    } });
    if (status === 'SENT') outcome.sent++;
    else if (status === 'MOCKED') outcome.mocked++;
    else outcome.failed++;
  }
  return outcome;
}
