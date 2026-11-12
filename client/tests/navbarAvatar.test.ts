import { test } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { renderToString } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { AccountMenuProps } from '../src/layouts/AccountMenu';
import { canManageAdminSettings } from '../src/layouts/accountSettingsAccess';

async function withBrowserDom(run: (dom: JSDOM) => Promise<void>) {
  const descriptors = Object.getOwnPropertyDescriptors(globalThis);
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost', pretendToBeVisual: true });
  const globalValues: Record<string, unknown> = {
    window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
    Element: dom.window.Element, HTMLElement: dom.window.HTMLElement, Node: dom.window.Node,
    MutationObserver: dom.window.MutationObserver, getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
    requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window),
    cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window),
    IS_REACT_ACT_ENVIRONMENT: true,
  };
  for (const [key, value] of Object.entries(globalValues)) Object.defineProperty(globalThis, key, { value, configurable: true });
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  dom.window.HTMLDialogElement.prototype.close = function () { this.open = false; };
  try { await run(dom); }
  finally {
    dom.window.close();
    for (const key of Object.keys(globalValues)) {
      if (descriptors[key]) Object.defineProperty(globalThis, key, descriptors[key]);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
}

async function withAccountMenu(props: AccountMenuProps, run: (doc: Document, callbacks: { opened: string[]; loggedOut: number[] }) => Promise<void>) {
  await withBrowserDom(async dom => {
    // Floating UI detects the DOM when its module loads, so import after jsdom is installed.
    const { default: AccountMenu } = await import('../src/layouts/AccountMenu');
    const root = createRoot(dom.window.document.getElementById('root')!);
    const callbacks = { opened: [] as string[], loggedOut: [] as number[] };
    try {
      await act(async () => root.render(React.createElement(AccountMenu, {
        ...props,
        onNavigate: screen => { callbacks.opened.push(screen); },
        onLogout: () => { callbacks.loggedOut.push(1); },
      })));
      await run(dom.window.document, callbacks);
    } finally {
      await act(async () => root.unmount());
    }
  });
}

async function activateButtonByKeyboard(doc: Document, button: HTMLButtonElement, key: 'Enter' | ' ') {
  await act(async () => {
    const down = new doc.defaultView!.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    button.dispatchEvent(down);
    if (key === 'Enter') {
      if (!down.defaultPrevented) button.click();
      return;
    }
    const up = new doc.defaultView!.KeyboardEvent('keyup', { key, bubbles: true, cancelable: true });
    button.dispatchEvent(up);
    if (!down.defaultPrevented && !up.defaultPrevented) button.click();
  });
}

test('AccountMenu renders an accessible avatar trigger with a touch-friendly mobile target', async () => {
  await withAccountMenu({ name: 'John Doe', email: 'john@example.test', role: 'Admin', canManageAdmin: true, onNavigate() {}, onLogout() {} }, async doc => {
    const trigger = doc.getElementById('account-menu-button') as HTMLButtonElement;
    assert.ok(trigger);
    assert.equal(trigger.getAttribute('aria-haspopup'), 'menu');
    assert.equal(trigger.getAttribute('aria-expanded'), 'false');
    assert.match(trigger.className, /h-11 w-11[^\"]*sm:h-8 sm:w-8/);
    assert.match(trigger.innerHTML, /h-4 w-4/);
  });
});

test('Navbar renders the account menu alongside global search', async () => {
  await withBrowserDom(async () => {
    const { Navbar } = await import('../src/layouts/Navbar');
    const queryClient = new QueryClient();
    const html = renderToString(React.createElement(QueryClientProvider, { client: queryClient }, React.createElement(Navbar, {
      currentScreen: 'dashboard', setIsSidebarOpen() {},
      currentUser: { name: 'Admin User', email: 'admin@example.test', initials: 'AU' },
      currentUserRole: 'Admin', canManageAdmin: true, setSearchOpen() {}, deliveryRecords: [],
      handleNavigate() {}, handleResetDemoData: async () => {}, resetting: false, handleLogout() {},
    })));
    assert.match(html, /id="account-menu-button"[^>]*class="[^"]*h-11 w-11[^\"]*sm:h-8 sm:w-8/);
    assert.match(html, /id="global-search-button"[^>]*>[\s\S]*?w-4 h-4/);
  });
});

test('the Settings profile is readable for all fixed roles but Admin tools honor the current Admin screen grant', async () => {
  const roles = ['SALES_COORDINATOR', 'LOGISTICS', 'TASS', 'ADMIN', 'DRIVER'] as const;
  for (const role of roles) {
    const canManageAdmin = canManageAdminSettings(role, screen => screen === 'admin');
    assert.equal(canManageAdmin, role === 'ADMIN');
    await withAccountMenu({ name: 'Pat User', email: 'pat@example.test', role, canManageAdmin, onNavigate() {}, onLogout() {} }, async doc => {
      const trigger = doc.getElementById('account-menu-button') as HTMLButtonElement;
      await act(async () => trigger.click());
      const menuItems = [...doc.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')];
      assert.deepEqual(menuItems.map(button => button.textContent?.trim()), ['Settings', 'Help', 'Log out']);
      await act(async () => menuItems[0].click());
      const settingsDialog = [...doc.querySelectorAll<HTMLDialogElement>('dialog')].find(dialog => dialog.open)!;
      assert.ok(settingsDialog);
      assert.match(settingsDialog.textContent ?? '', /My account[\s\S]*Pat User[\s\S]*pat@example\.test/);
      assert.match(settingsDialog.textContent ?? '', new RegExp(role));
      assert.equal(!!settingsDialog.querySelector('#account-settings-admin'), role === 'ADMIN');
    });
  }
  assert.equal(canManageAdminSettings('ADMIN', () => false), false, 'an explicit Admin screen denial hides administrative settings');
});

test('Settings opens the guarded Admin page; Help, Escape dismissal and Log out remain available', async () => {
  await withAccountMenu({ name: 'Admin User', email: 'admin@example.test', role: 'ADMIN', canManageAdmin: true, onNavigate() {}, onLogout() {} }, async (doc, callbacks) => {
    const trigger = doc.getElementById('account-menu-button') as HTMLButtonElement;
    await act(async () => trigger.click());
    const settings = [...doc.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find(button => button.textContent?.includes('Settings'))!;
    const helpItem = [...doc.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find(button => button.textContent?.includes('Help'))!;
    await act(async () => settings.focus());
    await act(async () => settings.dispatchEvent(new doc.defaultView!.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true })));
    assert.equal(doc.activeElement, helpItem, 'ArrowDown moves through the menu');
    await act(async () => helpItem.dispatchEvent(new doc.defaultView!.KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true })));
    assert.equal(doc.activeElement, settings, 'ArrowUp returns to Settings');
    await activateButtonByKeyboard(doc, settings, 'Enter');
    const settingsDialog = [...doc.querySelectorAll<HTMLDialogElement>('dialog')].find(dialog => dialog.open)!;
    const admin = [...settingsDialog.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent?.includes('Open Admin Panel'))!;
    assert.ok(admin);
    await act(async () => admin.click());
    assert.deepEqual(callbacks.opened, ['admin']);
    assert.equal([...doc.querySelectorAll<HTMLDialogElement>('dialog')].some(dialog => dialog.open), false);

    await activateButtonByKeyboard(doc, trigger, ' ');
    const escape = new doc.defaultView!.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    await act(async () => doc.dispatchEvent(escape));
    assert.equal(doc.querySelector('[role="menu"]'), null);

    await act(async () => trigger.click());
    const help = [...doc.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find(button => button.textContent?.includes('Help'))!;
    await activateButtonByKeyboard(doc, help, ' ');
    const helpDialog = [...doc.querySelectorAll<HTMLDialogElement>('dialog')].find(dialog => dialog.open)!;
    assert.match(helpDialog.textContent ?? '', /quick guide/i);
    const close = [...helpDialog.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent?.includes('Close'))!;
    await act(async () => close.click());
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });
    assert.equal(doc.activeElement, trigger, 'closing a dialog returns focus to the avatar trigger');

    await act(async () => trigger.click());
    const logout = doc.getElementById('logout-button')!;
    await act(async () => logout.click());
    assert.equal(callbacks.loggedOut.length, 1);
  });
});
