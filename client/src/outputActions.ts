import { DeliveryCategory, DeliveryStatus, OutputActionConfig, OutputActionLogEntry, OutputActionTrigger } from './types';

export const OUTPUT_ACTION_TRIGGERS: OutputActionTrigger[] = [
  'Record Created', 'Accomplished', 'Rescheduled', 'On-Hold', 'RMA Completed', 'Collection Verified'
];

export const DEFAULT_OUTPUT_ACTIONS: Record<OutputActionTrigger, OutputActionConfig> = {
  'Record Created': { notifyAM: true, notifyLogistics: true, notifyTASS: true, exportPDF: false, internalOnly: false },
  'Accomplished': { notifyAM: true, notifyLogistics: false, notifyTASS: false, exportPDF: false, internalOnly: false },
  'Rescheduled': { notifyAM: true, notifyLogistics: true, notifyTASS: false, exportPDF: false, internalOnly: false },
  'On-Hold': { notifyAM: true, notifyLogistics: true, notifyTASS: false, exportPDF: false, internalOnly: false },
  'RMA Completed': { notifyAM: true, notifyLogistics: false, notifyTASS: true, exportPDF: true, internalOnly: false },
  'Collection Verified': { notifyAM: true, notifyLogistics: false, notifyTASS: true, exportPDF: true, internalOnly: false }
};

export function getOutputTrigger(category: DeliveryCategory, status: DeliveryStatus): OutputActionTrigger | null {
  if (status === 'Delivered') {
    if (category === 'RMA') return 'RMA Completed';
    // Collection transport completion is not TASS verification.
    return 'Accomplished';
  }
  if (status === 'Rescheduled') return 'Rescheduled';
  if (status === 'On-Hold') return 'On-Hold';
  return null;
}

export type OutputOutcome = 'sent' | 'failed' | 'skipped' | 'mocked' | 'exported';
export interface OutputActionResult {
  newEntries: OutputActionLogEntry[];
  banners: string[];
  emailSent: boolean;
  email: { sent: number; failed: number; mocked: number; skipped: number };
  pdf: OutputOutcome;
}

interface SendEmailApi {
  sendNotificationEmail: (data: { recordId: string; trigger: string; recipients: string[] }) =>
    Promise<{ ok: boolean; sent: number; failed: number; mocked?: number; skipped?: number }>;
}

export async function runOutputActions(
  trigger: OutputActionTrigger,
  config: OutputActionConfig,
  ctx: { amName: string; at?: string; recordId?: string; category?: DeliveryCategory; api?: SendEmailApi; exportPDF?: () => Promise<unknown> },
): Promise<OutputActionResult> {
  const at = ctx.at ?? new Date().toISOString();
  const messages: string[] = [];
  const email = { sent: 0, failed: 0, mocked: 0, skipped: 0 };
  let pdf: OutputOutcome = 'skipped';
  const automaticAM = trigger === 'Accomplished' && ctx.category !== undefined && ctx.category !== 'Accounting Collection' && ctx.category !== 'RMA';
  const recipients = [
    ...(config.notifyAM && !automaticAM ? ['AM'] : []),
    ...(config.notifyLogistics ? ['LOGISTICS'] : []),
    ...(config.notifyTASS ? ['TASS'] : []),
  ];

  if (config.internalOnly) {
    email.skipped = recipients.length;
    messages.push('Additional output actions skipped. Automatic workflow notifications are handled separately.');
  } else {
    if (automaticAM && config.notifyAM) messages.push('Account Manager notification is handled by the completion workflow; no duplicate email requested.');
    if (recipients.length) {
      if (!ctx.recordId || !ctx.api) {
        email.skipped = recipients.length;
        messages.push('Email skipped: a saved record and notification service are required.');
      } else {
        try {
          const result = await ctx.api.sendNotificationEmail({ recordId: ctx.recordId, trigger, recipients });
          email.sent = result.sent;
          email.failed = result.failed;
          email.mocked = result.mocked ?? 0;
          email.skipped = result.skipped ?? 0;
          if (!result.ok && !email.failed && !email.skipped && !email.mocked) email.failed = 1;
          if (!email.sent && !email.failed && !email.mocked && !email.skipped) email.skipped = recipients.length;
          if (email.sent) messages.push(`Email: ${email.sent} sent.`);
          if (email.failed) messages.push(`Email: ${email.failed} failed.`);
          if (email.mocked) messages.push(`Email: ${email.mocked} mocked; no email delivered.`);
          if (email.skipped) messages.push(`Email: ${email.skipped} skipped; no authorized recipient or delivery was available.`);
        } catch (error) {
          email.failed = recipients.length;
          messages.push(`Email failed: ${error instanceof Error ? error.message : 'Notification service unavailable.'}`);
        }
      }
    }
    if (config.exportPDF) {
      if (!ctx.recordId || !ctx.exportPDF) messages.push('PDF export skipped: a saved record and export action are required.');
      else {
        try { await ctx.exportPDF(); pdf = 'exported'; messages.push('Exported record to PDF.'); }
        catch (error) { pdf = 'failed'; messages.push(`PDF export failed: ${error instanceof Error ? error.message : 'Export unavailable.'}`); }
      }
    }
    if (!recipients.length && !config.exportPDF && !(automaticAM && config.notifyAM)) messages.push('No additional output actions selected.');
  }
  return { newEntries: messages.map(message => ({ trigger, message, at })), banners: messages, emailSent: email.sent > 0, email, pdf };
}
