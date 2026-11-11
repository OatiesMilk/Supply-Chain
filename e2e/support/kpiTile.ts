import { expect, type Page } from '@playwright/test';

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Dashboard KPI tiles are buttons named "<label>, <count> <unit>. View list".
export async function kpiTile(page: Page, label: string) {
  const tile = page.getByRole('button', { name: new RegExp(`^${escape(label)}, [\\d,]+\\b.*View list$`) });
  await expect(tile).toBeVisible();
  const name = (await tile.getAttribute('aria-label')) ?? '';
  const count = Number(name.slice(label.length + 2).match(/^[\d,]+/)?.[0].replace(/,/g, ''));
  expect(Number.isFinite(count), `KPI tile "${label}" has a numeric count`).toBe(true);
  return { tile, count };
}
