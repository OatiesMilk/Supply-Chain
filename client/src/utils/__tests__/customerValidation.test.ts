import { test } from 'node:test';
import assert from 'node:assert/strict';
import { changedCustomerFields, customerDraft, validateCustomerEdit, validateField, validateRemarks } from '../customerValidation';

const saved = customerDraft({
  name: 'Acme Trading', contact_person: 'Ana', email: 'ana@acme.ph', phone: '02-8000-1111', city: 'Makati', address: '1 Ayala Ave',
});

test('a valid edit with a reason has no errors', () => {
  assert.deepEqual(validateCustomerEdit({ ...saved, city: 'Taguig' }, 'Moved offices'), {});
});

test('required name, email format, phone characters and the reason are checked inline', () => {
  const errors = validateCustomerEdit({ ...saved, name: '  ', email: 'ana@', phone: 'call me' }, '   ');
  assert.match(errors.name!, /required/);
  assert.match(errors.email!, /valid email/);
  assert.match(errors.phone!, /numbers/);
  assert.match(errors.remarks!, /reason/);
});

test('optional fields may be cleared, but not past their length limits', () => {
  assert.equal(validateField('email', ''), undefined);
  assert.equal(validateField('contact_person', ''), undefined);
  assert.match(validateField('city', 'x'.repeat(81))!, /80 characters/);
  assert.match(validateRemarks('x'.repeat(1001))!, /1000 characters/);
});

test('only fields that differ after trimming count as changes', () => {
  assert.deepEqual(changedCustomerFields(saved, { ...saved, name: '  Acme Trading  ' }), []);
  assert.deepEqual(changedCustomerFields(saved, { ...saved, city: 'Taguig', phone: '' }), ['phone', 'city']);
});
