import type { DeliveryCategory, DeliveryRecord } from '../types';
import { formatManilaTimestamp } from './manilaTimestamp';

/** Same limit the server applies to RMA transport Received By. */
export const RECEIVED_BY_MAX = 120;

export function completionLabels(category: DeliveryCategory | string) {
  const collection = category === 'Accounting Collection';
  return collection
    ? { button: 'Mark as collected', title: 'Mark as collected', success: 'Marked as collected', noun: 'collection' }
    : { button: 'Mark as delivered', title: 'Mark as delivered', success: 'Marked as delivered', noun: 'delivery' };
}

export const START_LABEL = 'Start transport';

/** One line shown when Logistics records a run for the assigned driver. */
export function recordingForLine(driver: string | null | undefined): string {
  return `Recording for ${driver?.trim() || 'the assigned driver'}. This is saved under your name.`;
}

export type CompletionInput = {
  hasPhoto: boolean; loading: boolean; uploading: boolean; loadFailed: boolean;
  receivedBy: string; remarks: string;
};

/** Everything still blocking Confirm, in the order the dialog shows the fields. Empty means ready. */
export function completionNeeds(input: CompletionInput): string[] {
  const needs: string[] = [];
  if (input.uploading) needs.push('upload in progress');
  else if (input.loadFailed) needs.push('photo check (retry loading the attachments)');
  else if (input.loading) needs.push('photo check');
  else if (!input.hasPhoto) needs.push('proof photo');
  const receivedBy = input.receivedBy.trim();
  if (!receivedBy) needs.push('Received by');
  else if (receivedBy.length > RECEIVED_BY_MAX) needs.push(`Received by (up to ${RECEIVED_BY_MAX} characters)`);
  if (!input.remarks.trim()) needs.push('remarks');
  return needs;
}

export function stillNeededLine(needs: readonly string[]): string {
  return needs.length ? `Still needed: ${needs.join(', ')}` : 'Everything is ready.';
}

export type NextStep = {
  kind: 'assign' | 'start' | 'complete' | 'done';
  text: string;
  /** The button to show; absent when there is nothing to press. */
  action?: 'start' | 'complete';
  /** The button is shown but cannot be pressed yet; `hint` says why. */
  disabled?: boolean;
  hint?: string;
};

export const UNSAVED_HINT = 'Save or revert your changes below first.';

/** The next step for a non-RMA run (Deliveries, Sales Orders, Procurement Pick-up, Accounting Collection).
 *  `canStart` and `canComplete` carry the caller's permission checks; the server still enforces every rule. */
export function nextStepForRun(record: Pick<DeliveryRecord, 'status' | 'is_draft' | 'driver' | 'time_in' | 'time_out' | 'received_by' | 'allowed_statuses'>,
  opts: { canStart: boolean; canComplete: boolean; dirty: boolean }): NextStep | null {
  if (record.status === 'Draft' || record.is_draft === 'Yes') return null;
  const blocked = opts.dirty ? { disabled: true, hint: UNSAVED_HINT } : {};
  if (record.status === 'Delivered') {
    const when = record.time_out ? ` ${formatManilaTimestamp(record.time_out)}` : '';
    const who = record.received_by?.trim() ? ` Received by ${record.received_by.trim()}.` : '';
    return { kind: 'done', text: `Delivered${when}.${who}` };
  }
  const started = !!record.time_in;
  if (!started && (record.status === 'Scheduled' || record.status === 'Rescheduled')) {
    if (!record.driver?.trim()) return { kind: 'assign', text: 'Assign a driver below before this run can start.' };
    if (!opts.canStart) return null;
    return { kind: 'start', text: `Not started yet · Driver: ${record.driver.trim()}`, action: 'start', ...blocked };
  }
  if (started && ['In Transit', 'Pending', 'On-Hold'].includes(record.status) && opts.canComplete
    && (record.allowed_statuses ?? []).includes('Delivered')) {
    return { kind: 'complete', text: `In transit since ${formatManilaTimestamp(record.time_in!)}${record.driver?.trim() ? ` · Driver: ${record.driver.trim()}` : ''}`, action: 'complete', ...blocked };
  }
  return null;
}
