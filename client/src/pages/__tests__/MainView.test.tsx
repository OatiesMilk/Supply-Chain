import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import MainView from '../MainView';
import { DeliveryRecord } from '@/types';

// Helper to create mock records
function createMockRecords(count: number): DeliveryRecord[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `REC-${String(i + 1).padStart(3, '0')}`,
    company_name: `Company ${i + 1}`,
    reference: `REF-${i + 1}`,
    category: 'Deliveries',
    status: i % 2 === 0 ? 'Scheduled' : 'Delivered',
    area: 'Metro Manila',
    account_manager: 'John Doe',
    delivery_date: '2026-10-01',
    created_at: new Date(2026, 9, 1, 10, i).toISOString(),
    created_by: 'tester',
    modified_at: new Date(2026, 9, 1, 10, i).toISOString(),
    modified_by: 'tester',
    email_notification_sent: false,
    remarks: '',
    items: [],
  })) as unknown as DeliveryRecord[];
}

describe('MainView Pagination Integration', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({}),
      })
    );
  });

  it('paginates records to pageSize (default 25) and navigates pages', async () => {
    const mockRecords = createMockRecords(60);

    render(
      <MainView
        records={mockRecords}
        currentUserRole="Admin"
        currentUserName="Admin User"
        onNavigate={vi.fn()}
        companies={[]}
        onCreateRecord={vi.fn()}
        effectiveScreens={new Set(['deliveries', 'main'])}
      />
    );

    // Initial state: page 1 of 3 (60 records / 25 per page = 3 pages)
    expect(screen.getByRole('button', { name: 'Page 1' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'Page 2' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Page 3' })).toBeInTheDocument();

    // Verify indicator
    expect(screen.getByTestId('pagination-records-info')).toHaveTextContent('Showing 1–25 of 60 records');

    // Click Page 2
    fireEvent.click(screen.getByRole('button', { name: 'Page 2' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Page 2' })).toHaveAttribute('aria-current', 'page');
      expect(screen.getByTestId('pagination-records-info')).toHaveTextContent('Showing 26–50 of 60 records');
    });

    // Click Next button -> Page 3
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Page 3' })).toHaveAttribute('aria-current', 'page');
      expect(screen.getByTestId('pagination-records-info')).toHaveTextContent('Showing 51–60 of 60 records');
    });
  });

  it('resets page to 1 when a filter button is clicked', async () => {
    const mockRecords = createMockRecords(60);

    render(
      <MainView
        records={mockRecords}
        currentUserRole="Admin"
        currentUserName="Admin User"
        onNavigate={vi.fn()}
        companies={[]}
        onCreateRecord={vi.fn()}
        effectiveScreens={new Set(['deliveries', 'main'])}
      />
    );

    // Move to page 2
    fireEvent.click(screen.getByRole('button', { name: 'Page 2' }));
    expect(screen.getByRole('button', { name: 'Page 2' })).toHaveAttribute('aria-current', 'page');

    // Click filter "View Scheduled Items"
    fireEvent.click(screen.getByRole('button', { name: /view scheduled items/i }));

    // Page should automatically reset to 1
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Page 1' })).toHaveAttribute('aria-current', 'page');
    });
  });
});
