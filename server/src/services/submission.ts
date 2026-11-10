// Single place that decides DeliveryRecord.submittedAt, so create, edit and
// status routes cannot drift. "Submitted" means the record left Draft; the
// latest submission wins, so age restarts after a return to Draft.

export function submittedAtOnCreate(draft: boolean, now: Date = new Date()): Date | null {
  return draft ? null : now;
}

/** Fields to merge into a Prisma update when the draft flag may change. */
export function submittedAtChange(
  wasDraft: boolean,
  willBeDraft: boolean,
  now: Date = new Date(),
): { submittedAt?: Date | null } {
  if (wasDraft === willBeDraft) return {};
  return { submittedAt: willBeDraft ? null : now };
}
