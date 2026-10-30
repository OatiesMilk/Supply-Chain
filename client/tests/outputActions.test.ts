import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_OUTPUT_ACTIONS, getOutputTrigger, runOutputActions } from '../src/outputActions';
import type { OutputActionConfig } from '../src/types';

const config = (patch: Partial<OutputActionConfig> = {}): OutputActionConfig => ({
  notifyAM: true, notifyLogistics: false, notifyTASS: false, exportPDF: false, internalOnly: false, ...patch,
});
const context = { amName: 'Account Manager', recordId: 'saved-record' };

test('unsaved records and absent clients skip notifications without claiming delivery or export', async () => {
  const result = await runOutputActions('Record Created', config({ exportPDF: true }), { amName: 'AM' });
  assert.deepEqual(result.email, { sent: 0, failed: 0, mocked: 0, skipped: 1 });
  assert.equal(result.emailSent, false); assert.equal(result.pdf, 'skipped');
  assert.match(result.banners.join(' '), /Email skipped.*PDF export skipped/);
  assert.doesNotMatch(result.banners.join(' '), /Email sent|Notified|Exported/);
});

test('dispatch results preserve real sent, partial failure, mock and skipped outcomes', async () => {
  for (const response of [
    { ok: true, sent: 1, failed: 1, mocked: 1, skipped: 1 },
    { ok: true, sent: 0, failed: 1, mocked: 0, skipped: 0 },
    { ok: true, sent: 0, failed: 0, mocked: 1, skipped: 0 },
    { ok: false, sent: 0, failed: 0, mocked: 0, skipped: 1 },
  ]) {
    const calls: unknown[] = [];
    const result = await runOutputActions('Record Created', config(), { ...context, api: { sendNotificationEmail: async data => { calls.push(data); return response; } } });
    assert.deepEqual(calls, [{ recordId: 'saved-record', trigger: 'Record Created', recipients: ['AM'] }]);
    const { ok, ...expected } = response; assert.deepEqual(result.email, expected);
    assert.equal(result.emailSent, response.sent > 0);
    if (response.mocked) assert.match(result.banners.join(' '), /mocked; no email delivered/);
    if (!response.sent) assert.doesNotMatch(result.banners.join(' '), /Email: \d+ sent/);
  }
});

test('provider and PDF failures remain output failures after a saved transition', async () => {
  const result = await runOutputActions('Accomplished', config({ exportPDF: true }), {
    ...context, api: { sendNotificationEmail: async () => { throw new Error('Delivery refused'); } },
    exportPDF: async () => { throw new Error('Download unavailable'); },
  });
  assert.equal(result.emailSent, false); assert.equal(result.email.failed, 1); assert.equal(result.pdf, 'failed');
  assert.match(result.banners.join(' '), /Email failed: Delivery refused.*PDF export failed: Download unavailable/);
});

test('PDF success is reported only after the actual export action resolves', async () => {
  let finish!: () => void;
  const task = runOutputActions('Record Created', config({ notifyAM: false, exportPDF: true }), {
    ...context, exportPDF: () => new Promise<void>(resolve => { finish = resolve; }),
  });
  let finished = false; void task.then(() => { finished = true; });
  await Promise.resolve(); assert.equal(finished, false);
  finish(); const result = await task;
  assert.equal(result.pdf, 'exported'); assert.match(result.banners.join(' '), /Exported record to PDF/);
});

test('internal-only preferences suppress additional outputs and disclose independent workflow notifications', async () => {
  let called = false;
  const result = await runOutputActions('Accomplished', config({ internalOnly: true, exportPDF: true }), {
    ...context, api: { sendNotificationEmail: async () => { called = true; return { ok: true, sent: 1, failed: 0 }; } },
    exportPDF: async () => { called = true; },
  });
  assert.equal(called, false); assert.equal(result.emailSent, false); assert.equal(result.pdf, 'skipped');
  assert.match(result.banners.join(' '), /Automatic workflow notifications are handled separately/);
});

test('collection completion never becomes verification and retains its later independent event', async () => {
  assert.equal(getOutputTrigger('Accounting Collection', 'Delivered'), 'Accomplished');
  assert.equal(getOutputTrigger('Deliveries', 'Delivered'), 'Accomplished');
  assert.equal(getOutputTrigger('RMA', 'Delivered'), 'RMA Completed');
  assert.ok(DEFAULT_OUTPUT_ACTIONS['Collection Verified']);
  const calls: string[][] = [];
  const api = { sendNotificationEmail: async (data: { recipients: string[] }) => { calls.push(data.recipients); return { ok: true, sent: 1, failed: 0 }; } };
  await runOutputActions('Accomplished', config(), { ...context, category: 'Deliveries', api });
  assert.equal(calls.length, 0, 'automatic completion email must not be duplicated by the client');
  await runOutputActions('Accomplished', config(), { ...context, category: 'Accounting Collection', api });
  await runOutputActions('Collection Verified', config(), { ...context, category: 'Accounting Collection', api });
  assert.deepEqual(calls, [['AM'], ['AM']]);
});
