import React, { Suspense, lazy } from 'react';

const DashboardPage = lazy(() => import('@/pages/DashboardPage'));
const DeliveriesPage = lazy(() => import('@/pages/DeliveriesPage'));
const AccountingCollectionPage = lazy(() => import('@/pages/AccountingCollectionPage'));
const InventoryPage = lazy(() => import('@/pages/InventoryPage'));
const CustomersPage = lazy(() => import('@/pages/CustomersPage'));
const SuppliersPage = lazy(() => import('@/pages/SuppliersPage'));
const DriversPage = lazy(() => import('@/pages/DriversPage'));
const CalendarPage = lazy(() => import('@/pages/CalendarPage'));
const TransactionCenterPage = lazy(() => import('@/pages/TransactionCenterPage'));
const AdminPage = lazy(() => import('@/pages/AdminPage'));
const DataSamplerPage = lazy(() => import('@/pages/DataSamplerPage'));
const StatisticalReportsPage = lazy(() => import('@/pages/StatisticalReportsPage'));
const AccountManagerDirectoryPage = lazy(() => import('@/pages/AccountManagerDirectoryPage'));
const MainView = lazy(() => import('@/pages/MainView'));
import {
  DeliveryRecord,
  UserRole,
  OutputActionConfig,
  OutputActionTrigger,
} from '@/types';
import {
  ApiCompany,
  ApiCustomer,
  ApiSupplier,
  ApiSku,
  ApiDriver,
  ApiDashboardStats,
} from '@/api';
import { CATEGORY_SCREENS } from './screenRouting';
import { DashboardFilterId } from '@/utils/dashboardFilters';

export interface AppRouterProps {
  currentScreen: string;
  deliveryRecords: DeliveryRecord[];
  companies: ApiCompany[];
  customers: ApiCustomer[];
  suppliers: ApiSupplier[];
  products: ApiSku[];
  managedDrivers: ApiDriver[];
  dashboardStats: ApiDashboardStats | null;
  currentUserRole: UserRole;
  currentUserName: string;
  effectiveScreens: Set<string>;
  canAccess: (screen: string) => boolean;
  handleNavigate: (screen: string, item_id?: string, dashboardFilterId?: DashboardFilterId) => void;
  handleCreateRecord: (data: any) => Promise<void>;
  handleUpdateRecord: (id: string, updates: Partial<DeliveryRecord>) => Promise<void>;
  handleVerifyCollection: (id: string) => Promise<void>;
  outputActionConfigs: Record<OutputActionTrigger, OutputActionConfig>;
  handleUpdateOutputActionConfig: (trigger: OutputActionTrigger, patch: Partial<OutputActionConfig>) => void;
  selectedRecordId: string | null;
  setSelectedRecordId: (id: string | null) => void;
  dashboardFilterId: DashboardFilterId | null;
  clearDashboardFilter: () => void;
  selectedProductId: string | null;
  setSelectedProductId: (id: string | null) => void;
  handleCreateCustomer: (data: any) => Promise<void>;
  handleCreateSupplier: (data: any) => Promise<void>;
  handleCreateDriver: (data: any) => Promise<void>;
  handleUpdateDriver: (id: string, data: any) => Promise<void>;
  handleDeleteDriver: (id: string) => Promise<void>;
  refreshData: () => Promise<void>;
}

