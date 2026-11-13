import { mock } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/** JSDOM + React Query harness for component tests. Native dialogs are stubbed (JSDOM has no showModal), so these
 *  tests cover handlers, state and markup, not focus trapping or layout. */
export async function uiHarness() {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' });
  const original = Object.getOwnPropertyDescriptors(globalThis);
  const indexedDB = { open: () => {
    const request: any = { result: { transaction: () => ({ objectStore: () => ({ index: () => ({ getAll: () => {
      const read: any = { result: [] }; queueMicrotask(() => read.onsuccess?.()); return read;
    } }) }) }) } };
    queueMicrotask(() => request.onsuccess?.()); return request;
  } };
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  dom.window.HTMLDialogElement.prototype.close = function () { this.open = false; };
  for (const [name, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, Element: dom.window.Element, HTMLElement: dom.window.HTMLElement, Node: dom.window.Node, getComputedStyle: dom.window.getComputedStyle.bind(dom.window), indexedDB, requestAnimationFrame: (callback: () => void) => { callback(); return 0; }, IDBKeyRange: { only: (value: unknown) => value }, IS_REACT_ACT_ENVIRONMENT: true })) Object.defineProperty(globalThis, name, { value, configurable: true });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(dom.window.document.getElementById('root')!);
  const doc = dom.window.document;
  const flush = async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); }); };
  const render = async (element: React.ReactNode) => { await act(async () => root.render(React.createElement(QueryClientProvider, { client }, element))); await flush(); };
  const text = () => doc.body.textContent ?? '';
  const button = (label: string) => [...doc.querySelectorAll('button')].find(el => el.textContent?.trim() === label) as HTMLButtonElement | undefined;
  const field = (label: string) => {
    const el = [...doc.querySelectorAll('label')].find(item => item.childNodes[0]?.textContent?.trim() === label);
    assert.ok(el, `field ${label}`);
    return doc.getElementById(el.htmlFor) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
  };
  const type = async (label: string, value: string) => {
    const el = field(label);
    const proto = el.tagName === 'TEXTAREA' ? dom.window.HTMLTextAreaElement.prototype : el.tagName === 'SELECT' ? dom.window.HTMLSelectElement.prototype : dom.window.HTMLInputElement.prototype;
    await act(async () => { Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value); el.dispatchEvent(new dom.window.Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); });
  };
  const click = async (label: string) => { const el = button(label); assert.ok(el, `button ${label}`); await act(async () => el.click()); await flush(); };
  const close = async () => {
    await act(async () => root.unmount()); client.clear(); mock.restoreAll(); dom.window.close();
    for (const name of ['window', 'document', 'navigator', 'Element', 'HTMLElement', 'Node', 'getComputedStyle', 'indexedDB', 'IDBKeyRange', 'requestAnimationFrame', 'IS_REACT_ACT_ENVIRONMENT']) { if (original[name]) Object.defineProperty(globalThis, name, original[name]); else Reflect.deleteProperty(globalThis, name); }
  };
  return { dom, doc, client, flush, render, text, button, field, type, click, close, act };
}
