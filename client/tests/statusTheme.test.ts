import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeStatusKey,
  statusBadgeClass,
  statusChipClass,
  statusDisplayLabel,
  statusDotClass,
} from '../src/utils/statusTheme';

test('statusTheme normalizes UI display keys and uppercase Transaction Center keys identically', () => {
  assert.equal(normalizeStatusKey('Delivered'), 'Complete');
  assert.equal(normalizeStatusKey('ACCOMPLISHED'), 'Complete');
  assert.equal(normalizeStatusKey('Complete'), 'Complete');
  assert.equal(normalizeStatusKey('TRANSPORT_COMPLETE'), 'Transport Complete');
  assert.equal(normalizeStatusKey('ON_HOLD'), 'On-Hold');
  assert.equal(normalizeStatusKey('RESCHEDULED'), 'Rescheduled');
  assert.equal(normalizeStatusKey('IN_TRANSIT'), 'In Transit');
  assert.equal(normalizeStatusKey('unknown-value'), null);
});

test('statusTheme unifies Completed/Delivered on emerald and Rescheduled on purple', () => {
  for (const key of ['Delivered', 'Complete', 'ACCOMPLISHED']) {
    assert.equal(statusDisplayLabel(key), 'Complete');
    assert.match(statusBadgeClass(key), /bg-emerald-50 text-emerald-700 border-emerald-200/);
    assert.match(statusChipClass(key), /bg-emerald-50 text-emerald-700/);
    assert.equal(statusDotClass(key), 'bg-emerald-500');
  }

  for (const key of ['Rescheduled', 'RESCHEDULED']) {
    assert.equal(statusDisplayLabel(key), 'Rescheduled');
    assert.match(statusBadgeClass(key), /bg-purple-50 text-purple-700 border-purple-200/);
    assert.equal(statusDotClass(key), 'bg-purple-500');
  }

  assert.equal(statusDotClass('unknown'), 'bg-slate-300');
  assert.equal(statusDisplayLabel('CustomStatus'), 'CustomStatus');
});
