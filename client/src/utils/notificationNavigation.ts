import { screenKeyForCategory } from '../screenRouting';
import type { ApiNotification } from '../api';
import type { DeliveryRecord } from '../types';

// The list of delivery records is lazy on unrelated screens. Navigate using
// a one-record, authenticated lookup when this notification target is absent
// from the current query cache; never guess that it belongs to Deliveries.
export async function notificationScreen(
  notification: Pick<ApiNotification, 'record_id' | 'record_type'>,
  records: readonly Pick<DeliveryRecord, 'id' | 'category'>[],
  loadRecord: (id: string) => Promise<{ category: string }>
): Promise<string> {
  if (!notification.record_id || !notification.record_type) return 'dashboard';
  if (notification.record_type === 'Sku') return 'inventory';
  if (notification.record_type !== 'DeliveryRecord') return 'dashboard';
  const cached = records.find(r => r.id === notification.record_id);
  if (cached) return screenKeyForCategory(cached.category);
  try {
    const record = await loadRecord(notification.record_id);
    return record?.category ? screenKeyForCategory(record.category as DeliveryRecord['category']) : 'dashboard';
  } catch {
    // Do not navigate to a guessed category when a record was removed, or the
    // current user no longer has access to the linked record.
    return 'dashboard';
  }
}
