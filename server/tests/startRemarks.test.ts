import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_START_REMARK, resolveStartRemarks } from '../src/services/startRemarks';

const REQUIRED = 'Remarks are required.';

test('a Driver start with a blank or missing note records the default remark', () => {
  for (const raw of [undefined, null, '', '   ', '\n\t']) {
    assert.deepEqual(resolveStartRemarks(raw, 'DRIVER', REQUIRED), { ok: true, remarks: DEFAULT_START_REMARK });
  }
  assert.equal(DEFAULT_START_REMARK, 'Transport started');
});

test('a typed Driver note is trimmed and replaces the default', () => {
  assert.deepEqual(resolveStartRemarks('  Using backup van  ', 'DRIVER', REQUIRED), { ok: true, remarks: 'Using backup van' });
});

test('non-Driver roles still need a reason when recording a start', () => {
  for (const role of ['LOGISTICS', 'ADMIN', 'TASS', 'SALES_COORDINATOR']) {
    for (const raw of [undefined, null, '', '  ']) assert.deepEqual(resolveStartRemarks(raw, role, REQUIRED), { ok: false, error: REQUIRED });
    assert.deepEqual(resolveStartRemarks(' Customer called ', role, REQUIRED), { ok: true, remarks: 'Customer called' });
  }
});

test('non-string remarks are rejected for every role', () => {
  for (const role of ['DRIVER', 'LOGISTICS']) {
    for (const raw of [5, true, {}, ['x']]) assert.deepEqual(resolveStartRemarks(raw, role, REQUIRED), { ok: false, error: 'Remarks must be text.' });
  }
});
