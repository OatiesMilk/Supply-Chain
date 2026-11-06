import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToPipeableStream } from 'react-dom/server';
import { PassThrough } from 'node:stream';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DriversPage, type DriversPageProps } from '../src/pages/DriversPage';
import { driverLandingScreen, isDriverScreen, rememberDriverTab } from '../src/routes/screenRouting';

function renderLoadedPage(element: React.ReactElement): Promise<string> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return new Promise((resolve, reject) => {
    const output = new PassThrough();
    const chunks: Buffer[] = [];
    output.on('data', chunk => chunks.push(Buffer.from(chunk)));
    output.on('end', () => { client.clear(); resolve(Buffer.concat(chunks).toString()); });
    const stream = renderToPipeableStream(React.createElement(QueryClientProvider, { client }, element), {
      onAllReady() { stream.pipe(output); }, onError: reject,
    });
  });
}

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
afterEach(() => {
  if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
  else Reflect.deleteProperty(globalThis, 'window');
});

function withStorage() {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, value); },
    } },
  });
}

const pageProps = (overrides: Partial<DriversPageProps>): DriversPageProps => ({
  activeScreen: 'driver_board',
  canAccess: () => true,
  records: [],
  onUpdateRecord: async () => {},
  currentUserName: 'Test User',
  currentUserRole: 'Logistics' as any,
  outputActionConfigs: {} as any,
  onNavigate: () => {},
  drivers: [],
  onCreateDriver: async () => {},
  onUpdateDriver: async () => {},
  onDeleteDriver: async () => {},
  ...overrides,
});

test('the Drivers item opens the first granted tab when nothing is remembered', () => {
  assert.equal(driverLandingScreen(() => true), 'driver');
  assert.equal(driverLandingScreen(screen => screen === 'driver_manager'), 'driver_manager');
  assert.equal(driverLandingScreen(() => false), null);
});

test('the Drivers item reopens the last tab only while it is still granted', () => {
  withStorage();
  rememberDriverTab('driver_board');
  assert.equal(driverLandingScreen(() => true), 'driver_board');
  assert.equal(driverLandingScreen(screen => screen !== 'driver_board'), 'driver');

  rememberDriverTab('admin');
  assert.equal(driverLandingScreen(() => true), 'driver_board', 'non-driver screens are not remembered');
  assert.equal(isDriverScreen('driver_dashboard'), false);
});

test('Drivers page shows a tab per granted screen and marks the current one', async () => {
  const html = await renderLoadedPage(React.createElement(DriversPage, pageProps({
    canAccess: screen => screen !== 'driver_manager',
  })));
  assert.match(html, /aria-label="Driver sections"/);
  assert.match(html, />View</);
  assert.match(html, /aria-current="page"[^>]*>Board</);
  assert.doesNotMatch(html, />Manager</);
  assert.match(html, /id="driver-board-view"/);
});

test('Drivers page hides the tab bar when only one screen is granted', async () => {
  const html = await renderLoadedPage(React.createElement(DriversPage, pageProps({
    canAccess: screen => screen === 'driver_board',
  })));
  assert.doesNotMatch(html, /aria-label="Driver sections"/);
  assert.match(html, /id="driver-board-view"/);
});
