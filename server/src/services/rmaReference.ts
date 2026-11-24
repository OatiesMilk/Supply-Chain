import type { Prisma } from '@prisma/client';
import { manilaToday } from './deliveryLifecycle';
import { RMA_CATEGORY_META, canonicalRmaCategory, type RmaCategory, type RmaSlipPrefix } from './rmaRules';

/**
 * Auto-generated TASS slip references, e.g. POS112026-01.
 * Format <PREFIX><MMDDYY>-<NN>: the counter is shared per (prefix, Asia/Manila
 * date) across every movement method and across Save / Save as Draft. Numbers
 * are allocated inside the record's own transaction, so a failed save never
 * consumes one, and are never changed once assigned.
 */
export const RMA_SLIP_PREFIX_BY_CATEGORY: Readonly<Record<RmaCategory, RmaSlipPrefix>> = Object.fromEntries(
  Object.values(RMA_CATEGORY_META).map(meta => [meta.label, meta.prefix]),
) as Record<RmaCategory, RmaSlipPrefix>;
export const RMA_SLIP_PREFIXES = ['POS', 'RTC', 'RTS', 'ARD', 'RR', 'TXO'] as const satisfies readonly RmaSlipPrefix[];
export const RMA_AUTO_REFERENCE_PATTERN = /^(POS|RTC|RTS|ARD|RR|TXO)\d{6}-\d{2,}$/;
const MANILA_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function rmaPrefixForCategory(category: string | null | undefined): RmaSlipPrefix | null {
  const canonical = canonicalRmaCategory(category);
  return canonical ? RMA_SLIP_PREFIX_BY_CATEGORY[canonical] : null;
}

/** '2026-11-20' -> '112026'. */
export function manilaDateToMmddyy(manilaDate: string): string {
  const match = MANILA_DATE.exec(manilaDate);
  if (!match) throw new Error('manilaDate must be YYYY-MM-DD');
  const [, year, month, day] = match;
  const probe = new Date(`${manilaDate}T00:00:00Z`);
  if (Number.isNaN(probe.getTime()) || probe.toISOString().slice(0, 10) !== manilaDate) throw new Error('manilaDate must be a real calendar date');
  return `${month}${day}${year.slice(-2)}`;
}

/** The sequence is zero-padded to two digits and grows past 99 instead of failing. */
export function formatRmaReference(prefix: RmaSlipPrefix, manilaDate: string, sequence: number): string {
  if (!Number.isInteger(sequence) || sequence < 1) throw new Error('sequence must be a positive integer');
  return `${prefix}${manilaDateToMmddyy(manilaDate)}-${String(sequence).padStart(2, '0')}`;
}

/** Display-only placeholder (e.g. POS112426-NN); never touches the database. */
export function previewRmaReferenceFormat(category: string | null | undefined, now = new Date()): string | null {
  const prefix = rmaPrefixForCategory(category);
  return prefix ? `${prefix}${manilaDateToMmddyy(manilaToday(now))}-NN` : null;
}

/**
 * Reserves the next reference for the category's prefix and today's Manila date.
 * Must run inside the transaction that saves the record: the single-statement
 * upsert takes the counter row lock until commit and rolls back with the save.
 */
export async function allocateRmaReference(tx: Prisma.TransactionClient, category: string, now = new Date()): Promise<string> {
  const prefix = rmaPrefixForCategory(category);
  if (!prefix) throw new Error(`Cannot allocate RMA slip reference for unsupported category: ${category}`);
  const manilaDate = manilaToday(now);
  const rows = await tx.$queryRaw<Array<{ lastValue: number }>>`
    INSERT INTO "RmaReferenceSequence" ("prefix", "manilaDate", "lastValue")
    VALUES (${prefix}, ${manilaDate}, 1)
    ON CONFLICT ("prefix", "manilaDate")
    DO UPDATE SET "lastValue" = "RmaReferenceSequence"."lastValue" + 1
    RETURNING "lastValue"
  `;
  const sequence = Number(rows?.[0]?.lastValue);
  if (!Number.isInteger(sequence) || sequence < 1) throw new Error('Failed to allocate RMA slip reference sequence.');
  return formatRmaReference(prefix, manilaDate, sequence);
}
