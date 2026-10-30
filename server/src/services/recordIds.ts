import { randomUUID } from 'node:crypto';

// Keep legacy IDs addressable while giving every runtime creation path the
// same collision-resistant namespace, independent of demo-data randomness.
export function generateRecordId(): string {
  return `REC-${randomUUID()}`;
}
