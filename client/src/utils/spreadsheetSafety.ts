/**
 * Spreadsheet formula-injection guard (CSV/Excel "DDE" injection).
 *
 * A cell whose text starts with `=`, `+`, `-`, `@` (optionally after leading
 * whitespace), a tab or a carriage return can be evaluated by Excel as a formula.
 * Prefixing a single apostrophe makes Excel treat the whole cell as literal text.
 */
export const FORMULA_PREFIX_PATTERN = /^[\t\r\n ]*[=+\-@]|^[\t\r]/;

export function sanitizeSpreadsheetCell(value: string | null | undefined): string {
  if (value === null || value === undefined) return '';
  const text = String(value).replace(/\r\n/g, '\n');
  return FORMULA_PREFIX_PATTERN.test(text) ? `'${text}` : text;
}

export interface SpreadsheetRun { text: string; bold?: boolean }

/**
 * Rich-text cells: Excel reads the concatenated runs, so the combined text is
 * checked and the apostrophe goes on the first non-empty run.
 */
export function sanitizeRichTextRuns<T extends SpreadsheetRun>(runs: readonly T[]): T[] {
  const result = runs.map(run => ({ ...run, text: String(run.text ?? '').replace(/\r\n/g, '\n') }));
  const first = result.findIndex(run => run.text.length > 0);
  if (first >= 0 && FORMULA_PREFIX_PATTERN.test(result.map(run => run.text).join(''))) {
    result[first] = { ...result[first], text: `'${result[first].text}` };
  }
  return result;
}
