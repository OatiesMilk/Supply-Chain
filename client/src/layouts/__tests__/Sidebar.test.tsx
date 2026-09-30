import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Sidebar } from '../Sidebar';
import '@testing-library/jest-dom';

describe('Sidebar Component', () => {
  const defaultProps = {
    currentScreen: 'dashboard',
    handleNavigate: vi.fn(),
    isSidebarCollapsed: false,
    setIsSidebarCollapsed: vi.fn(),
    isSidebarOpen: true,
    setIsSidebarOpen: vi.fn(),
    canAccess: () => true, // Mock all access as true
    currentUserRole: 'Admin' as any,
    currentUser: { name: 'Test Admin', initials: 'TA' },
    deliveriesActiveCount: 0,
    rmaActiveCount: 0,
    salesOrdersActiveCount: 0,
    accountingActiveCount: 2, // Mock 2 active items
    procurementActiveCount: 5, // Mock 5 active items
  };

  it('renders Accounting Collection button and badge correctly', () => {
    render(<Sidebar {...defaultProps} />);
    
    // Check if Accounting Collection button text is in the document
    expect(screen.getByText('Accounting Collection')).toBeDefined();
    
    // Check if the badge (with count 2) is rendered
    expect(screen.getByText('2')).toBeDefined();
  });

  it('renders Procurement Pick-up button and badge correctly', () => {
    render(<Sidebar {...defaultProps} />);
    
    // Check if Procurement Pick-up button text is in the document
    expect(screen.getByText('Procurement Pick-up')).toBeDefined();
    
    // Check if the badge (with count 5) is rendered
    expect(screen.getByText('5')).toBeDefined();
  });

  it('renders distinct, non-repetitive icons for Main and Dashboard (TSK-31)', () => {
    const { container } = render(<Sidebar {...defaultProps} />);

    const mainBtn = screen.getByText('Main').closest('button');
    const dashboardBtn = screen.getByText('Dashboard').closest('button');

    expect(mainBtn).toBeDefined();
    expect(dashboardBtn).toBeDefined();

    // Verify Main uses the Layers icon (class "lucide-layers")
    const mainIcon = mainBtn?.querySelector('svg');
    expect(mainIcon?.classList.contains('lucide-layers')).toBe(true);

    // Verify Dashboard uses the LayoutDashboard icon (class "lucide-layout-dashboard")
    const dashboardIcon = dashboardBtn?.querySelector('svg');
    expect(dashboardIcon?.classList.contains('lucide-layout-dashboard')).toBe(true);

    // Ensure neither uses the old repetitive LayoutGrid icon
    expect(container.querySelector('.lucide-layout-grid')).toBeNull();
  });
});

