import type { Page } from '@playwright/test';

// Paged tables render loading/empty rows too; only real record cells can open
// a workspace. Waiting for the row position alone races the server response.
export function recordRows(page: Page) {
  return page.getByRole('row').filter({ has: page.getByRole('cell', { name: /^REC-[A-Za-z0-9-]+$/ }) });
}

