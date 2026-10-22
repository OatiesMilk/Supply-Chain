import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import React, { act } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { Button, IconButton, Field, Input, Select, Textarea, StatusBadge, ErrorState } from '../src/components/ui';

const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');
const tokens = Object.fromEntries([...css.matchAll(/--(mg-[\w-]+):\s*(#[\da-f]{6});/gi)].map(match => [match[1], match[2]]));
function luminance(hex: string) {
  const rgb = hex.slice(1).match(/../g)!.map(value => parseInt(value, 16) / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}
function contrast(a: string, b: string) {
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

test('shared token text and focus pairs meet their contrast thresholds', () => {
  for (const [text, background] of [
    ['mg-brand-navy', 'mg-surface'], ['mg-brand-blue', 'mg-surface'], ['mg-danger', 'mg-surface'],
    ['mg-text', 'mg-surface'], ['mg-text-muted', 'mg-surface-muted'],
    ['mg-danger-text', 'mg-danger-surface'], ['mg-success-text', 'mg-success-surface'],
    ['mg-warning-text', 'mg-warning-surface'], ['mg-info-text', 'mg-info-surface'],
  ]) assert.ok(contrast(tokens[text], tokens[background]) >= 4.5, `${text} on ${background}`);
  for (const name of ['mg-control-border', 'mg-focus']) assert.ok(contrast(tokens[name], tokens['mg-surface']) >= 3, name);
  assert.match(css, /--mg-control-height:\s*max\(44px,\s*2\.75rem\)/);
  assert.match(css, /prefers-reduced-motion:\s*reduce[\s\S]*\.mg-button\s*\{\s*transition:\s*none/);
});

test('native props and readable status survive without internal styling API attributes', () => {
  const html = renderToStaticMarkup(React.createElement('div', null,
    React.createElement(Button, { variant: 'danger', loading: true, name: 'action', value: 'delete' }, 'Delete'),
    React.createElement(IconButton, { label: 'Close', variant: 'secondary' }, '×'),
    React.createElement(StatusBadge, { tone: 'warning', children: 'On-Hold' }),
    React.createElement(ErrorState, { tone: 'warning' }, 'Refresh failed'),
    React.createElement(Field, { id: 'company', label: 'Company', description: 'Choose a company', error: 'Company is required', required: true,
      children: props => React.createElement(Input, { ...props, name: 'company' }) }),
    React.createElement(Select, { name: 'module', defaultValue: 'RMA' }, React.createElement('option', { value: 'RMA' }, 'RMA')),
    React.createElement(Textarea, { name: 'remarks', rows: 3, defaultValue: 'Keep this note' }),
  ));
  const doc = new JSDOM(html).window.document;
  const pending = doc.querySelector<HTMLButtonElement>('button[name="action"]')!;
  assert.equal(pending.disabled, true);
  assert.equal(pending.type, 'button');
  assert.equal(pending.getAttribute('aria-busy'), 'true');
  assert.equal(pending.value, 'delete');
  assert.ok(doc.querySelector('button[aria-label="Close"]'));
  for (const attr of ['variant', 'loading', 'tone', 'label']) assert.equal(doc.querySelector(`[${attr}]`), null, attr);
  const input = doc.querySelector<HTMLInputElement>('#company')!;
  assert.equal(doc.querySelector<HTMLLabelElement>('label')!.control, input);
  assert.equal(input.getAttribute('aria-describedby'), 'company-help company-error');
  assert.equal(input.getAttribute('aria-invalid'), 'true');
  assert.equal(input.getAttribute('aria-required'), 'true');
  assert.equal(input.required, false, 'Field must not impose native required validation on draft forms');
  assert.equal(doc.getElementById('company-error')?.getAttribute('role'), 'alert');
  assert.equal(doc.querySelector('.mg-badge')?.textContent, 'On-Hold');
  assert.equal(doc.querySelector('select')?.value, 'RMA');
  assert.equal(doc.querySelector('textarea')?.value, 'Keep this note');
});

test('native submitter values survive while toolbar and loading actions cannot submit', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' });
  const saved = Object.getOwnPropertyDescriptors(globalThis);
  const globals = { window: dom.window, document: dom.window.document, navigator: dom.window.navigator, IS_REACT_ACT_ENVIRONMENT: true };
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { value, configurable: true });
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(dom.window.document.getElementById('root')!);
  const submitted: string[] = [];
  try {
    await act(async () => root.render(React.createElement<React.FormHTMLAttributes<HTMLFormElement>>('form', { onSubmit: event => { event.preventDefault(); submitted.push(((event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement).value); } },
      React.createElement(Button, null, 'Toolbar'),
      React.createElement(Button, { type: 'submit', value: 'draft' }, 'Save as Draft'),
      React.createElement(Button, { type: 'submit', value: 'submit' }, 'Submit'),
      React.createElement(Button, { type: 'submit', loading: true }, 'Working'),
    )));
    for (const button of dom.window.document.querySelectorAll('button')) await act(async () => button.click());
    assert.deepEqual(submitted, ['draft', 'submit']);
  } finally {
    await act(async () => root.unmount()); dom.window.close();
    for (const key of Object.keys(globals)) { if (saved[key]) Object.defineProperty(globalThis, key, saved[key]); else Reflect.deleteProperty(globalThis, key); }
  }
});
