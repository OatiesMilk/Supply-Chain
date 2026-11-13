import type { Page } from '@playwright/test';

/** Short user-facing record numbers, e.g. DEL-26-00042 (see server/src/services/recordIds.ts). */
export const RECORD_NO_PATTERN = /^(DEL|RMA|PUP|SO|COL)-\d{2}-\d{5,}$/;

// Paged tables render loading/empty rows too; only real record cells can open
// a workspace. Waiting for the row position alone races the server response.
export function recordRows(page: Page) {
  return page.getByRole('row').filter({ has: page.getByRole('cell', { name: RECORD_NO_PATTERN }) });
}

/** The UAT seed's Delivered delivery, found by its SAP reference because rows show record numbers. */
export async function deliveredFixtureRow(page: Page) {
  await page.getByRole('textbox', { name: 'Search delivery records' }).fill('SAP-UAT-DELIVERED-PRIORITY');
  return recordRows(page).first();
}
