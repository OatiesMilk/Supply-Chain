import assert from 'node:assert/strict';
import { test } from 'node:test';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { vendorChunk } from '../config/vendorChunks';
import { getPageDataState, pageResources, type PageQueryState } from '../src/hooks/pageDataState';
import { PageDataContext, PageDataGate } from '../src/routes/PageDataGate';
import { lazyPage } from '../src/routes/lazyPage';

const query = (patch: Partial<PageQueryState> = {}): PageQueryState => ({
  data: undefined, isPending: false, error: null, refetch: async () => {}, ...patch,
});

test('vendor chunk rules match actual package boundaries, including pnpm and Windows paths', () => {
  for (const [name, chunk] of [
    ['react', 'vendor-react'], ['react-dom', 'vendor-react'], ['scheduler', 'vendor-react'],
    ['@tanstack/react-query', 'vendor-query'], ['@tanstack/query-core', 'vendor-query'],
    ['lucide-react', 'vendor-lucide'], ['recharts', 'vendor-charts'], ['d3-scale', 'vendor-charts'],
  ]) {
    assert.equal(vendorChunk(`/app/node_modules/${name}/index.js`), chunk);
    assert.equal(vendorChunk(`/app/node_modules/.pnpm/package/node_modules/${name}/index.js`), chunk);
    assert.equal(vendorChunk(`C:\\app\\node_modules\\${name.replaceAll('/', '\\')}\\index.js`), chunk);
  }
  assert.equal(vendorChunk('/app/node_modules/react-is/index.js'), undefined);
  assert.equal(vendorChunk('/app/src/react/dashboard.tsx'), undefined);
});

test('cold page resource errors/loading are visible and cached refresh failures do not hide data', () => {
  assert.deepEqual(getPageDataState([query({ isPending: true })]), { loading: true, error: null });
  assert.deepEqual(getPageDataState([query({ error: new Error('Offline') })]), { loading: false, error: 'Offline' });
  assert.deepEqual(getPageDataState([query({ data: [], error: new Error('Offline') })]), { loading: false, error: null });
  assert.deepEqual(pageResources('customers'), ['customers']);
  assert.deepEqual(pageResources('inventory'), ['skus']);
  assert.deepEqual(pageResources('driver_manager'), ['drivers']);
  assert.deepEqual(pageResources('admin'), []);
  assert.equal(pageResources('customers').includes('companies'), false);
  const errorHtml = renderToStaticMarkup(React.createElement(PageDataGate, { loading: false, error: 'Offline', onRetry: async () => {}, children: 'Empty list' }));
  assert.match(errorHtml, /Try again/);
  assert.doesNotMatch(errorHtml, /Empty list/);
  const loadingHtml = renderToStaticMarkup(React.createElement(PageDataGate, { loading: true, error: null, onRetry: async () => {}, children: 'Empty list' }));
  assert.match(loadingHtml, /Loading view/);
  assert.doesNotMatch(loadingHtml, /Empty list/);
});

test('failed lazy imports can retry successfully and navigation remounts a failed shared page', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' });
  const saved = Object.getOwnPropertyDescriptors(globalThis);
  Object.defineProperties(globalThis, {
    window: { value: dom.window, configurable: true }, document: { value: dom.window.document, configurable: true },
    IS_REACT_ACT_ENVIRONMENT: { value: true, configurable: true },
  });
  const root = createRoot(dom.window.document.getElementById('root')!);
  // React logs caught errors even when an error boundary provides recovery.
  const originalError = console.error;
  console.error = () => {};
  try {
    let imports = 0;
    let mounts = 0;
    const GatedPage = lazyPage(async () => {
      imports++;
      return { default: () => { mounts++; return React.createElement('p', null, 'Data ready'); } };
    });
    const renderGated = (loading: boolean) => React.createElement(PageDataContext.Provider, {
      value: { loading, error: null, onRetry: async () => {} },
    }, React.createElement(GatedPage));
    await act(async () => { root.render(renderGated(true)); });
    assert.equal(imports, 1, 'Page import starts while page data is pending');
    assert.equal(mounts, 0, 'Page effects and deep links cannot consume placeholder data');
    assert.match(dom.window.document.body.textContent!, /Loading view/);
    await act(async () => { root.render(renderGated(false)); });
    assert.equal(imports, 1);
    assert.match(dom.window.document.body.textContent!, /Data ready/);

    let calls = 0;
    const Page = lazyPage(async () => {
      if (++calls === 1) throw new Error('Chunk unavailable');
      return { default: () => React.createElement('p', null, 'Page loaded') };
    });
    assert.equal(calls, 0, 'Defining a page does not download its code');
    await act(async () => { root.render(React.createElement(Page)); });
    assert.match(dom.window.document.body.textContent!, /could not be loaded/);
    await act(async () => { dom.window.document.querySelector('button')!.click(); });
    assert.equal(calls, 2, 'Retry invokes a fresh lazy importer');
    assert.match(dom.window.document.body.textContent!, /Page loaded/);

    await act(async () => { root.render(React.createElement('p', null, 'Another page')); });
    await act(async () => { root.render(React.createElement(Page)); });
    assert.equal(calls, 2, 'Returning to a downloaded page reuses its resolved lazy component');
    assert.match(dom.window.document.body.textContent!, /Page loaded/);
    assert.doesNotMatch(dom.window.document.body.textContent!, /Loading view/);

    let routeCalls = 0;
    const SharedPage = lazyPage(async () => {
      if (++routeCalls === 1) throw new Error('Chunk unavailable');
      return { default: () => React.createElement('p', null, 'Other route loaded') };
    });
    await act(async () => { root.render(React.createElement(React.Suspense, { key: 'deliveries' }, React.createElement(SharedPage))); });
    assert.match(dom.window.document.body.textContent!, /could not be loaded/);
    await act(async () => { root.render(React.createElement(React.Suspense, { key: 'rma' }, React.createElement(SharedPage))); });
    assert.match(dom.window.document.body.textContent!, /Other route loaded/);
  } finally {
    await act(async () => { root.unmount(); });
    console.error = originalError;
    dom.window.close();
    for (const key of ['window', 'document', 'IS_REACT_ACT_ENVIRONMENT']) {
      if (saved[key]) Object.defineProperty(globalThis, key, saved[key]);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
