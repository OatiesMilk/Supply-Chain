import { afterEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { api } from '../src/api';
import { installLegacySession } from './helpers/permissionSession';
import { uiHarness } from './helpers/uiHarness';

installLegacySession('LOGISTICS', 'deliveries');
afterEach(() => mock.restoreAll());

const photo = [{ id: 'photo', original_name: 'pod.png', mime_type: 'image/png', is_photo: true }];
const pdf = [{ id: 'doc', original_name: 'doc.pdf', mime_type: 'application/pdf', is_photo: false }];

async function mount(attachments: unknown[], onConfirm: (values: any) => Promise<void>, extra: Record<string, unknown> = {}) {
  const ui = await uiHarness();
  mock.method(api, 'getRecordAttachments', async () => attachments as any);
  const closes: string[] = [];
  const { default: Dialog } = await import('../src/features/deliveries/MarkDeliveredDialog');
  const view = (open: boolean) => React.createElement(Dialog, {
    open, recordId: 'rec-1', category: 'Deliveries', company: 'Gap Check Company', typeLabel: 'Deliveries', reference: 'DR-1043',
    driver: 'Juan Driver', onConfirm, onClose: (reason: string) => closes.push(reason), ...extra,
  } as any);
  await ui.render(view(true));
  return { ui, closes, view };
}

test('dialog shows the record, the recording-for line and every field', async () => {
  const { ui } = await mount(photo, async () => {});
  try {
    const dialog = ui.doc.querySelector('dialog')!;
    assert.equal(dialog.open, true);
    assert.equal(dialog.querySelector('h2')!.textContent, 'Mark as delivered');
    assert.match(dialog.textContent!, /Gap Check Company · Deliveries · Ref DR-1043/);
    assert.match(dialog.textContent!, /Recording for Juan Driver\. This is saved under your name\./);
    assert.ok(ui.field('Received by')); assert.ok(ui.field('Remarks'));
    assert.match(dialog.textContent!, /Proof of Delivery/);
  } finally { await ui.close(); }
});

test('Confirm stays disabled and Still needed lists the gaps; a PDF alone is not a photo', async () => {
  const { ui } = await mount(pdf, async () => {});
  try {
    assert.equal(ui.button('Mark as delivered')!.disabled, true);
    assert.match(ui.text(), /Still needed: proof photo, Received by, remarks/);
    await ui.type('Received by', 'Warehouse guard');
    assert.match(ui.text(), /Still needed: proof photo, remarks/);
    await ui.type('Received by', 'x'.repeat(121));
    assert.match(ui.text(), /Received by \(up to 120 characters\)/);
    assert.equal(ui.button('Mark as delivered')!.disabled, true);
  } finally { await ui.close(); }
});

test('Confirm sends trimmed values once, then closes with success', async () => {
  const calls: any[] = [];
  const { ui, closes } = await mount(photo, async values => { calls.push(values); });
  try {
    await ui.type('Received by', '  Warehouse guard '); await ui.type('Remarks', ' Handed over ');
    assert.equal(ui.button('Mark as delivered')!.disabled, false);
    assert.match(ui.text(), /Everything is ready\./);
    await ui.click('Mark as delivered');
    assert.deepEqual(calls, [{ receivedBy: 'Warehouse guard', remarks: 'Handed over' }]);
    assert.deepEqual(closes, ['success']);
  } finally { await ui.close(); }
});

test('a rejected save keeps the dialog open with the message and the typed values', async () => {
  const { ui, closes } = await mount(photo, async () => { throw new Error('Upload at least one JPG or PNG delivery photo before completing this delivery.'); });
  try {
    await ui.type('Received by', 'Guard'); await ui.type('Remarks', 'Done');
    await ui.click('Mark as delivered');
    assert.deepEqual(closes, []);
    assert.match(ui.doc.querySelector('[role="alert"]')!.textContent!, /Upload at least one JPG or PNG/);
    assert.equal((ui.field('Received by') as HTMLInputElement).value, 'Guard');
    assert.equal((ui.field('Remarks') as HTMLTextAreaElement).value, 'Done');
  } finally { await ui.close(); }
});

test('Cancel saves nothing, clears the typed values and closes', async () => {
  const calls: unknown[] = [];
  const { ui, closes, view } = await mount(photo, async values => { calls.push(values); });
  try {
    await ui.type('Received by', 'Guard'); await ui.type('Remarks', 'Done');
    await ui.click('Cancel');
    assert.deepEqual(closes, ['cancel']); assert.equal(calls.length, 0);
    await ui.render(view(false)); await ui.render(view(true));
    assert.equal((ui.field('Received by') as HTMLInputElement).value, '');
    assert.equal((ui.field('Remarks') as HTMLTextAreaElement).value, '');
  } finally { await ui.close(); }
});

test('while saving, Cancel does nothing and the fields are locked', async () => {
  let release!: () => void;
  const { ui, closes } = await mount(photo, () => new Promise<void>(resolve => { release = resolve; }));
  try {
    await ui.type('Received by', 'Guard'); await ui.type('Remarks', 'Done');
    await ui.click('Mark as delivered');
    const cancel = ui.button('Cancel')!;
    assert.equal(cancel.disabled, true);
    assert.equal((ui.field('Remarks') as HTMLTextAreaElement).disabled, true);
    await ui.act(async () => release()); await ui.flush();
    assert.deepEqual(closes, ['success']);
  } finally { await ui.close(); }
});

test('Accounting Collection and RMA wording', async () => {
  const collected = await mount(photo, async () => {}, { category: 'Accounting Collection', typeLabel: 'Accounting Collection' });
  try {
    assert.equal(collected.ui.doc.querySelector('dialog h2')!.textContent, 'Mark as collected');
    assert.ok(collected.ui.button('Mark as collected'));
  } finally { await collected.ui.close(); }
  const rma = await mount(photo, async () => {}, { category: 'RMA', typeLabel: 'RMA', rma: true });
  try {
    assert.match(rma.ui.text(), /This completes the transport\. TASS still confirms receipt and completes the RMA\./);
    assert.match(rma.ui.text(), /Proof of Transport/);
  } finally { await rma.ui.close(); }
});

test('Start transport dialog requires remarks and sends them trimmed', async () => {
  const ui = await uiHarness();
  const calls: string[] = []; const closes: string[] = [];
  try {
    const { default: Dialog } = await import('../src/features/deliveries/StartTransportDialog');
    await ui.render(React.createElement(Dialog, { open: true, company: 'Gap Check Company', typeLabel: 'Deliveries', reference: 'DR-1043', driver: 'Juan Driver',
      onConfirm: async (remarks: string) => { calls.push(remarks); }, onClose: (reason: string) => closes.push(reason) }));
    assert.equal(ui.doc.querySelector('dialog h2')!.textContent, 'Start transport');
    assert.match(ui.text(), /Time In is recorded when you confirm\./);
    assert.match(ui.text(), /Recording for Juan Driver/);
    assert.equal(ui.button('Start transport')!.disabled, true);
    assert.match(ui.text(), /Still needed: remarks/);
    await ui.type('Remarks', '  Leaving now '); await ui.click('Start transport');
    assert.deepEqual(calls, ['Leaving now']); assert.deepEqual(closes, ['success']);
  } finally { await ui.close(); }
});

test('Next step card shows the button, explains a disabled state and moves focus after success', async () => {
  const ui = await uiHarness();
  try {
    const { default: Card } = await import('../src/features/deliveries/NextStepCard');
    const presses: number[] = [];
    await ui.render(React.createElement(Card, { text: 'In transit since 9:42 AM', buttonLabel: 'Mark as delivered', onAction: () => presses.push(1), actionHint: 'Opens a short form.' }));
    assert.equal(ui.doc.querySelector('h3')!.textContent, 'Next step');
    await ui.click('Mark as delivered'); assert.equal(presses.length, 1);
    await ui.render(React.createElement(Card, { text: 'In transit', buttonLabel: 'Mark as delivered', onAction: () => {}, disabled: true, hint: 'Save or revert your changes below first.' }));
    assert.equal(ui.button('Mark as delivered')!.disabled, true);
    assert.match(ui.text(), /Save or revert your changes below first\./);
    await ui.render(React.createElement(Card, { text: 'Delivered.', done: true, focusSignal: 1 }));
    assert.equal(ui.doc.activeElement, ui.doc.querySelector('h3'));
  } finally { await ui.close(); }
});
