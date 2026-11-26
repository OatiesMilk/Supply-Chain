import assert from 'node:assert/strict';
import { test } from 'node:test';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import type { RecordLineItem, RmaContact } from '../src/types';
import ComboboxField from '../src/components/ComboboxField';
import { RmaStructuredItemsEditor } from '../src/features/deliveries/RmaStructuredItemsEditor';
import { RmaContactsEditor } from '../src/features/deliveries/RmaContactsEditor';

// #359: the shared create/overview controls follow the #357 pattern — linked labels,
// visible focus rings and errors announced through role="alert" + aria-describedby.

async function withDom(run: (ui: { dom: JSDOM; doc: Document; render: (node: React.ReactNode) => Promise<void> }) => Promise<void>) {
  const saved = Object.getOwnPropertyDescriptors(globalThis);
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' });
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  const globals = { window: dom.window, document: dom.window.document, navigator: dom.window.navigator, Element: dom.window.Element,
    HTMLElement: dom.window.HTMLElement, Node: dom.window.Node, IS_REACT_ACT_ENVIRONMENT: true };
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { value, configurable: true });
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(dom.window.document.getElementById('root')!);
  try {
    await run({ dom, doc: dom.window.document, render: async node => { await act(async () => root.render(node)); } });
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    for (const key of Object.keys(globals)) { if (saved[key]) Object.defineProperty(globalThis, key, saved[key]); else Reflect.deleteProperty(globalThis, key); }
  }
}

const labelFor = (doc: Document, text: string) => [...doc.querySelectorAll('label')].filter(label => label.textContent?.trim().startsWith(text));
const linkedInput = (doc: Document, label: HTMLLabelElement) => {
  assert.ok(label.htmlFor, `label "${label.textContent}" has htmlFor`);
  const input = doc.getElementById(label.htmlFor);
  assert.ok(input, `label "${label.textContent}" points at an element`);
  return input as HTMLInputElement;
};
const type = async (dom: JSDOM, input: HTMLInputElement, value: string) => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  });
};
const key = async (dom: JSDOM, input: HTMLInputElement, name: string) => {
  await act(async () => { input.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true })); });
};

test('ComboboxField links its label, exposes combobox ARIA and keeps ids unique across instances', async () => {
  await withDom(async ({ dom, doc, render }) => {
    const values: Record<string, string> = { area: '', manager: '' };
    const draw = () => render(React.createElement(React.Fragment, null,
      React.createElement(ComboboxField, { label: 'Area', required: true, options: ['Makati', 'Pasig', 'Taguig'], value: values.area, onChange: v => { values.area = v; } }),
      React.createElement(ComboboxField, { label: 'Account Manager', optional: true, options: ['Alex', 'Bea'], value: values.manager, onChange: v => { values.manager = v; } }),
    ));
    await draw();
    const area = linkedInput(doc, labelFor(doc, 'Area')[0]);
    const manager = linkedInput(doc, labelFor(doc, 'Account Manager')[0]);
    assert.notEqual(area.id, manager.id, 'each instance has its own id');
    assert.equal(area.getAttribute('role'), 'combobox');
    assert.equal(area.getAttribute('aria-autocomplete'), 'list');
    assert.equal(area.getAttribute('aria-required'), 'true', 'required is exposed programmatically');
    assert.equal(manager.getAttribute('aria-required'), null);
    assert.equal(area.getAttribute('aria-expanded'), 'false');
    assert.equal(labelFor(doc, 'Area')[0].querySelector('span')?.getAttribute('aria-hidden'), 'true', 'the visual asterisk is hidden');
    assert.match(area.className, /focus:ring-2/, 'brand focus ring');
    assert.match(area.className, /focus:ring-brand-blue\/25/);
    assert.equal(doc.querySelector('svg')?.getAttribute('aria-hidden'), 'true', 'the chevron is decorative');

    // Keyboard: ArrowDown opens and highlights, Enter commits, Escape closes. A user types into a focused input.
    await act(async () => area.focus());
    await key(dom, area, 'Escape');
    await key(dom, area, 'ArrowDown');
    assert.equal(area.getAttribute('aria-expanded'), 'true');
    const listbox = doc.getElementById(area.getAttribute('aria-controls')!);
    assert.equal(listbox?.getAttribute('role'), 'listbox', 'aria-controls points at the listbox');
    const active = doc.getElementById(area.getAttribute('aria-activedescendant')!);
    assert.equal(active?.textContent, 'Makati', 'the highlighted option is the active descendant');
    assert.equal(active?.getAttribute('aria-selected'), 'true');
    await key(dom, area, 'ArrowDown');
    assert.equal(doc.getElementById(area.getAttribute('aria-activedescendant')!)?.textContent, 'Pasig');
    await key(dom, area, 'Enter');
    assert.equal(values.area, 'Pasig', 'Enter selects the highlighted option');
    assert.equal(area.getAttribute('aria-expanded'), 'false');
    await key(dom, area, 'ArrowDown');
    assert.equal(area.getAttribute('aria-expanded'), 'true');
    await key(dom, area, 'Escape');
    assert.equal(area.getAttribute('aria-expanded'), 'false', 'Escape closes the list');
    assert.equal(area.getAttribute('aria-activedescendant'), null);

    // Typing filters; no matches is announced as status text.
    await type(dom, manager, 'zzz');
    assert.equal(doc.querySelector('[role="status"]')?.textContent?.trim(), 'No matches found');
  });
});

