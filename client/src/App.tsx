import { useCallback, useEffect, useState, type CSSProperties, Suspense } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { createQueryClient } from '@/api/queryClient';
import { useAuth, useUIStore } from '@/store';
import { useAuthStore } from '@/store/authStore';
import { useAppData, useDeliveryActions, usePermissions } from '@/hooks';
import { MainLayout } from '@/layouts';
import { AppRouter } from '@/routes';
import { syncAuthenticatedRoute } from '@/routes/screenRouting';
import { lazyPage } from '@/routes/lazyPage';
import { PageDataContext } from '@/routes/PageDataGate';
import { useServerAvailability } from '@/hooks/useServerAvailability';
import { permissionSessionKey } from '@/utils/permissions';
import { DashboardFilterId } from '@/utils/dashboardFilters';
import ServerUnavailableView from '@/features/auth/ServerUnavailableView';

const LoginView = lazyPage(() => import('@/features/auth/LoginView'));
const DriverDashboard = lazyPage(() => import('@/features/dashboard/DriverDashboard'));

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

  return <SessionApp key={`${authUser.name}:${permissionSessionKey(authUser)}`} />;
}

function SessionApp() {
  // A new cache for every login also isolates late requests from the old session.
  const [client] = useState(createQueryClient);
  useEffect(() => () => { client.clear(); }, [client]);
  return (
    <QueryClientProvider client={client}>
      <AuthenticatedApp />
      <Toaster
        position="bottom-right"
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

  // Zustand UI Store state and actions
  const currentScreen = useUIStore(s => s.currentScreen);
  const searchOpen = useUIStore(s => s.searchOpen);

  // TanStack Query synchronized application data hook
  const {
    deliveryRecords,
    activeRecordCounts,
    companies,
    customers,
    suppliers,
    dashboardStats,
    products,
    managedDrivers,
    dataLoading,
    dataError,
    retryPageData,
    resetting,
    refreshData,
    handleCreateCustomer,
    handleCreateSupplier,
    handleCreateDriver,
    handleUpdateDriver,
    handleDeleteDriver,
    handleResetDemoData,
  } = useAppData(authUser, currentUser, currentUserRole, authUser.role === 'DRIVER' && authUser.effectiveScreens.includes('driver_dashboard') ? 'driver_dashboard' : currentScreen, searchOpen);

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

  const isSidebarOpen = useUIStore(s => s.isSidebarOpen);
  const setIsSidebarOpen = useUIStore(s => s.setIsSidebarOpen);
  const isSidebarCollapsed = useUIStore(s => s.isSidebarCollapsed);
  const setIsSidebarCollapsed = useUIStore(s => s.setIsSidebarCollapsed);
  const setSearchOpen = useUIStore(s => s.setSearchOpen);
  const accessRequestOpen = useUIStore(s => s.accessRequestOpen);
  const accessRequestScreen = useUIStore(s => s.accessRequestScreen);
  const openAccessRequest = useUIStore(s => s.openAccessRequest);
  const closeAccessRequest = useUIStore(s => s.closeAccessRequest);
  const selectedProductId = useUIStore(s => s.selectedProductId);
  const setSelectedProductId = useUIStore(s => s.setSelectedProductId);
  const selectedRecordId = useUIStore(s => s.selectedRecordId);
  const setSelectedRecordId = useUIStore(s => s.setSelectedRecordId);
  const dashboardFilterId = useUIStore(s => s.dashboardFilterId);
  const clearDashboardFilter = useUIStore(s => s.clearDashboardFilter);
  const navigate = useUIStore(s => s.handleNavigate);
  const handleNavigate = useCallback((screen: string, itemId?: string, filterId?: DashboardFilterId) => {
    if (screen !== 'no-access' && !effectiveScreens.has(screen)) {
      openAccessRequest(screen);
      return;
    }
    navigate(screen, itemId, filterId);
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

  // Small, server-scoped aggregates keep badge counts correct even when
  // Customers/Inventory/Admin do not download the complete records list.
  const deliveriesActiveCount = activeRecordCounts?.deliveries ?? 0;
  const rmaActiveCount = activeRecordCounts?.rma ?? 0;
  const salesOrdersActiveCount = activeRecordCounts?.sales_orders ?? 0;
  const accountingActiveCount = activeRecordCounts?.accounting_collection ?? 0;
  const procurementActiveCount = activeRecordCounts?.procurement_pickup ?? 0;

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
      <Suspense
        fallback={
          <div className="min-h-screen bg-[#F8F9FB] flex items-center justify-center text-slate-500" role="status">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-3 border-sky-600 border-t-transparent rounded-full animate-spin" />
              <span className="text-sm font-medium text-slate-600">Loading driver dashboard…</span>
            </div>
          </div>
        }
      >
        <PageDataContext.Provider value={{ loading: dataLoading, error: dataError, onRetry: retryPageData }}>
          <DriverDashboard
            serverPaging
            records={deliveryRecords}
            currentUserName={currentUser.name}
            onUpdateRecord={handleUpdateRecord}
            onLogout={logout}
            dataLoading={dataLoading}
          />
        </PageDataContext.Provider>
      </Suspense>
    );
  }

  return (
    <MainLayout
      searchOpen={searchOpen}
      setSearchOpen={setSearchOpen}
      deliveryRecords={deliveryRecords}
      customers={canAccess('customers') ? customers : []}
      suppliers={canAccess('suppliers') ? suppliers : []}
      drivers={canAccess('driver_manager') || canAccess('driver') || canAccess('driver_board') ? managedDrivers : []}
      products={canAccess('inventory') ? products : []}
      accessibleScreens={effectiveScreens}
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
      <PageDataContext.Provider value={{ loading: canAccess(currentScreen) && dataLoading, error: canAccess(currentScreen) ? dataError : null, onRetry: retryPageData }}>
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
          dashboardFilterId={dashboardFilterId}
          clearDashboardFilter={clearDashboardFilter}
          selectedProductId={selectedProductId}
          setSelectedProductId={setSelectedProductId}
          handleCreateCustomer={handleCreateCustomer}
          handleCreateSupplier={handleCreateSupplier}
          handleCreateDriver={handleCreateDriver}
          handleUpdateDriver={handleUpdateDriver}
          handleDeleteDriver={handleDeleteDriver}
          refreshData={refreshData}
        />
      </PageDataContext.Provider>
    </MainLayout>
  );
}

export default function App() {
  return <AppContent />;
}
