import { prisma } from '../db';
import { sendMail } from './mailer';

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
