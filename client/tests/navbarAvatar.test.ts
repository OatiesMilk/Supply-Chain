import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Navbar } from '../src/layouts/Navbar';
import AccountMenu from '../src/layouts/AccountMenu';

test('AccountMenu renders avatar button and icon matching navbar icon dimensions', () => {
  const accountHtml = renderToString(
    React.createElement(AccountMenu, {
      name: 'John Doe',
      role: 'Admin',
      onLogout: () => {},
    })
  );

  // Avatar button matches 32px navbar icon button footprint (h-8 w-8)
  assert.match(accountHtml, /id="account-menu-button"/);
  assert.match(accountHtml, /h-8 w-8/);
  // Avatar icon matches standard 16px icon dimensions (h-4 w-4)
  assert.match(accountHtml, /h-4 w-4/);
});

test('Navbar renders AccountMenu with matched avatar icon size alongside global search', () => {
  const queryClient = new QueryClient();
  const html = renderToString(
    React.createElement(
      QueryClientProvider,
      { client: queryClient },
      React.createElement(Navbar, {
        currentScreen: 'dashboard',
        setIsSidebarOpen: () => {},
        currentUser: { name: 'Admin User', initials: 'AU' },
        currentUserRole: 'Admin',
        setSearchOpen: () => {},
        deliveryRecords: [],
        handleNavigate: () => {},
        handleResetDemoData: async () => {},
        resetting: false,
        handleLogout: () => {},
      })
    )
  );

  assert.match(html, /id="account-menu-button"[^>]*class="[^"]*h-8 w-8/);
  assert.match(html, /id="global-search-button"[^>]*>[\s\S]*?w-4 h-4/);
});
