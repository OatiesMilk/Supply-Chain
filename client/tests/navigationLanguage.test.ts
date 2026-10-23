import { test } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { renderToString } from 'react-dom/server';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { Sidebar, type SidebarProps } from '../src/layouts/Sidebar';
import MainView from '../src/pages/MainView';
import { completionActionLabel, screenLabel } from '../src/utils/navigationLabels';

function sidebar(overrides: Partial<SidebarProps> = {}): SidebarProps {
  return {
    currentScreen: 'main', handleNavigate: () => {}, isSidebarCollapsed: false,
    setIsSidebarCollapsed: () => {}, isSidebarOpen: true, setIsSidebarOpen: () => {},
    canAccess: () => true, currentUserRole: 'Admin', currentUser: { name: 'Example', initials: 'EX' },
    deliveriesActiveCount: 7, rmaActiveCount: 0, salesOrdersActiveCount: 0,
    accountingActiveCount: 0, procurementActiveCount: 0, ...overrides,
  };
}

test('presentation labels preserve domain distinctions and mark the current permitted destination', () => {
  const html = renderToString(React.createElement(Sidebar, sidebar()));
  assert.match(html, /aria-label="All Records" aria-current="page"/);
  assert.match(html, /aria-label="Deliveries · 7 active"/);
  assert.match(html, /aria-label="Account Managers"/);
  assert.match(html, /aria-label="Products \/ SKU Master"/);
  assert.equal(screenLabel('driver_board'), 'Drivers');
  assert.equal(screenLabel('constructor'), 'constructor');
  assert.equal(completionActionLabel('Deliveries'), 'Mark as Delivered');
  for (const category of ['RMA', 'Procurement Pick-up', 'Accounting Collection', 'Sales Orders'] as const) {
    assert.equal(completionActionLabel(category), 'Accomplish');
  }
});

test('task groups do not expose denied modules or empty administrative groups', () => {
  const html = renderToString(React.createElement(Sidebar, sidebar({ canAccess: screen => screen === 'deliveries' })));
  assert.match(html, /Manage Records/);
  assert.doesNotMatch(html, /People and Products|Plan and Review|>Administration</);
  assert.doesNotMatch(html, /aria-label="Account Managers"|aria-label="Admin Panel"/);
});

test('closed mobile navigation exposes inert semantics while an open menu remains available', () => {
  const closed = renderToString(React.createElement(Sidebar, sidebar({ isSidebarOpen: false })));
  const open = renderToString(React.createElement(Sidebar, sidebar({ isSidebarOpen: true })));
  assert.match(closed, /id="sidebar-panel" inert=""/);
  assert.doesNotMatch(open, /inert=""/);
});

test('All Records explains unavailable creation and uses the submitted-draft distinction', () => {
  const html = renderToString(React.createElement(MainView, {
    records: [], currentUserRole: 'Logistics', currentUserName: 'Example',
    onNavigate: () => {}, companies: [], onCreateRecord: async () => { throw Error('unused'); },
    effectiveScreens: new Set<string>(),
  }));
  assert.match(html, /<h1[^>]*>All Records<\/h1>/);
  assert.match(html, /disabled="" aria-describedby="create-record-unavailable"/);
  assert.match(html, /Contact your administrator/);
  assert.match(html, /Drafts Awaiting Submission/);
  assert.doesNotMatch(html, /New Delivery|Delivery For Approval/);
});

test('collapsed navigation keeps focus tooltips, active names and original route targets', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' });
  const saved = Object.getOwnPropertyDescriptors(globalThis);
  Object.defineProperties(globalThis, {
    window: { value: dom.window, configurable: true }, document: { value: dom.window.document, configurable: true },
    Element: { value: dom.window.Element, configurable: true },
    IS_REACT_ACT_ENVIRONMENT: { value: true, configurable: true },
  });
  Object.defineProperty(dom.window, 'matchMedia', { value: () => ({ matches: true, addEventListener() {}, removeEventListener() {} }) });
  let navigated = '';
  const root = createRoot(dom.window.document.getElementById('root')!);
  try {
    await act(async () => root.render(React.createElement(Sidebar, sidebar({
      isSidebarCollapsed: true, currentScreen: 'am_directory',
      handleNavigate: screen => { navigated = screen; },
    }))));
    const item = dom.window.document.querySelector<HTMLButtonElement>('[aria-label="Account Managers"]')!;
    assert.equal(item.getAttribute('aria-current'), 'page');
    await act(async () => { item.focus(); await new Promise(resolve => setTimeout(resolve, 180)); });
    assert.equal(dom.window.document.activeElement, item);
    assert.equal(dom.window.document.querySelector('[role="tooltip"]')?.textContent, 'Account Managers');
    assert.equal(dom.window.document.querySelector('[role="tooltip"]')?.hasAttribute('hidden'), false);
    await act(async () => item.click());
    assert.equal(navigated, 'am_directory', 'wording never changes a route key');
    await act(async () => root.render(React.createElement(Sidebar, sidebar({ isSidebarOpen: false }))));
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    for (const key of ['window', 'document', 'Element', 'IS_REACT_ACT_ENVIRONMENT']) {
      if (saved[key]) Object.defineProperty(globalThis, key, saved[key]);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
