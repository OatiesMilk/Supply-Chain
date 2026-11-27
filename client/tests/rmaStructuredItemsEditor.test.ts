import assert from 'node:assert/strict';
import { test } from 'node:test';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import type { RecordLineItem } from '../src/types';
import { RmaStructuredItemsEditor, cleanRmaItems, emptyRmaItem, hasAnyRmaItemInput, resolveRmaSerialMode } from '../src/features/deliveries/RmaStructuredItemsEditor';
import { submissionErrors } from '../src/utils/recordLifecycle';

const validRma = { company_name: 'BDO', company_id: 'c1', reference: '', delivery_date: '2026-11-24', category: 'RMA', rma_type: 'Pull Out Slip',
  rma_movement: 'INTERNAL_NO_DRIVER', priority: '2 - Moderate', area: 'Makati', account_manager: 'Alex AM' };

test('F-01: untouched placeholder rows are dropped, but no row with input is silently lost', () => {
  assert.deepEqual(cleanRmaItems([emptyRmaItem()]), []);
  assert.deepEqual(cleanRmaItems([{ ...emptyRmaItem(), sku: '   ', serial_number: '  ', status_tag: ' ' }]), []);
  assert.equal(hasAnyRmaItemInput(emptyRmaItem()), false);
  const rows: RecordLineItem[] = [
    ...(['serial_number', 'new_serial_number', 'defective_serial_number', 'purchase_date', 'sales_order_no', 'accessories',
      'problem_description', 'repair_note', 'status_tag'] as const).map(field => ({ ...emptyRmaItem(), [field]: field === 'purchase_date' ? '2025-01-02' : 'value' })),
    { ...emptyRmaItem(), quantity: 2 },
  ];
  for (const row of rows) {
    const label = JSON.stringify(row);
    assert.equal(hasAnyRmaItemInput(row), true, label);
    const cleaned = cleanRmaItems([row]);
    assert.equal(cleaned.length, 1, label);
    assert.equal(cleaned[0].sku, '', label);
    for (const isDraft of [false, true]) {
      assert.match(submissionErrors({ ...validRma, line_items: cleaned }, isDraft).line_items ?? '', /requires a unit description or model/i, `${label} draft=${isDraft}`);
    }
  }
});

test('F-05: saved serial values win over the local toggle; blank rows keep the chosen mode', () => {
  assert.equal(resolveRmaSerialMode({ serial_number: null }, 'single'), 'single');
  assert.equal(resolveRmaSerialMode({ serial_number: '' }, 'pair'), 'pair');
  assert.equal(resolveRmaSerialMode(undefined), 'single');
  assert.equal(resolveRmaSerialMode({ new_serial_number: 'N1' }, 'single'), 'pair');
  assert.equal(resolveRmaSerialMode({ defective_serial_number: 'D1' }, 'single'), 'pair');
  assert.equal(resolveRmaSerialMode({ serial_number: 'S1' }, 'pair'), 'single');
});

test('F-05: a mounted editor follows reloaded items and keeps a user-chosen pair mode on a blank row', async () => {
  const saved = Object.getOwnPropertyDescriptors(globalThis);
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/rma' });
  const globals = { window: dom.window, document: dom.window.document, navigator: dom.window.navigator, Element: dom.window.Element, IS_REACT_ACT_ENVIRONMENT: true };
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { value, configurable: true });
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(dom.window.document.getElementById('root')!);
  const doc = dom.window.document;
  let items: RecordLineItem[] = [{ sku: 'Laptop', quantity: 1, unit_type: 'Unit', serial_number: 'SN-1' }];
  const render = () => root.render(React.createElement(RmaStructuredItemsEditor, { idPrefix: 'test-item', items, onChange: next => { items = next; render(); } }));
  const radio = (row: number, label: string) => [...doc.querySelectorAll<HTMLInputElement>(`input[name="test-item-serial-mode-${row}"]`)]
    .find(input => input.parentElement?.textContent?.includes(label))!;
  const input = (id: string) => doc.getElementById(id) as HTMLInputElement | null;
  try {
    await act(async () => render());
    assert.equal(radio(0, 'Single Serial Number').checked, true);
    assert.equal(input('test-item-serial_number-0')?.value, 'SN-1');

    // Simulate useLatestSaved(): new items prop on the already-mounted editor.
    items = [{ sku: 'Laptop', quantity: 1, unit_type: 'Unit', serial_number: null, new_serial_number: 'NEW-9', defective_serial_number: 'DEF-9' }];
    await act(async () => render());
    assert.equal(radio(0, 'Replacement Unit (New SN + Defective SN)').checked, true);
    assert.equal(input('test-item-new_serial_number-0')?.value, 'NEW-9');
    assert.equal(input('test-item-defective_serial_number-0')?.value, 'DEF-9');
    assert.equal(input('test-item-serial_number-0'), null);

    // A blank row toggled to pair mode stays in pair mode.
    items = [...items, emptyRmaItem()];
    await act(async () => render());
    assert.equal(radio(1, 'Single Serial Number').checked, true);
    await act(async () => radio(1, 'Replacement Unit (New SN + Defective SN)').click());
    assert.equal(radio(1, 'Replacement Unit (New SN + Defective SN)').checked, true);
    assert.ok(input('test-item-new_serial_number-1'));
    assert.ok(input('test-item-defective_serial_number-1'));
    assert.equal(input('test-item-serial_number-1'), null);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    for (const key of Object.keys(globals)) {
      if (saved[key]) Object.defineProperty(globalThis, key, saved[key]); else delete (globalThis as Record<string, unknown>)[key];
    }
  }
});
