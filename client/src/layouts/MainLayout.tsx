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
    <div className="flex h-screen bg-[#F8F9FB] font-sans text-slate-800 overflow-hidden" id="app-root">
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
          <div className="bg-red-50 border-b border-red-200 text-red-700 text-[11px] font-semibold px-6 py-1.5 flex items-center gap-2" id="data-error-banner">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>{dataError}</span>
          </div>
        )}

        <main className="flex-1 overflow-y-auto px-3 py-3 sm:px-4 sm:py-4 lg:px-5 lg:py-4 bg-[#F8F9FB]" id="main-routed-view">
          {children}
        </main>
      </div>
    </div>
  );
};

export default MainLayout;
