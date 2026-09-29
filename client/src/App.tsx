import { useEffect } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/api/queryClient';
import { useAuth, useUIStore } from '@/store';
import { useAppData, useDeliveryActions, usePermissions } from '@/hooks';
import { MainLayout } from '@/layouts';
import { AppRouter } from '@/routes';
import LoginView from '@/features/auth/LoginView';
import DriverDashboard from '@/features/dashboard/DriverDashboard';
import { DeliveryCategory } from '@/types';

function AppContent() {
  const { authUser, authChecked, login, checkAuth } = useAuth();

  useEffect(() => {
    void checkAuth();
  }, [checkAuth]);

  if (!authChecked) {
    return (
      <div className="min-h-screen bg-[#F8F9FB] flex items-center justify-center" id="auth-check-loading" role="status">
        Checking your session…
      </div>
    );
  }

  if (!authUser) return <LoginView onLoggedIn={login} />;

  return <AuthenticatedApp key={authUser.id} />;
}

// Keep protected data hooks and application effects behind the session gate.
function AuthenticatedApp() {
  const {
    authUser,
    currentUserRole,
    currentUserName,
    currentUserInitials,
    logout,
  } = useAuth();

  const currentUser = {
    name: currentUserName,
    initials: currentUserInitials,
  };

  // TanStack Query synchronized application data hook
  const {
    deliveryRecords,
    companies,
    customers,
    suppliers,
    dashboardStats,
    products,
    managedDrivers,
    dataLoading,
    dataError,
    resetting,
    refreshData,
    handleCreateCustomer,
    handleCreateSupplier,
    handleCreateDriver,
    handleUpdateDriver,
    handleDeleteDriver,
    handleResetDemoData,
  } = useAppData(authUser, currentUser, currentUserRole);

  // TanStack Query mutation action workflows hook
  const {
    outputActionConfigs,
    handleUpdateOutputActionConfig,
    handleCreateRecord,
    handleUpdateRecord,
    handleVerifyCollection,
  } = useDeliveryActions({
    currentUser,
    currentUserRole,
    refreshData,
  });

  // Role permissions & screen access hook
  const { effectiveScreens, canAccess } = usePermissions(authUser);

  // Zustand UI Store state and actions
  const currentScreen = useUIStore(s => s.currentScreen);
  const isSidebarOpen = useUIStore(s => s.isSidebarOpen);
  const setIsSidebarOpen = useUIStore(s => s.setIsSidebarOpen);
  const isSidebarCollapsed = useUIStore(s => s.isSidebarCollapsed);
  const setIsSidebarCollapsed = useUIStore(s => s.setIsSidebarCollapsed);
  const zoomFactor = useUIStore(s => s.zoomFactor);
  const setZoomFactor = useUIStore(s => s.setZoomFactor);
  const searchOpen = useUIStore(s => s.searchOpen);
  const setSearchOpen = useUIStore(s => s.setSearchOpen);
  const accessRequestOpen = useUIStore(s => s.accessRequestOpen);
  const accessRequestScreen = useUIStore(s => s.accessRequestScreen);
  const openAccessRequest = useUIStore(s => s.openAccessRequest);
  const closeAccessRequest = useUIStore(s => s.closeAccessRequest);
  const selectedProductId = useUIStore(s => s.selectedProductId);
  const setSelectedProductId = useUIStore(s => s.setSelectedProductId);
  const selectedRecordId = useUIStore(s => s.selectedRecordId);
  const setSelectedRecordId = useUIStore(s => s.setSelectedRecordId);
  const handleNavigate = useUIStore(s => s.handleNavigate);

  // Client-side routing
  useEffect(() => {
    // On mount, read the URL
    const params = new URLSearchParams(window.location.search);
    const item_id = params.get('item') || undefined;
    const path = window.location.pathname.substring(1);
    const screen = path || 'dashboard';
    
    // Initial route handling
    if (path && path !== currentScreen) {
      handleNavigate(screen, item_id);
    }

    const handlePopState = () => {
      const p = window.location.pathname.substring(1);
      const params = new URLSearchParams(window.location.search);
      const itemId = params.get('item') || undefined;
      const s = p || 'dashboard';
      handleNavigate(s, itemId);
    };
    
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [handleNavigate]);

  useEffect(() => {
    document.documentElement.style.fontSize = `${zoomFactor}%`;
    return () => {
      document.documentElement.style.fontSize = '';
    };
  }, [zoomFactor]);

  // Global Ctrl+K / Cmd+K search modal shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(!searchOpen);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [searchOpen, setSearchOpen]);

  // Dynamic counts for sidebar badges
  const countByCategory = (cat: DeliveryCategory, statuses: string[]) =>
    deliveryRecords.filter(r => r.category === cat && statuses.includes(r.status)).length;

  const deliveriesActiveCount = countByCategory('Deliveries', ['Scheduled', 'Pending']);
  const rmaActiveCount = countByCategory('RMA', ['Scheduled', 'Pending', 'On-Hold']);
  const salesOrdersActiveCount = countByCategory('Sales Orders', ['Scheduled', 'Pending']);
  const accountingActiveCount = countByCategory('Accounting Collection', ['Scheduled', 'Pending']);
  const procurementActiveCount = countByCategory('Procurement Pick-up', ['Scheduled', 'Pending']);

  // Driver role gets standalone mobile-first dashboard
  if (authUser.role === 'DRIVER') {
    return (
      <DriverDashboard
        records={deliveryRecords}
        currentUserName={currentUser.name}
        onUpdateRecord={handleUpdateRecord}
        onLogout={logout}
        dataLoading={dataLoading}
      />
    );
  }

  return (
    <MainLayout
      searchOpen={searchOpen}
      setSearchOpen={setSearchOpen}
      deliveryRecords={deliveryRecords}
      products={products}
      dataError={dataError}
      accessRequestModalProps={{
        isOpen: accessRequestOpen,
        onClose: closeAccessRequest,
        screenName: accessRequestScreen,
        currentUserRole,
      }}
      sidebarProps={{
        currentScreen,
        handleNavigate,
        isSidebarCollapsed,
        setIsSidebarCollapsed,
        isSidebarOpen,
        setIsSidebarOpen,
        canAccess,
        currentUserRole,
        currentUser,
        deliveriesActiveCount,
        rmaActiveCount,
        salesOrdersActiveCount,
        accountingActiveCount,
        procurementActiveCount,
        onRequestAccess: () => openAccessRequest(''),
      }}
      navbarProps={{
        currentScreen,
        setIsSidebarOpen,
        zoomFactor,
        setZoomFactor,
        currentUser,
        currentUserRole,
        setSearchOpen,
        deliveryRecords,
        handleNavigate,
        handleResetDemoData,
        resetting,
        handleLogout: logout,
      }}
    >
      <AppRouter
        currentScreen={currentScreen}
        deliveryRecords={deliveryRecords}
        companies={companies}
        customers={customers}
        suppliers={suppliers}
        products={products}
        managedDrivers={managedDrivers}
        dashboardStats={dashboardStats}
        currentUserRole={currentUserRole}
        currentUserName={currentUser.name}
        effectiveScreens={effectiveScreens}
        canAccess={canAccess}
        handleNavigate={handleNavigate}
        handleCreateRecord={handleCreateRecord}
        handleUpdateRecord={handleUpdateRecord}
        handleVerifyCollection={handleVerifyCollection}
        outputActionConfigs={outputActionConfigs}
        handleUpdateOutputActionConfig={handleUpdateOutputActionConfig}
        selectedRecordId={selectedRecordId}
        setSelectedRecordId={setSelectedRecordId}
        selectedProductId={selectedProductId}
        setSelectedProductId={setSelectedProductId}
        handleCreateCustomer={handleCreateCustomer}
        handleCreateSupplier={handleCreateSupplier}
        handleCreateDriver={handleCreateDriver}
        handleUpdateDriver={handleUpdateDriver}
        handleDeleteDriver={handleDeleteDriver}
        refreshData={refreshData}
      />
    </MainLayout>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppContent />
    </QueryClientProvider>
  );
}
