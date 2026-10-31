import { createHash } from 'node:crypto';

// Include the persisted edit state, rather than relying on timestamp precision.
// Related attachment uploads do not overwrite metadata and need not invalidate an editor.
const fields = [
  'id', 'companyId', 'category', 'draft', 'status', 'priority', 'reference', 'rmaReference',
  'remarks', 'vehicle', 'area', 'address', 'driver', 'driverId', 'driverAssistants',
  'timeIn', 'timeOut', 'receivedBy', 'accountManager', 'deliveryDate', 'itemType',
  'itemDescription', 'documentAttachment', 'amount', 'linkedCollectionId',
  'collectionVerified', 'collectionVerifiedBy', 'collectionVerifiedAt', 'modifiedById',
  'updatedAt', 'deletedAt',
] as const;
export function recordEditVersion(record: Record<string, any>): string {
  const lines = (record.lineItems ?? []).map((line: any) => [line.sku, line.quantity])
    .sort((a: any[], b: any[]) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return `record:${createHash('sha256').update(JSON.stringify([fields.map(key => record[key] ?? null), lines])).digest('hex')}`;
}
export function recordEditError(record: Record<string, any>, expected: unknown): { status: number; error: string } | null {
  if (typeof expected !== 'string' || !/^record:[a-f0-9]{64}$/.test(expected)) {
    return { status: 428, error: 'Load the record before editing and supply its edit version.' };
  }
  return expected === recordEditVersion(record) ? null
    : { status: 409, error: 'This record changed in another session. Your draft was not saved. Review the latest record before retrying.' };
}
