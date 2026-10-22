import { afterEach, test, mock } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import RecordCreateForm from '../src/features/deliveries/RecordCreateForm';
import ComboboxField from '../src/components/ComboboxField';
import type { ApiCompany } from '../src/api';
import type { DeliveryRecord } from '../src/types';

afterEach(() => mock.restoreAll());

async function withDom(run: (dom: JSDOM, root: import('react-dom/client').Root) => Promise<void>) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' });
  const saved = Object.getOwnPropertyDescriptors(globalThis);
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, requestAnimationFrame: (callback: FrameRequestCallback) => setTimeout(() => callback(0), 0), IS_REACT_ACT_ENVIRONMENT: true })) Object.defineProperty(globalThis, key, { value, configurable: true });
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(dom.window.document.getElementById('root')!);
  try { await run(dom, root); } finally {
    await act(async () => root.unmount());
    dom.window.close();
    for (const key of ['window', 'document', 'navigator', 'requestAnimationFrame', 'IS_REACT_ACT_ENVIRONMENT']) {
      if (saved[key]) Object.defineProperty(globalThis, key, saved[key]); else Reflect.deleteProperty(globalThis, key);
    }
  }
}

const company = { id: 'company-1', name: 'Example Company' } as ApiCompany;

test('shared record form keeps native draft and submission values and existing lifecycle callbacks', async () => {
  await withDom(async (dom, root) => {
    const submissions: Partial<DeliveryRecord>[] = [];
    let cancelled = 0;
    await act(async () => root.render(React.createElement(RecordCreateForm, {
      category: 'Deliveries', categoryLocked: false, availableCategories: ['Deliveries', 'RMA'], companies: [company],
      onSubmit: async data => { submissions.push(data); return { ...data, id: `record-${submissions.length}` } as DeliveryRecord; },
      onCancel: () => { cancelled++; },
    })));
    const document = dom.window.document;
    const draft = document.querySelector<HTMLButtonElement>('button[value="draft"]')!;
    const submit = document.querySelector<HTMLButtonElement>('button[value="submit"]')!;
    assert.equal(draft.type, 'submit');
    assert.equal(submit.type, 'submit');
    assert.equal(document.querySelector<HTMLInputElement>('#record-create-reference')!.required, false, 'drafts must not be blocked by native required validation');
    const companyInput = document.getElementById('record-create-company')!;
    assert.equal(document.querySelector('label[for="record-create-company"]')?.textContent?.includes('Company Name'), true);
    await act(async () => companyInput.dispatchEvent(new dom.window.FocusEvent('focusin', { bubbles: true })));
    await act(async () => document.querySelector('[role="option"]')!.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true, cancelable: true })));
    await act(async () => document.querySelector('form')!.dispatchEvent(new dom.window.SubmitEvent('submit', { bubbles: true, cancelable: true, submitter: draft })));
    assert.equal(submissions[0].company_id, company.id);
    assert.equal(submissions[0].status, 'Draft');
    assert.equal(submissions[0].is_draft, 'Yes');
    assert.equal(submissions[0].reference, '');
    assert.equal(cancelled, 1);
    const autofill = [...document.querySelectorAll('button')].find(button => button.textContent?.includes('Auto Fill'))!;
    await act(async () => autofill.click());
    await act(async () => document.querySelector('form')!.dispatchEvent(new dom.window.SubmitEvent('submit', { bubbles: true, cancelable: true, submitter: submit })));
    assert.equal(submissions[1].status, 'Scheduled');
    assert.equal(submissions[1].is_draft, 'No');
    assert.ok(submissions[1].reference);
    assert.ok(submissions[1].delivery_date);
    assert.equal(cancelled, 2);
  });
});

test('record field errors are associated by shared Field and line-item controls retain their callbacks', async () => {
  await withDom(async (dom, root) => {
    let calls = 0;
    await act(async () => root.render(React.createElement(RecordCreateForm, {
      category: 'Deliveries', categoryLocked: true, companies: [company],
      onSubmit: async () => { calls++; return { id: 'unused' } as DeliveryRecord; }, onCancel() {},
    })));
    const document = dom.window.document;
    await act(async () => document.querySelector('form')!.dispatchEvent(new dom.window.SubmitEvent('submit', { bubbles: true, cancelable: true, submitter: document.querySelector<HTMLButtonElement>('button[value="submit"]')! })));
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); });
    assert.equal(calls, 0);
    assert.equal(document.activeElement, document.getElementById('record-create-company'));
    const reference = document.getElementById('record-create-reference')!;
    assert.equal(reference.getAttribute('aria-invalid'), 'true');
    assert.ok(reference.getAttribute('aria-describedby')?.split(' ').some(id => document.getElementById(id)?.textContent?.includes('required')));
    const add = [...document.querySelectorAll('button')].find(button => button.textContent?.includes('Add Item'))!;
    await act(async () => add.click());
    assert.ok(document.querySelector('label[for="record-create-item-0-sku"]'));
    assert.ok(document.querySelector('label[for="record-create-item-0-quantity"]'));
    await act(async () => document.querySelector<HTMLButtonElement>('button[aria-label="Remove item 1"]')!.click());
    assert.equal(document.getElementById('record-create-item-0-sku'), null);
  });
});

test('Combobox Field/Input migration preserves keyboard selection and error description', async () => {
  await withDom(async (dom, root) => {
    const choices: string[] = [];
    await act(async () => root.render(React.createElement(ComboboxField, {
      id: 'example-combo', label: 'Company', options: ['Alpha', 'Beta'], value: '', onChange: value => choices.push(value), error: 'Choose a company.',
    })));
    const input = dom.window.document.getElementById('example-combo')!;
    assert.ok(dom.window.document.querySelector('label[for="example-combo"]'));
    assert.equal(input.getAttribute('aria-invalid'), 'true');
    assert.ok(input.getAttribute('aria-describedby')?.includes('example-combo-error'));
    await act(async () => input.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })));
    await act(async () => input.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    assert.deepEqual(choices, ['Alpha']);
  });
});
