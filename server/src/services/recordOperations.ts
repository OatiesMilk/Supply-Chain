import type { AuthUser } from '../middleware/auth';
import { CATEGORY_TO_DB } from '../mappings';
import { canCreateCategory, canPerformRecordAction, canReadRecord, canWriteCategory, runStateForPermission, type PolicyRecord } from './recordAccess';
import type { RunState } from './deliveryLifecycle';

type RecordContext = PolicyRecord & { rmaMovement?: string | null; rmaTransportStatus?: string | null; rmaReceivedAt?: Date | string | null };
const detailFields = ['company_id', 'priority', 'reference', 'rma_reference', 'category', 'area', 'address', 'account_manager', 'delivery_date',
  'item_type', 'is_draft', 'date_time', 'item_description', 'line_items', 'attachments', 'amount', 'driver', 'driver_id', 'vehicle',
  'driver_assistants', 'time_in', 'time_out', 'received_by', 'linked_collection_id', 'rma_type', 'rma_movement', 'purchase_date',
  'customer_contact_name', 'customer_contact_email', 'customer_contact_phone', 'remarks', 'expected_version'];
export function recordMutationInputError(body: unknown, route: string, method: string): string | null {
  if (method === 'GET' || route.includes('/attachments') && method === 'POST') return null;
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 'Record mutation must be an object';
  const allowed = route.endsWith('/status') ? ['status', 'remarks', 'priority', 'received_by', 'delivery_date', 'expected_version']
    : route.endsWith('/comments') ? ['body'] : route.endsWith('/time-in') ? ['remarks']
    : route.endsWith('/verify-collection') ? [] : route.includes('/attachments') ? ['remarks']
    : method === 'POST' ? [...detailFields, 'status', 'company_name', 'output_actions_log'] : detailFields;
  return Object.keys(body).some(key => !allowed.includes(key)) ? 'Unsupported record mutation fields' : null;
}
/** Fixed endpoint/field mapping, independent of client navigation or claimed role. */
export function recordOperationError(user: AuthUser, record: RecordContext, body: Record<string, unknown>, route: string, method: string): string | null {
  if (user.activeMode !== 'V1' || method === 'GET') return null;
  if (!canReadRecord(user, record) || !canWriteCategory(user, record.category ?? '')) return 'Record operation denied';
  const allowed = (action: Parameters<typeof canPerformRecordAction>[2], target?: RunState, correction = false) => canPerformRecordAction(user, record, action, target, correction);
  if (route.includes('/attachments')) return allowed('POD') ? null : 'Attachment changes denied';
  if (route.endsWith('/comments')) return allowed('COMMENT') ? null : 'Record comments denied';
  // Authorize the action independently of mutable verification state. The
  // handler rechecks lifecycle under its lock and returns a conflict on repeats.
  if (route.endsWith('/verify-collection')) return allowed('VERIFY_COLLECTION', undefined, true) ? null : 'Collection verification denied';
  if (route.endsWith('/time-in')) return allowed('TIME_IN') ? null : 'Time In denied';
  if (route.endsWith('/status')) {
    const target = body.status as RunState;
    if (target !== runStateForPermission(record) && !allowed('STATUS', target)) return 'Status changes denied';
    if (target === 'Delivered' && !allowed('COMPLETE', target)) return 'Completion denied';
    if (body.received_by !== undefined && !allowed('COMPLETE', undefined, true)) return 'Recipient changes denied';
    if ((body.priority !== undefined || body.delivery_date !== undefined) && !allowed('UPDATE')) return 'Record detail changes denied';
    return null;
  }
  if (method === 'DELETE') return 'Record deletion is disabled';
  if (method !== 'PUT') return 'Unknown record mutation';
  if (body.category !== undefined) {
    const destination = CATEGORY_TO_DB[String(body.category)] ?? body.category;
    if (destination !== record.category) {
      if (typeof destination !== 'string' || !canCreateCategory(user, destination) || !allowed('UPDATE')) return 'Source or destination category denied';
      // Category relocation is not an existing operation. Never silently ignore it.
      return 'Category relocation is not supported';
    }
  }
  const fields = Object.keys(body).filter(key => !['remarks', 'expected_version', 'category'].includes(key));
  const assignment = ['driver', 'driver_id', 'vehicle', 'driver_assistants'];
  const clocks = ['time_in', 'time_out'];
  const special = [...assignment, ...clocks, 'received_by', 'is_draft'];
  if (['attachments', 'document_attachment'].some(key => key in body) && !allowed('POD')) return 'Document changes denied';
  if (assignment.some(key => key in body) && !allowed('ASSIGN')) return 'Assignment changes denied';
  if ('time_in' in body && !allowed('TIME_IN', undefined, true)) return 'Timestamp corrections denied';
  if ('time_out' in body && !allowed('COMPLETE', undefined, true)) return 'Completion timestamp corrections denied';
  if ('received_by' in body && !allowed('COMPLETE', undefined, true)) return 'Recipient changes denied';
  if ('is_draft' in body && (!allowed('SUBMIT', undefined, true) || (body.is_draft === 'Yes') !== !!record.draft
    && !allowed(body.is_draft === 'Yes' ? 'STATUS' : 'SUBMIT', body.is_draft === 'Yes' ? 'Draft' : 'Scheduled'))) return 'Draft submission changes denied';
  if (fields.some(key => !special.includes(key)) && !allowed('UPDATE')) return 'Record detail changes denied';
  if (!fields.length && !allowed(user.role === 'DRIVER' ? 'COMMENT' : 'UPDATE')) return 'Record note changes denied';
  return null;
}
