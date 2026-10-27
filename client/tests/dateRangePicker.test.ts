import assert from 'node:assert/strict';
import { test } from 'node:test';
import React, { act, useState } from 'react';
import { JSDOM } from 'jsdom';
import type { CalendarRange } from '../src/utils/dateRangePicker';

async function withPicker(run: (dom: JSDOM, changes: CalendarRange[]) => Promise<void>) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost', pretendToBeVisual: true });
  const saved = Object.getOwnPropertyDescriptors(globalThis);
  const globals = {
    window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
    Element: dom.window.Element, HTMLElement: dom.window.HTMLElement, Node: dom.window.Node,
    Document: dom.window.Document, MutationObserver: dom.window.MutationObserver,
    getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
    requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window),
    cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window), IS_REACT_ACT_ENVIRONMENT: true,
  };
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { value, configurable: true });
  const { default: DateRangePicker } = await import('../src/components/DateRangePicker');
  const changes: CalendarRange[] = [];
  function Harness() {
    const [range, setRange] = useState({ from: '2026-10-14', to: '2026-10-17' });
    const [open, setOpen] = useState(false);
    return React.createElement(DateRangePicker, {
      dateFrom: range.from, dateTo: range.to, open, onOpenChange: setOpen,
      onChange: next => { changes.push(next); setRange(next); },
    });
  }
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(dom.window.document.getElementById('root')!);
  try {
    await act(async () => root.render(React.createElement(Harness)));
    await run(dom, changes);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    for (const key of Object.keys(globals)) {
      if (saved[key]) Object.defineProperty(globalThis, key, saved[key]);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
}

const button = (dom: JSDOM, text: string) => [...dom.window.document.querySelectorAll<HTMLButtonElement>('button')]
  .find(element => element.textContent?.trim() === text)!;
const day = (dom: JSDOM, value: string) => dom.window.document.querySelector<HTMLButtonElement>(`[data-calendar-day="${value}"]`)!;
const click = async (element: HTMLButtonElement) => { assert.ok(element); await act(async () => { element.click(); }); };
const settleFocus = async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 35)); }); };

test('calendar edits stay local until Apply; cancelling restores the saved range', async () => {
  await withPicker(async (dom, changes) => {
    await click(dom.window.document.querySelector('button')!);
    await click(day(dom, '2026-10-20'));
    await click(day(dom, '2026-10-10'));
    assert.deepEqual(changes, []);
    assert.match(dom.window.document.querySelector('[aria-live="polite"]')!.textContent!, /10 Oct 2026 – 20 Oct 2026/);
    await click(button(dom, 'Cancel'));
    assert.equal(dom.window.document.querySelector('[role="dialog"]'), null);
    assert.match(dom.window.document.querySelector('button')!.textContent!, /14 Oct 2026 – 17 Oct 2026/);
    await click(dom.window.document.querySelector('button')!);
    await click(day(dom, '2026-10-14'));
    await act(async () => day(dom, '2026-10-14').dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })));
    await settleFocus();
    assert.equal(dom.window.document.activeElement, day(dom, '2026-10-15'));
    await click(day(dom, '2026-10-15'));
    await click(button(dom, 'Apply dates'));
    assert.deepEqual(changes, [{ from: '2026-10-14', to: '2026-10-15' }]);
    await click(dom.window.document.querySelector('button')!);
    await click(button(dom, 'Clear dates'));
    assert.deepEqual(changes[1], { from: '', to: '' });
  });
});

test('reverse pointer dragging captures one pointer, previews a range, and applies only once', async () => {
  await withPicker(async (dom, changes) => {
    await click(dom.window.document.querySelector('button')!);
    const first = day(dom, '2026-10-20');
    const last = day(dom, '2026-10-10');
    const grid = dom.window.document.querySelector<HTMLDivElement>('[role="grid"]')!.parentElement!.parentElement!;
    let capture: number | null = null;
    grid.setPointerCapture = id => { capture = id; };
    grid.hasPointerCapture = id => capture === id;
    grid.releasePointerCapture = () => { capture = null; };
    dom.window.document.elementFromPoint = () => last;
    const pointer = async (target: Element, type: string, pointerId = 1) => {
      const event = new dom.window.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: 10, clientY: 10 });
      Object.defineProperties(event, { pointerId: { value: pointerId }, pointerType: { value: 'mouse' }, isPrimary: { value: pointerId === 1 } });
      await act(async () => { target.dispatchEvent(event); });
    };
    await pointer(first, 'pointerdown');
    assert.equal(capture, 1);
    await pointer(grid, 'pointermove', 2);
    assert.equal(last.closest('[role="gridcell"]')?.getAttribute('aria-selected'), 'false');
    await pointer(grid, 'pointermove');
    assert.equal(last.closest('[role="gridcell"]')?.getAttribute('aria-selected'), 'true');
    assert.deepEqual(changes, []);
    await pointer(grid, 'pointerup');
    assert.equal(capture, null);
    await settleFocus();
    assert.equal(dom.window.document.activeElement, last);
    await click(button(dom, 'Apply dates'));
    assert.deepEqual(changes, [{ from: '2026-10-10', to: '2026-10-20' }]);
  });
});

test('touch selects the range with two taps without intercepting scroll gestures', async () => {
  await withPicker(async (dom, changes) => {
    await click(dom.window.document.querySelector('button')!);
    const tap = async (value: string) => {
      const target = day(dom, value);
      const press = new dom.window.MouseEvent('pointerdown', { bubbles: true, cancelable: true });
      Object.defineProperties(press, { pointerType: { value: 'touch' }, pointerId: { value: 1 }, isPrimary: { value: true } });
      await act(async () => {
        target.dispatchEvent(press);
        target.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, detail: 1 }));
      });
      assert.equal(press.defaultPrevented, false);
    };
    await tap('2026-10-21');
    await tap('2026-10-19');
    assert.deepEqual(changes, []);
    await click(button(dom, 'Apply dates'));
    assert.deepEqual(changes, [{ from: '2026-10-19', to: '2026-10-21' }]);
  });
});
