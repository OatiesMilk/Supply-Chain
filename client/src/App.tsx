import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { createQueryClient } from '@/api/queryClient';
import { useAuth, useUIStore } from '@/store';
import { useAuthStore } from '@/store/authStore';
import { useAppData, useDeliveryActions, usePermissions } from '@/hooks';
import { MainLayout } from '@/layouts';
import { AppRouter } from '@/routes';
import { syncAuthenticatedRoute } from '@/routes/screenRouting';
import LoginView from '@/features/auth/LoginView';
import ServerUnavailableView from '@/features/auth/ServerUnavailableView';
import { useServerAvailability } from '@/hooks/useServerAvailability';
import DriverDashboard from '@/features/dashboard/DriverDashboard';
import { DeliveryCategory } from '@/types';

function AppContent() {
  const { authUser, authChecked, logoutPending, login, checkAuth } = useAuth();
  const { status, retrying, retry } = useServerAvailability();
  const [sessionReady, setSessionReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setSessionReady(false);
    if (status === 'available') {
      void checkAuth().then(() => {
        if (!cancelled) setSessionReady(true);
      });
    }
    return () => { cancelled = true; };
  }, [checkAuth, status]);

  useEffect(() => {
    if (!authUser) return;
    const refresh = () => { void useAuthStore.getState().refreshPermissions(); };
    const interval = window.setInterval(refresh, 30_000);
    window.addEventListener('focus', refresh);
    window.addEventListener('online', refresh);
    window.addEventListener('session-permissions-changed', refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('online', refresh);
      window.removeEventListener('session-permissions-changed', refresh);
    };
  }, [authUser?.id]);

  if (status === 'unavailable') {
    return <ServerUnavailableView retrying={retrying} onRetry={retry} />;
  }

  if (status === 'checking' || !sessionReady || !authChecked) {
    return (
      <div className="min-h-screen bg-[#F8F9FB] flex items-center justify-center" id="auth-check-loading" role="status">
        Checking your session…
      </div>
    );
  }

  if (logoutPending) return <div role="status" className="min-h-screen flex items-center justify-center">Signing out...</div>;
  if (!authUser) return <LoginView onLoggedIn={login} />;

  return <SessionApp key={`${authUser.id}:${authUser.name}:${authUser.permissionVersion}`} />;
}

function SessionApp() {
  // A new cache for every login also isolates late requests from the old session.
  const [client] = useState(createQueryClient);
  useEffect(() => () => { client.clear(); }, [client]);
  return (
    <QueryClientProvider client={client}>
      <AuthenticatedApp />
      <Toaster
        position="top-right"
        richColors
        closeButton
        duration={5000}
        style={{
          '--normal-bg': '#FFFFFF',
          '--normal-text': '#1F3864',
          '--normal-border': '#0078C1',
          '--success-bg': '#1F3864',
          '--success-text': '#FFFFFF',
          '--success-border': '#0078C1',
          '--error-bg': '#FFFFFF',
          '--error-text': '#991B1B',
          '--error-border': '#0078C1',
          '--info-bg': '#E6F4FB',
          '--info-text': '#1F3864',
          '--info-border': '#0078C1',
        } as CSSProperties}
      />
    </QueryClientProvider>
  );
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
  const navigate = useUIStore(s => s.handleNavigate);
  const handleNavigate = useCallback((screen: string, itemId?: string) => {
    if (screen !== 'no-access' && !effectiveScreens.has(screen)) {
      openAccessRequest(screen);
      return;
    }
    navigate(screen, itemId);
  }, [navigate, effectiveScreens, openAccessRequest]);

  // Client-side routing
  useEffect(() => {
    const syncRoute = () => {
      syncAuthenticatedRoute(effectiveScreens, handleNavigate);
    };
    syncRoute();
    window.addEventListener('popstate', syncRoute);
    return () => window.removeEventListener('popstate', syncRoute);
  }, [handleNavigate, effectiveScreens]);

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

  const deliveriesActiveCount = countByCategory('Deliveries', ['Scheduled', 'In Transit', 'Pending']);
  const rmaActiveCount = countByCategory('RMA', ['Scheduled', 'In Transit', 'Pending', 'On-Hold']);
  const salesOrdersActiveCount = countByCategory('Sales Orders', ['Scheduled', 'In Transit', 'Pending']);
  const accountingActiveCount = countByCategory('Accounting Collection', ['Scheduled', 'In Transit', 'Pending']);
  const procurementActiveCount = countByCategory('Procurement Pick-up', ['Scheduled', 'In Transit', 'Pending']);

  // Driver role gets standalone mobile-first dashboard
  if (effectiveScreens.size === 0) {
    return <div className="min-h-screen flex flex-col items-center justify-center gap-4">
      <h1 className="text-xl font-bold">No modules assigned</h1>
      <p>Contact your administrator to request access.</p>
      <button onClick={() => void logout()} className="rounded bg-blue-800 px-4 py-2 text-white">Sign out</button>
    </div>;
  }

  if (authUser.role === 'DRIVER' && canAccess('driver_dashboard')) {
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
      // Global search only offers SKU results that open in SKU Master (TSK-118).
      products={canAccess('inventory') ? products : []}
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
  return <AppContent />;
}
