import React, { ReactNode } from 'react';
import { Sidebar, SidebarProps } from './Sidebar';
import { Navbar, NavbarProps } from './Navbar';
import { GlobalSearch, AccessRequestModal, AccessRequestModalProps } from '@/components';
import { DeliveryRecord } from '@/types';
import { ApiSku } from '@/api';
import { ErrorState } from '@/components/ui';

export interface MainLayoutProps {
  sidebarProps: SidebarProps;
  navbarProps: NavbarProps;
  accessRequestModalProps?: AccessRequestModalProps;
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
  accessRequestModalProps,
  searchOpen,
  setSearchOpen,
  deliveryRecords,
  products,
  dataError,
  children,
}) => {
  return (
    <div className="mg-shell flex h-screen font-sans overflow-hidden" id="app-root">
      <a href="#main-routed-view" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-lg focus:bg-white focus:px-4 focus:py-3 focus:text-sm focus:font-semibold focus:text-[#1F3864] focus:shadow-lg focus:outline-2 focus:outline-offset-2 focus:outline-[#0078C1]">
        Skip to main content
      </a>
      <GlobalSearch
        isOpen={searchOpen}
        onClose={() => setSearchOpen(false)}
        deliveryRecords={deliveryRecords}
        products={products}
        onNavigate={sidebarProps.handleNavigate}
      />

      {accessRequestModalProps && (
        <AccessRequestModal {...accessRequestModalProps} />
      )}

      <Sidebar {...sidebarProps} />

      <div className="flex-1 flex flex-col min-w-0" id="main-content-area">
        <Navbar {...navbarProps} />

        {dataError && (
          <ErrorState className="rounded-none border-x-0 border-t-0" id="data-error-banner">{dataError}</ErrorState>
        )}

        <main tabIndex={-1} className="flex-1 overflow-y-auto px-3 py-3 sm:px-4 sm:py-4 lg:px-5 lg:py-4" id="main-routed-view">
          {children}
        </main>
      </div>
    </div>
  );
};

export default MainLayout;
