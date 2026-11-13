import { randomUUID } from 'node:crypto';
import { MANILA_TIME_ZONE } from './dateSemantics';

// Keep legacy IDs addressable while giving every runtime creation path the
// same collision-resistant namespace, independent of demo-data randomness.
// This is the internal key only; users see the short record number below.
export function generateRecordId(): string {
  return `REC-${randomUUID()}`;
}

/**
 * Short, human-readable record numbers, e.g. DEL-26-00042.
 * PostgreSQL assigns them on insert (see the record_no migration); this module
 * holds the same rules for the dry run, tests and input parsing.
 */
export const RECORD_NO_PREFIX = {
  DELIVERY: 'DEL',
  RMA: 'RMA',
  PROCUREMENT_PICKUP: 'PUP',
  SALES_ORDERS: 'SO',
  ACCOUNTING_COLLECTION: 'COL',
} as const;

export type RecordNoCategory = keyof typeof RECORD_NO_PREFIX;

export const RECORD_NO_PATTERN = /^(DEL|RMA|PUP|SO|COL)-\d{2}-\d{5,}$/;
export const RECORD_NO_MAX_LENGTH = 14;
const SEQUENCE_DIGITS = 5;

const manilaYearFormat = new Intl.DateTimeFormat('en-CA', { timeZone: MANILA_TIME_ZONE, year: 'numeric' });

/** Calendar year of an instant in Asia/Manila; the counter resets on this year. */
export function manilaYear(instant: Date): number {
  if (Number.isNaN(instant.getTime())) throw new Error('instant must be a valid date');
  return Number(manilaYearFormat.format(instant));
}

/** Format a record number. The sequence grows past five digits instead of failing. */
export function formatRecordNo(category: string, year: number, sequence: number): string {
  const prefix = RECORD_NO_PREFIX[category as RecordNoCategory];
  if (!prefix) throw new Error(`Unknown record category: ${category}`);
  if (!Number.isInteger(year) || year < 0) throw new Error('year must be a non-negative integer');
  if (!Number.isInteger(sequence) || sequence < 1) throw new Error('sequence must be a positive integer');
  const yy = String(year % 100).padStart(2, '0');
  return `${prefix}-${yy}-${String(sequence).padStart(SEQUENCE_DIGITS, '0')}`;
}

/** Normalise typed input (spaces, lower case) into a record number, or null if it is not one. */
export function parseRecordNo(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const value = input.trim().toUpperCase();
  return RECORD_NO_PATTERN.test(value) ? value : null;
}

type RecordNoLookup = { deliveryRecord: { findMany(args: { where: { id: { in: string[] } }; select: { id: true; recordNo: true } }): Promise<Array<{ id: string; recordNo: string }>> } };

/** Record numbers for the DeliveryRecord entries of an audit page, keyed by internal id. */
export async function recordNumbersForAudit(db: RecordNoLookup, entries: Array<{ recordId: string; recordType: string }>): Promise<Map<string, string>> {
  const ids = [...new Set(entries.filter(entry => entry.recordType === 'DeliveryRecord').map(entry => entry.recordId))];
  if (!ids.length) return new Map();
  const rows = await db.deliveryRecord.findMany({ where: { id: { in: ids } }, select: { id: true, recordNo: true } });
  return new Map(rows.map(row => [row.id, row.recordNo]));
}
