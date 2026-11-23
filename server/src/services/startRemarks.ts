/** Remarks for the action that starts a run (Time In, RMA transport start).
 *  A Driver starting an already-assigned run has no change to justify, so the note is optional and the server
 *  records a standard remark to keep the append-only remark history complete. Every other role is recording a
 *  start on a driver's behalf, which stays an exception act with a required reason. */
export const DEFAULT_START_REMARK = 'Transport started';

export type StartRemarks = { ok: true; remarks: string } | { ok: false; error: string };

export function resolveStartRemarks(raw: unknown, role: string, requiredMessage: string): StartRemarks {
  if (raw !== undefined && raw !== null && typeof raw !== 'string') return { ok: false, error: 'Remarks must be text.' };
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (text) return { ok: true, remarks: text };
  if (role === 'DRIVER') return { ok: true, remarks: DEFAULT_START_REMARK };
  return { ok: false, error: requiredMessage };
}
