import React, { ReactNode } from 'react';
import { Sidebar, SidebarProps } from './Sidebar';
import { Navbar, NavbarProps } from './Navbar';
import { GlobalSearch, AccessRequestModal, AccessRequestModalProps } from '@/components';
import { DeliveryRecord } from '@/types';
import { ApiCustomer, ApiDriver, ApiSku, ApiSupplier } from '@/api';
import { AlertTriangle } from 'lucide-react';

export interface MainLayoutProps {
  sidebarProps: SidebarProps;
  navbarProps: NavbarProps;
  accessRequestModalProps?: AccessRequestModalProps;
  searchOpen: boolean;
  setSearchOpen: (open: boolean) => void;
  deliveryRecords: DeliveryRecord[];
  customers: ApiCustomer[];
  suppliers: ApiSupplier[];
  drivers: ApiDriver[];
  products: ApiSku[];
  accessibleScreens: ReadonlySet<string>;
  dataError: string | null;
  children: ReactNode;
}

export const MainLayout: React.FC<MainLayoutProps> = ({
  sidebarProps,
  navbarProps,
  accessRequestModalProps,
  searchOpen,
  setSearchOpen,
  deliveryRecords,
  customers,
  suppliers,
  drivers,
  products,
  accessibleScreens,
  dataError,
  children,
}) => {
  return (
    <div className="relative flex h-screen bg-surface-canvas font-sans text-slate-800 overflow-hidden" id="app-root">
      <GlobalSearch
        isOpen={searchOpen}
        onClose={() => setSearchOpen(false)}
        deliveryRecords={deliveryRecords}
        customers={customers}
        suppliers={suppliers}
        drivers={drivers}
        products={products}
        accessibleScreens={accessibleScreens}
        onNavigate={sidebarProps.handleNavigate}
      />

      {accessRequestModalProps && (
        <AccessRequestModal {...accessRequestModalProps} />
      )}

      <Sidebar {...sidebarProps} />

      <div className="flex-1 flex flex-col min-w-0" id="main-content-area">
        <Navbar {...navbarProps} />

        {dataError && (
          <div className="bg-red-50 border-b border-red-200 text-red-700 text-xs font-semibold px-6 py-2 flex items-center gap-2" id="data-error-banner">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{dataError}</span>
          </div>
        )}

        <main className="relative min-h-0 min-w-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5 lg:px-8 lg:py-6 bg-surface-canvas" id="main-routed-view">
          <div className="mx-auto w-full max-w-[1520px]">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};

export default MainLayout;
