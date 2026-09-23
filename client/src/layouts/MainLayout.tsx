import React, { ReactNode } from 'react';
import { Sidebar, SidebarProps } from './Sidebar';
import { Navbar, NavbarProps } from './Navbar';
import { GlobalSearch } from '@/components';
import { DeliveryRecord } from '@/types';
import { ApiSku } from '@/api';

export interface MainLayoutProps {
  sidebarProps: SidebarProps;
  navbarProps: NavbarProps;
  searchOpen: boolean;
  setSearchOpen: (open: boolean) => void;
  deliveryRecords: DeliveryRecord[];
  products: ApiSku[];
  dataError: string | null;
  children: ReactNode;
}

export const MainLayout: React.FC<MainLayoutProps> = ({
  sidebarProps,
  navbarProps,
  searchOpen,
  setSearchOpen,
  deliveryRecords,
  products,
  dataError,
  children,
}) => {
  return (
    <div className="flex h-screen bg-[#F8F9FB] font-sans text-slate-800 overflow-hidden" id="app-root">
      <GlobalSearch
        isOpen={searchOpen}
        onClose={() => setSearchOpen(false)}
        deliveryRecords={deliveryRecords}
        products={products}
        onNavigate={sidebarProps.handleNavigate}
      />

      <Sidebar {...sidebarProps} />

      <div className="flex-1 flex flex-col min-w-0" id="main-content-area">
        <Navbar {...navbarProps} />

        {dataError && (
          <div className="bg-red-50 border-b border-red-200 text-red-700 text-[11px] font-semibold px-6 py-1.5 flex items-center gap-2" id="data-error-banner">
            <span>⚠️</span> {dataError}
          </div>
        )}

        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 bg-[#F8F9FB]" id="main-routed-view">
          {children}
        </main>
      </div>
    </div>
  );
};

export default MainLayout;