test('ComboboxField announces its error and clears the link when the error goes away', async () => {
  await withDom(async ({ doc, render }) => {
    const draw = (error?: string) => render(React.createElement(ComboboxField, { label: 'Company Name', required: true, options: ['BDO'], value: '', onChange() {}, error }));
    await draw('Company is required');
    const input = linkedInput(doc, labelFor(doc, 'Company Name')[0]);
    assert.equal(input.getAttribute('aria-invalid'), 'true');
    const describedBy = input.getAttribute('aria-describedby')!;
    const error = doc.getElementById(describedBy);
    assert.equal(error?.getAttribute('role'), 'alert');
    assert.equal(error?.textContent, 'Company is required');
    await draw(undefined);
    assert.equal(input.getAttribute('aria-invalid'), 'false');
    assert.equal(input.getAttribute('aria-describedby'), null);
    assert.equal(doc.querySelector('[role="alert"]'), null);
  });
});

test('ComboboxField uses a caller-supplied id', async () => {
  await withDom(async ({ dom, doc, render }) => {
    await render(React.createElement(ComboboxField, { id: 'create-area', label: 'Area', options: ['Makati'], value: '', onChange() {}, error: 'Area is required' }));
    const input = doc.getElementById('create-area') as HTMLInputElement;
    assert.equal(labelFor(doc, 'Area')[0].htmlFor, 'create-area');
    assert.equal(input.getAttribute('aria-describedby'), 'create-area-error');
    // aria-controls only points at the listbox while it is mounted.
    assert.equal(input.getAttribute('aria-controls'), null, 'no dangling aria-controls while collapsed');
    assert.equal(doc.getElementById('create-area-listbox'), null);
    await act(async () => input.focus());
    await key(dom, input, 'Escape');
    await key(dom, input, 'ArrowDown');
    assert.equal(input.getAttribute('aria-controls'), 'create-area-listbox');
    assert.equal(doc.getElementById('create-area-listbox')?.getAttribute('role'), 'listbox', 'aria-controls resolves to the mounted listbox');
  });
});

