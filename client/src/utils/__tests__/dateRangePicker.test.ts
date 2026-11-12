import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addCalendarDays, addCalendarMonths, calendarCells, calendarKeyboardDay, calendarPresets, formatCalendarRange, orderedCalendarRange } from '../dateRangePicker';

test('dragging backwards and selecting a single day produce valid inclusive ranges', () => {
  assert.deepEqual(orderedCalendarRange('2026-11-03', '2026-10-29'), { from: '2026-10-29', to: '2026-11-03' });
  assert.deepEqual(orderedCalendarRange('2026-10-14', '2026-10-14'), { from: '2026-10-14', to: '2026-10-14' });
});

test('calendar arithmetic crosses leap days and years without timezone shifts', () => {
  assert.equal(addCalendarDays('2024-02-28', 1), '2024-02-29');
  assert.equal(addCalendarDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addCalendarMonths('2024-01-31', 1), '2024-02-29');
  assert.equal(addCalendarMonths('2024-02-29', 12), '2025-02-28');
  const cells = calendarCells('2024-02-01');
  assert.equal(cells.length, 6);
  assert.ok(cells.every(row => row.length === 7));
  assert.equal(cells.flat().filter(Boolean).length, 29);
  assert.equal(new Set(cells.flat().filter(Boolean)).size, 29);
});

test('keyboard navigation follows calendar weeks, months and years', () => {
  assert.equal(calendarKeyboardDay('2026-10-31', 'ArrowRight'), '2026-11-01');
  assert.equal(calendarKeyboardDay('2026-10-14', 'ArrowUp'), '2026-10-07');
  assert.equal(calendarKeyboardDay('2026-10-14', 'Home'), '2026-10-11');
  assert.equal(calendarKeyboardDay('2026-10-14', 'End'), '2026-10-17');
  assert.equal(calendarKeyboardDay('2024-03-31', 'PageUp'), '2024-02-29');
  assert.equal(calendarKeyboardDay('2024-02-29', 'PageDown', true), '2025-02-28');
  assert.equal(calendarKeyboardDay('2026-10-14', 'Enter'), null);
});

test('presets use the supplied business date and the trigger describes open-ended filters', () => {
  const presets = calendarPresets('2026-01-03');
  assert.deepEqual(presets[1], { label: 'Last 7 days', from: '2025-12-28', to: '2026-01-03' });
  assert.deepEqual(presets[2], { label: 'This month', from: '2026-01-01', to: '2026-01-31' });
  assert.equal(formatCalendarRange('', ''), 'All delivery dates');
  assert.equal(formatCalendarRange('2026-10-14', '2026-10-14'), '14 Oct 2026');
  assert.equal(formatCalendarRange('', '2026-10-14'), 'Through 14 Oct 2026');
});
