import { CATEGORY_SCREENS, screenKeyForCategory } from '../routes/screenRouting';
import type { DeliveryCategory, DeliveryRecord } from '../types';

export const COMPANY_HISTORY_PAGE_SIZE = 25;

/** Categories the user can open a module for, in sidebar order. */
export function historyCategories(canAccess: (screen: string) => boolean): DeliveryCategory[] {
  return Object.entries(CATEGORY_SCREENS)
    .filter(([screen]) => canAccess(screen))
    .map(([, category]) => category);
}

/** The module screen a history row opens, or null when the user can't open it. */
export function recordScreen(record: Pick<DeliveryRecord, 'category'>, canAccess: (screen: string) => boolean): string | null {
  const screen = screenKeyForCategory(record.category);
  return CATEGORY_SCREENS[screen] && canAccess(screen) ? screen : null;
}

/**
 * Company history is joined on the Company ID only. Records are already
 * filtered by the server; this guards the list against a mismatched page and
 * makes sure no record is ever associated by its display name.
 */
export function companyRecords(records: DeliveryRecord[], companyId: string): DeliveryRecord[] {
  return records.filter(record => record.company_id === companyId);
}

/** A full page means the server may have more rows after it. */
export function nextHistoryCursor(page: Pick<DeliveryRecord, 'id'>[]): string | undefined {
  return page.length === COMPANY_HISTORY_PAGE_SIZE ? page[page.length - 1].id : undefined;
}
