export type DriverSheetAction = 'start' | 'complete';

/** Starting a run is a confirmation: the note is optional and the server records "Transport started" when it is blank.
 *  Completing a delivery still needs remarks. */
export function remarksRequired(action: DriverSheetAction): boolean {
  return action === 'complete';
}

/** Confirm stays disabled while saving, on a photo/recipient problem, and (complete only) until remarks are typed. */
export function confirmDisabled(action: DriverSheetAction, remarks: string, saving: boolean, photoError: string | null): boolean {
  return saving || !!photoError || (remarksRequired(action) && !remarks.trim());
}
