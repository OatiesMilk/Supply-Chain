import { prisma } from '../db';

// Central place that writes to audit_log. Every create/update to
// delivery_records must go through here rather than being written ad-hoc in
// route handlers, per spec.
export async function writeAuditLog(params: {
  recordId: string;
  recordType: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE';
  changedById: string;
  previousValue: unknown;
  newValue: unknown;
}) {
  await prisma.auditLog.create({
    data: {
      recordId: params.recordId,
      recordType: params.recordType,
      action: params.action,
      changedById: params.changedById,
      previousValue: params.previousValue ? JSON.stringify(params.previousValue) : null,
      newValue: params.newValue ? JSON.stringify(params.newValue) : null
    }
  });
}
