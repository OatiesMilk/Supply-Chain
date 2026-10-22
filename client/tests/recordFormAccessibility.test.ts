import { test } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { renderToString } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import RecordCreateForm from '../src/features/deliveries/RecordCreateForm';
import ComboboxField from '../src/components/ComboboxField';

const props = {
  category: 'Deliveries' as const, categoryLocked: false,
  availableCategories: ['Deliveries' as const], companies: [],
  onSubmit: async () => { throw new Error('Unexpected save'); }, onCancel: () => {},
};

test('creation labels target controls and describe draft requirements and native upload', () => {
  const dom = new JSDOM(renderToString(React.createElement(RecordCreateForm, props)));
  try {
    const document = dom.window.document;
    for (const label of document.querySelectorAll('label')) {
      assert.ok(label.htmlFor, `Missing association: ${label.textContent}`);
      assert.ok(document.getElementById(label.htmlFor), `Missing target: ${label.textContent}`);
    }
    const date = document.querySelector<HTMLInputElement>('input[type="date"]')!;
    assert.match(date.labels![0].textContent!, /required to submit; optional for drafts/);
    assert.equal(date.required, false, 'Draft must remain possible without a date');
    const file = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    assert.match(file.labels![0].textContent!, /Document Attachments/);
    assert.equal(file.classList.contains('hidden'), false);
    assert.ok(document.getElementById(file.getAttribute('aria-describedby')!));
  } finally { dom.window.close(); }
});

async function withDom(run: (dom: JSDOM, root: import('react-dom/client').Root) => Promise<void>) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' });
  const saved = Object.getOwnPropertyDescriptors(globalThis);
  const globals = { window: dom.window, document: dom.window.document, navigator: dom.window.navigator, IS_REACT_ACT_ENVIRONMENT: true, requestAnimationFrame: (callback: () => void) => setTimeout(callback, 0) };
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { value, configurable: true });
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(dom.window.document.getElementById('root')!);
  try { await run(dom, root); } finally {
    await act(async () => root.unmount()); dom.window.close();
    for (const key of Object.keys(globals)) {
      if (saved[key]) Object.defineProperty(globalThis, key, saved[key]); else Reflect.deleteProperty(globalThis, key);
    }
  }
}

test('invalid submit focuses company and connects each field error to its control', async () => {
  await withDom(async (dom, root) => {
    await act(async () => root.render(React.createElement(RecordCreateForm, props)));
    const form = dom.window.document.querySelector('form')!;
    await act(async () => { form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })); });
    await new Promise(resolve => setTimeout(resolve, 10));
    const invalid = [...form.querySelectorAll<HTMLInputElement>('[aria-invalid="true"]')];
    assert.equal(invalid.length, 3);
    assert.equal(dom.window.document.activeElement, invalid[0]);
    for (const input of invalid) {
      const error = dom.window.document.getElementById(input.getAttribute('aria-describedby')!);
      assert.equal(error?.getAttribute('role'), 'alert');
      assert.match(error!.textContent!, /required/);
    }
  });
});

test('combobox Arrow and Enter choose a named option; closed Enter allows submission', async () => {
  await withDom(async (dom, root) => {
    const selected: string[] = [];
    await act(async () => root.render(React.createElement(ComboboxField, { label: 'Company Name', options: ['Alpha', 'Beta'], value: '', onChange: value => selected.push(value) })));
    const input = dom.window.document.querySelector<HTMLInputElement>('input')!;
    await act(async () => input.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true })));
    assert.equal(input.getAttribute('aria-expanded'), 'true');
    const active = dom.window.document.getElementById(input.getAttribute('aria-activedescendant')!);
    assert.equal(active?.textContent, 'Alpha');
    await act(async () => input.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })));
    assert.deepEqual(selected, ['Alpha']);
    assert.equal(dom.window.document.activeElement, input);
    await act(async () => input.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    const enter = new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    input.dispatchEvent(enter);
    assert.equal(enter.defaultPrevented, false);
  });
});
