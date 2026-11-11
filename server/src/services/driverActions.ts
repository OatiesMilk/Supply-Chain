import { driverDeliveryDateError, isoTimestamp, runState, timeInError, type RunRecord } from './deliveryLifecycle';
import { rmaTransportContext, rmaTransportDateError, type RmaMovementRecord } from './rmaMovement';

/** The only two things a Driver can do on an assigned run. */
export interface DriverActions {
  start: boolean;
  complete: boolean;
  /** Why Start is not available yet, when that is useful to show the Driver. */
  start_blocked_reason: string | null;
}

export const RECEIVED_BY_MAX_LENGTH = 120;
export const RECEIVED_BY_REQUIRED = 'Received By is required before completing this run.';
export function receivedByError(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return RECEIVED_BY_REQUIRED;
  if (value.trim().length > RECEIVED_BY_MAX_LENGTH) return `Received By must be ${RECEIVED_BY_MAX_LENGTH} characters or fewer.`;
  return null;
}

type DriverRecord = RunRecord & RmaMovementRecord & { rmaTransportStatus?: string | null; rmaReceivedAt?: Date | string | null };

/** Mirrors the server checks on time-in, status and rma-transport so the Driver card has one code path.
 * POD and Received By are still checked when the Driver completes. */
export function driverActions(record: DriverRecord, now = new Date()): DriverActions {
  const blocked = (reason: string | null): DriverActions => ({ start: false, complete: false, start_blocked_reason: reason });
  if (record.draft) return blocked(null);
  if (record.category === 'RMA') {
    const context = rmaTransportContext(record, now);
    if (!context.eligible || record.rmaReceivedAt) return blocked(null);
    if (!context.actionAllowed) return blocked(record.rmaTransportStatus === 'PENDING' ? rmaTransportDateError(record, now) : null);
    return { start: record.rmaTransportStatus === 'PENDING', complete: record.rmaTransportStatus === 'IN_TRANSIT', start_blocked_reason: null };
  }
  const state = runState(record);
  if (state === 'Delivered') return blocked(null);
  if (isoTimestamp(record.timeIn)) return { start: false, complete: state === 'In Transit' || state === 'Pending', start_blocked_reason: null };
  if (state === 'On-Hold') return blocked('On hold. Contact Logistics.');
  const reason = driverDeliveryDateError(record, 'DRIVER', now) ?? timeInError(record);
  return { start: reason === null, complete: false, start_blocked_reason: reason };
}
