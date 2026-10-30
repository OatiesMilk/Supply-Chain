import { prisma } from '../db';
import { sendMail } from './mailer';
import { permissionMode } from './permissionManagement';
import { recordMailRecipients } from './mailPermissions';

// The ONE automated trigger required by spec: when a delivery_record's status
// changes to ACCOMPLISHED, write to notification_log and email the record's
// account_manager. Do not add other automated triggers here.
export async function notifyAccomplished(record: {
  id: string;
  companyName: string;
  deliveryDate: string;
  reference: string;
  accountManager: string;
  accomplishedByName: string;
  recipientOverride?: string;
}) {
  if (permissionMode() === 'V1') {
    // A display label or billing placeholder is not an authenticated recipient.
    // Unknown recipient overrides require an explicit identity mapping first.
    if (record.recipientOverride) return;
    const source = await prisma.deliveryRecord.findFirst({ where: { id: record.id, deletedAt: null } });
    if (!source) return;
    const recipients = await recordMailRecipients(['AM'], source);
    for (const recipient of recipients) {
      const subject = `Delivery Accomplished — ${record.companyName}`;
      const text = `Company: ${record.companyName}\nDelivery Date: ${record.deliveryDate}\nReference / SAP Number: ${record.reference}\nAccomplished By: ${record.accomplishedByName}`;
      const result = await sendMail({ to: recipient.email, subject, text });
      await prisma.notificationLog.create({ data: { triggerEvent: 'ACCOMPLISHED', recipientRole: 'ACCOUNT_MANAGER', recipientName: recipient.name,
        message: `${subject}\n${text}`, status: !result.ok ? 'FAILED' : result.method === 'mock' ? 'MOCKED' : 'SENT' } });
    }
    return;
  }
  const subject = `Delivery Accomplished — ${record.companyName}`;
  const text = [
    `Company: ${record.companyName}`,
    `Delivery Date: ${record.deliveryDate}`,
    `Reference / SAP Number: ${record.reference}`,
    `Accomplished By: ${record.accomplishedByName}`
  ].join('\n');

  const recipientName = record.recipientOverride ?? record.accountManager;
  const toAddress = `${recipientName.replace(/[^a-zA-Z0-9]+/g, '.').toLowerCase()}@microgenesis.example`;

  const result = await sendMail({ to: toAddress, subject, text });

  await prisma.notificationLog.create({
    data: {
      triggerEvent: 'ACCOMPLISHED',
      recipientRole: record.recipientOverride ? 'BILLING' : 'ACCOUNT_MANAGER',
      recipientName: recipientName,
      message: `${subject}\n${text}`,
      status: !result.ok ? 'FAILED' : result.method === 'mock' ? 'MOCKED' : 'SENT'
    }
  });
}
