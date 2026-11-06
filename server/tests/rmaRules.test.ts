import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RMA_CATEGORIES, normalizeRmaCategory, rmaInputError } from '../src/services/rmaRules';
import { RMA_CATEGORIES as CLIENT_CATEGORIES } from '../../client/src/utils/rma';

test('client and server expose the same seven legacy RMA categories', () => {
  assert.deepEqual([...RMA_CATEGORIES], [...CLIENT_CATEGORIES]);
  for (const category of RMA_CATEGORIES) assert.equal(rmaInputError({ rma_type: category }), null);
  assert.match(rmaInputError({ rma_type: 'Unsupported' })!, /Category must be/);
  assert.match(rmaInputError({ rma_type: 42 })!, /Category must be/);
});

test('Reference and Category stay optional, while supplied values are validated', () => {
  const required = { priority: '2 - Moderate', area: 'Carmona', account_manager: 'Alex AM' };
  for (const rma_reference of [undefined, '', null, '00042 / manual-Ref']) {
    assert.equal(rmaInputError({ ...required, rma_reference }, true), null);
  }
  assert.match(rmaInputError({ rma_reference: 42 })!, /Reference must be text/);
  assert.equal(normalizeRmaCategory('Pull out'), 'Pull-Out Slip');
  assert.equal(normalizeRmaCategory('Return to suppliers'), 'Return to Supplier');
  assert.equal(normalizeRmaCategory('Return to Customer'), 'Return to Customer');
  assert.equal(normalizeRmaCategory(null), null);
});
