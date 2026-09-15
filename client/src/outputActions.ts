import { DeliveryCategory, DeliveryStatus, OutputActionConfig, OutputActionLogEntry, OutputActionTrigger } from './types';

export const OUTPUT_ACTION_TRIGGERS: OutputActionTrigger[] = [
  'Record Created',
  'Accomplished',
  'Rescheduled',
  'On-Hold',
  'RMA Completed',
  'Collection Verified'
];

export const DEFAULT_OUTPUT_ACTIONS: Record<OutputActionTrigger, OutputActionConfig> = {
  'Record Created': { notifyAM: false, notifyLogistics: true, notifyTASS: false, exportPDF: false, internalOnly: false },
  'Accomplished': { notifyAM: true, notifyLogistics: false, notifyTASS: false, exportPDF: false, internalOnly: false },
  'Rescheduled': { notifyAM: true, notifyLogistics: true, notifyTASS: false, exportPDF: false, internalOnly: false },
  'On-Hold': { notifyAM: true, notifyLogistics: true, notifyTASS: false, exportPDF: false, internalOnly: false },
  'RMA Completed': { notifyAM: true, notifyLogistics: false, notifyTASS: true, exportPDF: true, internalOnly: false },
  'Collection Verified': { notifyAM: true, notifyLogistics: false, notifyTASS: true, exportPDF: true, internalOnly: false }
};

export function getOutputTrigger(category: DeliveryCategory, status: DeliveryStatus): OutputActionTrigger | null {
  if (status === 'Delivered') {
    if (category === 'RMA') return 'RMA Completed';
    if (category === 'Accounting Collection') return 'Collection Verified';
    return 'Accomplished';
  }
  if (status === 'Rescheduled') return 'Rescheduled';
  if (status === 'On-Hold') return 'On-Hold';
  return null;
}

export interface OutputActionResult {
  newEntries: OutputActionLogEntry[];
  banners: string[];
  emailSent: boolean;
}

interface SendEmailApi {
  sendNotificationEmail: (data: {
    recordId: string;
    trigger: string;
    recipients: string[];
  }) => Promise<{ ok: boolean; sent: number; failed: number }>;
}

function buildRecipients(config: OutputActionConfig): string[] {
  const r: string[] = [];
  if (config.notifyAM)        r.push('AM');
  if (config.notifyLogistics)  r.push('LOGISTICS');
  if (config.notifyTASS)       r.push('TASS');
  return r;
}

export async function runOutputActions(
  trigger: OutputActionTrigger,
  config: OutputActionConfig,
  ctx: { amName: string; at?: string; recordId?: string; api?: SendEmailApi },
): Promise<OutputActionResult> {
  const at = ctx.at ?? new Date().toISOString();
  const banners: string[] = [];
  const messages: string[] = [];

  if (config.internalOnly) {
    messages.push('Kept internal only — no external notifications sent.');
  } else {
    const recipients = buildRecipients(config);
    let emailResult: { sent: number; failed: number } | null = null;

    if (recipients.length > 0 && ctx.recordId && ctx.api) {
      try {
        emailResult = await ctx.api.sendNotificationEmail({
          recordId: ctx.recordId,
          trigger,
          recipients,
        });
      } catch (err) {
        console.error('Email notification failed:', err);
      }
    }

    if (config.notifyAM) {
      const status = emailResult ? `(${emailResult.sent} sent)` : '';
      banners.push(`Email sent to: ${ctx.amName} ${status}`.trim());
      messages.push(`Notified Account Manager (${ctx.amName}) by email`);
    }
    if (config.notifyLogistics) {
      banners.push('Logistics notified');
      messages.push('Notified Logistics');
    }
    if (config.notifyTASS) {
      banners.push('TASS notified');
      messages.push('Notified TASS');
    }
    if (config.exportPDF) {
      banners.push('Exported to PDF');
      messages.push('Exported record to PDF');
    }
    if (!config.notifyAM && !config.notifyLogistics && !config.notifyTASS && !config.exportPDF) {
      messages.push('No output actions selected — nothing sent.');
    }
  }

  return {
    newEntries: messages.map(message => ({ trigger, message, at })),
    banners,
    emailSent: config.notifyAM && !config.internalOnly
  };
}
