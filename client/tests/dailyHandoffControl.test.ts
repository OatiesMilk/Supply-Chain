import { test } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';

// #352: TASS "Daily handoff" control (Dispatch primary; Extract Slips / DRR in an accessible menu).

async function mount(props: Partial<{ canDispatch: boolean; disabled: boolean; variant: 'toolbar' | 'bulk' }> = {}) {
  const dom = new JSDOM('<div id="outside"></div><div id="root"></div>', { url: 'http://localhost' });
  const names = ['window', 'document', 'navigator', 'Element', 'HTMLElement', 'Node', 'IS_REACT_ACT_ENVIRONMENT'] as const;
  const original = Object.getOwnPropertyDescriptors(globalThis);
  for (const [name, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, Element: dom.window.Element,
    HTMLElement: dom.window.HTMLElement, Node: dom.window.Node, IS_REACT_ACT_ENVIRONMENT: true })) Object.defineProperty(globalThis, name, { value, configurable: true });
  const { createRoot } = await import('react-dom/client');
  const { default: DailyHandoffControl } = await import('../src/features/deliveries/DailyHandoffControl');
  const calls: string[] = [];
  const root = createRoot(dom.window.document.getElementById('root')!);
  await act(async () => root.render(React.createElement(DailyHandoffControl, {
    variant: props.variant ?? 'toolbar', canDispatch: props.canDispatch ?? true, disabled: props.disabled,
    onDispatch: () => calls.push('dispatch'), onExtractSlips: () => calls.push('slips'), onDailyRouteSlip: () => calls.push('drr'),
  })));
  const doc = dom.window.document;
  const prefix = props.variant ?? 'toolbar';
  const trigger = () => doc.getElementById(`${prefix}-daily-handoff-menu`) as HTMLButtonElement;
  const menu = () => doc.querySelector('[role="menu"]');
  const key = (target: Element, k: string) => act(async () => { target.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: k, bubbles: true })); });
  const click = (target: Element) => act(async () => { (target as HTMLElement).click(); });
  return { dom, doc, calls, trigger, menu, key, click, prefix, close: async () => {
    await act(async () => root.unmount()); dom.window.close();
    for (const name of names) { if (original[name]) Object.defineProperty(globalThis, name, original[name]); else Reflect.deleteProperty(globalThis, name); }
  } };
}

test('Dispatch is a direct primary button; the menu trigger announces its popup state', async () => {
  const ui = await mount();
  try {
    const group = ui.doc.querySelector('[role="group"]')!;
    assert.equal(group.getAttribute('aria-label'), 'Daily handoff');
    await ui.click(ui.doc.getElementById('toolbar-dispatch-logistics')!);
    assert.deepEqual(ui.calls, ['dispatch']);
    assert.equal(ui.trigger().getAttribute('aria-haspopup'), 'menu');
    assert.equal(ui.trigger().getAttribute('aria-expanded'), 'false');
    assert.equal(ui.trigger().getAttribute('aria-label'), 'More daily handoff outputs');
    assert.equal(ui.menu(), null);
  } finally { await ui.close(); }
});

test('opening the menu focuses the first item; arrows, Home and End move focus and wrap', async () => {
  const ui = await mount();
  try {
    await ui.click(ui.trigger());
    assert.equal(ui.trigger().getAttribute('aria-expanded'), 'true');
    assert.equal(ui.trigger().getAttribute('aria-controls'), ui.menu()!.id);
    const [slips, drr] = [...ui.doc.querySelectorAll('[role="menuitem"]')];
    assert.deepEqual([slips.textContent?.trim(), drr.textContent?.trim()], ['Extract Slips (PDF)', 'Daily Route Slip (DRR)']);
    assert.equal(ui.doc.activeElement, slips);
    await ui.key(slips, 'ArrowDown'); assert.equal(ui.doc.activeElement, drr);
    await ui.key(drr, 'ArrowDown'); assert.equal(ui.doc.activeElement, slips, 'wraps to the first item');
    await ui.key(slips, 'ArrowUp'); assert.equal(ui.doc.activeElement, drr, 'wraps to the last item');
    await ui.key(drr, 'Home'); assert.equal(ui.doc.activeElement, slips);
    await ui.key(slips, 'End'); assert.equal(ui.doc.activeElement, drr);
  } finally { await ui.close(); }
});

test('Escape closes the menu and returns focus to its trigger', async () => {
  const ui = await mount();
  try {
    await ui.click(ui.trigger());
    await ui.key(ui.doc.activeElement!, 'Escape');
    assert.equal(ui.menu(), null);
    assert.equal(ui.doc.activeElement, ui.trigger());
    assert.equal(ui.trigger().getAttribute('aria-expanded'), 'false');
  } finally { await ui.close(); }
});

test('choosing an item runs it once and closes the menu; an outside click also closes it', async () => {
  const ui = await mount();
  try {
    await ui.click(ui.trigger());
    await ui.click(ui.doc.getElementById('toolbar-tass-daily-route-slip')!);
    assert.deepEqual(ui.calls, ['drr']);
    assert.equal(ui.menu(), null);
    await ui.click(ui.trigger());
    await ui.click(ui.doc.getElementById('toolbar-extract-slips')!);
    assert.deepEqual(ui.calls, ['drr', 'slips']);
    await ui.click(ui.trigger());
    await act(async () => { ui.doc.getElementById('outside')!.dispatchEvent(new ui.dom.window.MouseEvent('mousedown', { bubbles: true })); });
    assert.equal(ui.menu(), null);
  } finally { await ui.close(); }
});

test('read-only TASS gets a labelled "Daily handoff" menu and no Dispatch button', async () => {
  const ui = await mount({ canDispatch: false });
  try {
    assert.equal(ui.doc.getElementById('toolbar-dispatch-logistics'), null);
    assert.equal(ui.trigger().textContent?.trim(), 'Daily handoff');
    assert.equal(ui.trigger().hasAttribute('aria-label'), false, 'the visible text is the accessible name');
  } finally { await ui.close(); }
});

test('the bulk variant uses bulk ids and is disabled while a bulk update runs', async () => {
  const ui = await mount({ variant: 'bulk', disabled: true });
  try {
    assert.equal((ui.doc.getElementById('bulk-dispatch-logistics') as HTMLButtonElement).disabled, true);
    assert.equal(ui.trigger().disabled, true);
    assert.ok(ui.doc.querySelector('[data-testid="bulk-daily-handoff"]'));
  } finally { await ui.close(); }
});