export const AppRouter: React.FC<AppRouterProps> = ({
  currentScreen,
  deliveryRecords,
  companies,
  customers,
  suppliers,
  products,
  managedDrivers,
  dashboardStats,
  currentUserRole,
  currentUserName,
  effectiveScreens,
  canAccess,
  handleNavigate,
  handleCreateRecord,
  handleUpdateRecord,
  handleVerifyCollection,
  outputActionConfigs,
  handleUpdateOutputActionConfig,
  selectedRecordId,
  setSelectedRecordId,
  dashboardFilterId,
  clearDashboardFilter,
  selectedProductId,
  setSelectedProductId,
  handleCreateCustomer,
  handleCreateSupplier,
  handleCreateDriver,
  handleUpdateDriver,
  handleDeleteDriver,
  refreshData,
}) => {
  // Check access before mounting a page or running its protected data requests.
  if (!canAccess(currentScreen)) {
    return <div role="status" className="text-center py-12 text-slate-500">This page is not available for your account.</div>;
  }

  const renderContent = () => {
    // Special case: Accounting Collection has custom verification workflow
    if (currentScreen === 'accounting_collection') {
    return (
      <AccountingCollectionPage
        records={deliveryRecords}
        companies={companies}
        currentUserRole={currentUserRole}
        currentUserName={currentUserName}
        onCreateRecord={handleCreateRecord}
        onUpdateRecord={handleUpdateRecord}
        onVerifyCollection={handleVerifyCollection}
        selectedRecordIdFromDashboard={selectedRecordId}
        clearSelectedRecordId={() => setSelectedRecordId(null)}
        dashboardFilterId={dashboardFilterId}
        clearDashboardFilter={clearDashboardFilter}
      />
    );
  }

  // Delivery operational views
  if (CATEGORY_SCREENS[currentScreen]) {
    const category = CATEGORY_SCREENS[currentScreen];
    return (
      <DeliveriesPage
        category={category}
        records={deliveryRecords}
        companies={companies}
        currentUserRole={currentUserRole}
        currentUserName={currentUserName}
        onCreateRecord={handleCreateRecord}
        onUpdateRecord={handleUpdateRecord}
        onVerifyCollection={handleVerifyCollection}
        outputActionConfigs={outputActionConfigs}
        onUpdateOutputActionConfig={handleUpdateOutputActionConfig}
        selectedRecordIdFromDashboard={selectedRecordId}
        clearSelectedRecordId={() => setSelectedRecordId(null)}
        dashboardFilterId={dashboardFilterId}
        clearDashboardFilter={clearDashboardFilter}
        onRefresh={refreshData}
      />
    );
  }

  // General screens
  switch (currentScreen) {
    case 'dashboard':
      return (
        <DashboardPage
          products={products}
          deliveryRecords={deliveryRecords}
          dashboardStats={dashboardStats}
          onNavigate={handleNavigate}
          currentUserRole={currentUserRole}
          onRefresh={refreshData}
        />
      );

    case 'inventory':
      return (
        <InventoryPage
          skus={products}
          currentUserRole={currentUserRole}
          currentUserName={currentUserName}
          onRefresh={refreshData}
          selectedProductIdFromDashboard={selectedProductId}
          clearSelectedProductId={() => setSelectedProductId(null)}
        />
      );

    case 'driver':
    case 'driver_board':
    case 'driver_manager':
      return (
        <DriversPage
          activeScreen={currentScreen}
          canAccess={canAccess}
          records={deliveryRecords}
          onUpdateRecord={handleUpdateRecord}
          currentUserName={currentUserName}
          currentUserRole={currentUserRole}
          outputActionConfigs={outputActionConfigs}
          onNavigate={handleNavigate}
          drivers={managedDrivers}
          onCreateDriver={handleCreateDriver}
          onUpdateDriver={handleUpdateDriver}
          onDeleteDriver={handleDeleteDriver}
        />
      );

    case 'suppliers':
      return (
        <SuppliersPage
          suppliers={suppliers}
          deliveryRecords={deliveryRecords}
          currentUserRole={currentUserRole}
          currentUserName={currentUserName}
          onCreateSupplier={handleCreateSupplier}
        />
      );

    case 'customers':
      return (
        <CustomersPage
          customers={customers}
          currentUserRole={currentUserRole}
          currentUserName={currentUserName}
          onCreateCustomer={handleCreateCustomer}
        />
      );

    case 'transactions':
      return (
        <TransactionCenterPage
          currentUserRole={currentUserRole}
          currentUserName={currentUserName}
          dashboardFilterId={dashboardFilterId}
          clearDashboardFilter={clearDashboardFilter}
        />
      );

    case 'admin':
      return <AdminPage dashboardFilterId={dashboardFilterId} clearDashboardFilter={clearDashboardFilter} />;

    case 'main':
      return (
        <MainView
          records={deliveryRecords}
          currentUserRole={currentUserRole}
          currentUserName={currentUserName}
          onNavigate={handleNavigate}
          companies={companies}
          onCreateRecord={handleCreateRecord}
          effectiveScreens={effectiveScreens}
        />
      );

    case 'data_sampler':
      return (
        <DataSamplerPage
          companies={companies}
          currentUserName={currentUserName}
          onRefresh={refreshData}
        />
      );

    case 'calendar':
      return (
        <CalendarPage
          records={deliveryRecords}
          onNavigate={handleNavigate}
        />
      );

    case 'statistical_reports':
      return (
        <StatisticalReportsPage
          currentUserName={currentUserName}
          currentUserRole={currentUserRole}
        />
      );

    case 'am_directory':
      return (
        <AccountManagerDirectoryPage
          records={deliveryRecords}
          onNavigate={handleNavigate}
          canAccess={canAccess('am_directory')}
        />
      );

    default:
      return <div className="text-center py-12 text-slate-500 font-semibold">View Not Found</div>;
    }
  };

  return (
    <Suspense
      fallback={
        <div role="status" aria-live="polite" className="flex items-center justify-center py-24 text-slate-500">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-3 border-sky-600 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm font-medium text-slate-600">Loading view…</span>
          </div>
        </div>
      }
    >
      {renderContent()}
    </Suspense>
  );
};

export default AppRouter;