test('RmaStructuredItemsEditor links labels per row, shows focus rings and announces its error', async () => {
  await withDom(async ({ doc, render }) => {
    const items: RecordLineItem[] = [{ sku: '', quantity: 1, unit_type: 'Unit' }, { sku: 'Laptop', quantity: 2, unit_type: 'Unit' }];
    const draw = (error?: string, prefix = 'create-rma-item') => render(React.createElement(React.Fragment, null,
      React.createElement(RmaStructuredItemsEditor, { idPrefix: prefix, items, onChange() {}, error }),
      React.createElement(RmaStructuredItemsEditor, { idPrefix: 'overview-rma-item', items, onChange() {} }),
    ));
    await draw('Item 1 requires a unit description or model.');
    const ids = [...doc.querySelectorAll('[id]')].map(el => el.id);
    assert.equal(new Set(ids).size, ids.length, 'ids are unique across rows and editors');
    for (const label of doc.querySelectorAll('label[for]')) linkedInput(doc, label as HTMLLabelElement);
    const group = doc.querySelector('[role="group"][aria-labelledby="create-rma-item-heading"]')!;
    assert.ok(group, 'the editor is a labelled group');
    assert.equal(doc.getElementById('create-rma-item-heading')?.textContent?.startsWith('Units / Items'), true);
    assert.equal(group.getAttribute('aria-describedby'), 'create-rma-item-error');
    const error = doc.getElementById('create-rma-item-error')!;
    assert.equal(error.getAttribute('role'), 'alert');
    const blank = doc.getElementById('create-rma-item-sku-0')!;
    const filled = doc.getElementById('create-rma-item-sku-1')!;
    assert.equal(blank.getAttribute('aria-invalid'), 'true', 'the blank required model is flagged');
    assert.equal(blank.getAttribute('aria-describedby'), 'create-rma-item-error');
    assert.equal(filled.getAttribute('aria-invalid'), null, 'a filled model is not flagged');
    assert.equal(filled.getAttribute('aria-describedby'), null, 'a filled model is not linked to the error');
    for (const id of ['create-rma-item-quantity-0', 'create-rma-item-unit_type-0', 'create-rma-item-sku-0', 'create-rma-item-status_tag-1']) {
      assert.match(doc.getElementById(id)!.className, /focus:ring-2 focus:ring-brand-blue\/25/, `${id} has the brand focus ring`);
    }
    for (const button of doc.querySelectorAll('button')) assert.match(button.className, /focus-visible:outline-brand-blue/, `"${button.textContent || button.getAttribute('aria-label')}" has a focus-visible ring`);
    for (const radio of doc.querySelectorAll('input[type="radio"]')) assert.match(radio.className, /focus-visible:outline-brand-blue/);
    for (const icon of doc.querySelectorAll('svg')) assert.equal(icon.getAttribute('aria-hidden'), 'true');

    await draw(undefined);
    assert.equal(doc.getElementById('create-rma-item-error'), null, 'the error clears');
    assert.equal(group.getAttribute('aria-describedby'), null);
    assert.equal(doc.getElementById('create-rma-item-sku-0')?.getAttribute('aria-invalid'), null);
  });
});

test('RmaContactsEditor links a label to every contact input and flags only the invalid email', async () => {
  await withDom(async ({ doc, render }) => {
    const contacts: RmaContact[] = [{ name: 'Ana', phone: '0917', email: 'ana@example.test' }, { name: 'Ben', phone: '', email: 'not-an-email' }];
    const draw = (error?: string) => render(React.createElement(React.Fragment, null,
      React.createElement(RmaContactsEditor, { idPrefix: 'create-rma-contact', contacts, onChange() {}, error }),
      React.createElement(RmaContactsEditor, { idPrefix: 'overview-rma-contact', contacts, onChange() {} }),
    ));
    await draw('Enter a valid contact email address');
    const ids = [...doc.querySelectorAll('[id]')].map(el => el.id);
    assert.equal(new Set(ids).size, ids.length, 'ids are unique across rows and editors');
    for (const [row, field] of [[0, 'name'], [0, 'phone'], [0, 'email'], [1, 'name'], [1, 'phone'], [1, 'email']] as const) {
      const input = doc.getElementById(`create-rma-contact-${field}-${row}`)!;
      const label = doc.querySelector<HTMLLabelElement>(`label[for="create-rma-contact-${field}-${row}"]`);
      assert.equal(label?.textContent, `Contact ${row + 1} ${field}`, 'the accessible name comes from a linked label');
      assert.equal(input.hasAttribute('aria-label'), false);
      assert.match(input.className, /focus:ring-2 focus:ring-brand-blue\/25/);
    }
    const fieldset = doc.querySelector('fieldset')!;
    assert.equal(fieldset.getAttribute('aria-describedby'), 'create-rma-contact-error');
    assert.equal(doc.getElementById('create-rma-contact-error')?.getAttribute('role'), 'alert');
    const valid = doc.getElementById('create-rma-contact-email-0')!;
    const invalid = doc.getElementById('create-rma-contact-email-1')!;
    assert.equal(valid.getAttribute('aria-invalid'), null);
    assert.equal(invalid.getAttribute('aria-invalid'), 'true');
    assert.equal(invalid.getAttribute('aria-describedby'), 'create-rma-contact-error');
    assert.match(invalid.className, /border-red-500/);
    for (const button of [...doc.querySelectorAll('button')]) assert.match(button.className, /focus-visible:outline-brand-blue/);

    await draw(undefined);
    assert.equal(doc.getElementById('create-rma-contact-error'), null, 'the error clears');
    assert.equal(fieldset.getAttribute('aria-describedby'), null);
    assert.equal(doc.getElementById('create-rma-contact-email-1')?.getAttribute('aria-invalid'), null);
  });
});
