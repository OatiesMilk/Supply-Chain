import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import React, { act } from 'react';
import type { Root } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError, api } from '../src/api';
import { CUSTOMERS_QUERY_KEY, useCustomersQuery } from '../src/api/queries/useCompaniesQuery';
import CustomerWorkspace from '../src/features/customers/CustomerWorkspace';
import type { Customer } from '../src/types/customer';
import { beforeEach } from 'node:test';
import { installLegacySession } from './helpers/permissionSession';
beforeEach(() => { installLegacySession('SALES_COORDINATOR', 'customers'); });

afterEach(() => mock.restoreAll());

async function withDom(run: (dom: JSDOM, root: Root) => Promise<void>) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' });
  const saved = Object.getOwnPropertyDescriptors(globalThis);
  Object.defineProperties(globalThis, {
    window: { value: dom.window, configurable: true },
    document: { value: dom.window.document, configurable: true },
    navigator: { value: dom.window.navigator, configurable: true },
    IS_REACT_ACT_ENVIRONMENT: { value: true, configurable: true },
  });
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(dom.window.document.getElementById('root')!);
  try {
    await run(dom, root);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    for (const key of ['window', 'document', 'navigator', 'IS_REACT_ACT_ENVIRONMENT']) {
      if (saved[key]) Object.defineProperty(globalThis, key, saved[key]);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
}

function customer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: 'customer-1',
    name: 'Acme Foods',
    contact_person: 'Alex',
    email: 'alex@example.test',
    phone: '555-0100',
    address: '1 Main St',
    city: 'Makati',
    created_by: 'Sales',
    created_at: '2026-10-01T00:00:00.000Z',
    modified_by: 'Sales',
    modified_at: '2026-10-01T00:00:00.000Z',
    ...overrides,
  };
}

function ActiveCustomerQueryObserver() {
  useCustomersQuery();
  return null;
}

test('customer edit keeps its draft after load-latest fails and saves against the retried version', async () => {
  await withDom(async (dom, root) => {
    const client = new QueryClient({ defaultOptions: {
      queries: { retry: false, staleTime: Infinity, refetchOnWindowFocus: false },
      mutations: { retry: false },
    } });
    const initialCustomer = customer();
    const latestCustomer = customer({
      city: 'Pasig',
      modified_by: 'Logistics',
      modified_at: '2026-10-16T03:04:05.000Z',
    });
    let updateCalls = 0;
    let customerReads = 0;
    let rejectFirstRead!: (error: Error) => void;
    let firstRead!: Promise<Customer[]>;
    mock.method(api, 'getCustomers', () => {
      customerReads++;
      if (customerReads === 1) {
        firstRead = new Promise<Customer[]>((_resolve, reject) => { rejectFirstRead = reject; });
        return firstRead;
      }
      return Promise.resolve([latestCustomer]);
    });
    const update = mock.method(api, 'updateCustomer', async (_id, data) => {
      updateCalls++;
      if (updateCalls === 1) throw new ApiError('This customer changed elsewhere.', 409);
      return {
        ...latestCustomer,
        city: data.city ?? latestCustomer.city,
        modified_by: 'Sales',
        modified_at: '2026-10-16T03:10:00.000Z',
      };
    });

    client.setQueryData(CUSTOMERS_QUERY_KEY, [initialCustomer]);
    try {
      await act(async () => root.render(React.createElement(
        QueryClientProvider,
        { client },
        React.createElement(React.Fragment, null,
          React.createElement(ActiveCustomerQueryObserver),
          React.createElement(CustomerWorkspace, {
            customerId: initialCustomer.id,
            allCustomerIds: [initialCustomer.id],
            customers: [initialCustomer],
            currentUserRole: 'Sales Coordinator',
            onBack: () => {},
            onNavigateToCustomer: () => {},
          }),
        ),
      )));

      const setValue = async (element: HTMLInputElement | HTMLTextAreaElement, value: string) => {
        const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value')!.set!;
        await act(async () => {
          setter.call(element, value);
          element.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
        });
      };
      const getCityInput = () => dom.window.document.querySelector<HTMLInputElement>('input[autocomplete="address-level2"]')!;
      const getReasonInput = () => dom.window.document.querySelector<HTMLTextAreaElement>('textarea')!;
      const submit = async () => {
        await act(async () => {
          dom.window.document.querySelector('form')!.dispatchEvent(
            new dom.window.Event('submit', { bubbles: true, cancelable: true }),
          );
          await new Promise(resolve => setTimeout(resolve, 0));
        });
      };

      const editButton = [...dom.window.document.querySelectorAll('button')]
        .find(button => button.textContent?.includes('Edit customer'))!;
      await act(async () => editButton.click());
      await setValue(getCityInput(), 'Draft city from stale form');
      await setValue(getReasonInput(), 'Reason that must survive a failed refresh');
      assert.match(dom.window.document.body.textContent!, /1 unsaved change/);
      await submit();
      assert.match(dom.window.document.querySelector('[role="alert"]')!.textContent!, /changed elsewhere/);
      assert.equal(update.mock.callCount(), 1);

      const formBeforeRefresh = dom.window.document.querySelector('form');
      let reloadButton = [...dom.window.document.querySelectorAll('button')]
        .find(button => button.textContent?.includes('Discard my edits and load the latest values'))!;
      await act(async () => reloadButton.click());
      assert.equal(reloadButton.disabled, true, 'the reload action is disabled while GET is pending');
      assert.match(reloadButton.textContent!, /Loading latest values/);
      await act(async () => {
        rejectFirstRead(new Error('temporary GET /customers failure'));
        await firstRead.catch(() => undefined);
        await new Promise(resolve => setTimeout(resolve, 0));
      });
      assert.equal(reloadButton.disabled, false, 'the reload action leaves pending state after failure');
      assert.strictEqual(dom.window.document.querySelector('form'), formBeforeRefresh, 'a failed refetch does not remount the edit form');
      assert.equal(getCityInput().value, 'Draft city from stale form');
      assert.equal(getReasonInput().value, 'Reason that must survive a failed refresh');
      assert.match(dom.window.document.querySelector('[role="alert"]')!.textContent!, /Your edits are still here/);

      await act(async () => reloadButton.click());
      assert.equal(customerReads, 2, 'the retry performs another list request');
      assert.equal(getCityInput().value, 'Pasig', 'retry loads the latest saved field values');
      assert.equal(getReasonInput().value, '', 'the old audit reason is cleared after accepting latest values');
      assert.equal(dom.window.document.querySelector('[role="alert"]'), null);

      await setValue(getCityInput(), 'Quezon City');
      await setValue(getReasonInput(), 'Updated city after reviewing the latest details');
      await submit();

      assert.equal(update.mock.callCount(), 2);
      assert.equal(update.mock.calls[1].arguments[1].city, 'Quezon City');
      assert.equal(update.mock.calls[1].arguments[1].remarks, 'Updated city after reviewing the latest details');
      assert.equal(update.mock.calls[1].arguments[1].expected_modified_at, latestCustomer.modified_at);
      assert.match(dom.window.document.body.textContent!, /Changes saved\. The reason was added to the Audit Trail\./);
    } finally {
      client.clear();
    }
  });
});
