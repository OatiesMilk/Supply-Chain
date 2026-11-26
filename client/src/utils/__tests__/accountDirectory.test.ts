import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ApiAccountManagerOption } from '../../api';
import {
  accountManagerAfterCompanyChange, accountManagerOptionGroups, companyAccountManagers, companySapNumbers, defaultAccountManagerFor,
  preferredAccountManagerFor,
} from '../accountDirectory';

const directory: ApiAccountManagerOption[] = [
  { id: 'am-1', name: 'P. Soriano', is_active: true },
  { id: 'am-2', name: 'C. Lim', is_active: false },
  { id: 'am-3', name: 'B. Reyes', is_active: true },
];
const single = { name: 'Acme Corp', default_account_manager: directory[0], account_managers: [directory[0]] };
const multi = { name: 'BDO Unibank', default_account_manager: directory[2], account_managers: [directory[2], directory[1], directory[0]] };
const walkIn = { name: 'Walk-in Client', default_account_manager: null, account_managers: [] };

test('companySapNumbers lists every SAP number, none for walk-ins, and falls back to the legacy single value', () => {
  assert.deepEqual(companySapNumbers({ sap_number: 'SAP-1', sap_numbers: ['SAP-1', ' SAP-2 ', 'sap-2', ''] }), ['SAP-1', 'SAP-2']);
  assert.deepEqual(companySapNumbers({ sap_number: '', sap_numbers: [] }), []);
  assert.deepEqual(companySapNumbers({ sap_number: 'SAP-OLD' }), ['SAP-OLD'], 'older payloads without sap_numbers');
  assert.deepEqual(companySapNumbers(undefined), []);
});

test('companyAccountManagers returns active assigned names in the live spelling', () => {
  assert.deepEqual(companyAccountManagers(multi, directory), ['B. Reyes', 'P. Soriano'], 'inactive C. Lim is skipped');
  assert.deepEqual(companyAccountManagers(multi, [{ ...directory[2], name: 'Bea Reyes' }]), ['Bea Reyes'], 'renamed; missing from live list is skipped');
  assert.deepEqual(companyAccountManagers(multi, undefined), ['B. Reyes', 'P. Soriano'], 'before the directory loads');
  assert.deepEqual(companyAccountManagers({ default_account_manager: directory[0] }, directory), ['P. Soriano'], 'legacy payload');
  assert.deepEqual(companyAccountManagers(walkIn, directory), []);
});

test('only a company with exactly one active Account Manager auto-fills; Auto Fill prefers the first assigned', () => {
  assert.equal(defaultAccountManagerFor(single, directory), 'P. Soriano');
  assert.equal(defaultAccountManagerFor(multi, directory), '', 'several AMs: the user chooses');
  assert.equal(defaultAccountManagerFor(walkIn, directory), '');
  assert.equal(defaultAccountManagerFor({ account_managers: [directory[1]], default_account_manager: directory[1] }, directory), '', 'inactive only');
  assert.equal(preferredAccountManagerFor(multi, directory), 'B. Reyes');
  assert.equal(preferredAccountManagerFor(walkIn, directory), '');
});

test('Account Manager picker lists the company\'s assigned AMs first, then everyone else', () => {
  const choices = ['B. Reyes', 'P. Soriano', 'Z. Cruz'];
  assert.deepEqual(accountManagerOptionGroups(multi, choices, directory), [
    { label: 'Assigned to BDO Unibank', options: ['B. Reyes', 'P. Soriano'] },
    { label: 'Other Account Managers', options: ['Z. Cruz'] },
  ]);
  assert.equal(accountManagerOptionGroups(walkIn, choices, directory), undefined, 'flat list without assignments');
  assert.equal(accountManagerOptionGroups(undefined, choices, directory), undefined);
});

test('changing company never overwrites a manual Account Manager; an auto-filled one follows the new company', () => {
  assert.equal(accountManagerAfterCompanyChange('', undefined, single, directory), 'P. Soriano');
  assert.equal(accountManagerAfterCompanyChange('Z. Cruz', single, multi, directory), 'Z. Cruz', 'manual pick is kept');
  assert.equal(accountManagerAfterCompanyChange('P. Soriano', single, walkIn, directory), '', 'auto-filled AM not assigned to the new company is cleared');
  assert.equal(accountManagerAfterCompanyChange('P. Soriano', single, multi, directory), 'P. Soriano', 'kept when also assigned to the new company');
  assert.equal(accountManagerAfterCompanyChange('', single, multi, directory), '', 'several AMs: nothing is guessed');
  assert.equal(accountManagerAfterCompanyChange('P. Soriano', single, { account_managers: [directory[2]], default_account_manager: directory[2] }, directory),
    'B. Reyes');
});
