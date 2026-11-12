// Users see the short record number (e.g. DEL-26-00042). The internal id is
// only a fallback for payloads cached before record numbers were added.
export function recordLabel(record: { id: string; record_no?: string | null }): string {
  return record.record_no || record.id;
}
