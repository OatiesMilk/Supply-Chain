import type { DeliveryCategory, DeliveryRecord, DeliveryStatus } from '../../types';
import { manilaToday, rescheduleDateError, rescheduleNeedsNewDate } from '../../utils/recordLifecycle';

/** Only Delivery records rescheduled by Logistics or Admin require and accept a new delivery date. */
export function driverStatusDateError(
  category: DeliveryCategory,
  status: DeliveryStatus | null,
  newDate: string,
  currentDate: string,
  role?: string | null,
  today = manilaToday(),
): string | null {
  if (status !== 'Rescheduled' || !rescheduleNeedsNewDate(category, role)) return null;
  return rescheduleDateError(newDate, currentDate, today);
}

/** Build the status update payload for Drivers View without sending delivery_date on unsupported categories. */
export function buildDriverStatusUpdates(params: {
  category: DeliveryCategory;
  status: DeliveryStatus;
  remarks: string;
  receivedBy: string;
  rescheduleDate: string;
  role?: string | null;
}): Partial<DeliveryRecord> {
  const { category, status, remarks, receivedBy, rescheduleDate, role } = params;
  const includeRescheduleDate = status === 'Rescheduled' && rescheduleNeedsNewDate(category, role) && !!rescheduleDate;
  return {
    status,
    status_remarks: remarks.trim(),
    ...(status === 'Delivered' ? { received_by: receivedBy } : {}),
    ...(includeRescheduleDate ? { delivery_date: rescheduleDate } : {}),
  } as Partial<DeliveryRecord>;
}
