import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { useAppData, useDeliveryActions, usePermissions } from '@/hooks';
import { MainLayout } from '@/layouts';
import { AppRouter, CATEGORY_SCREENS } from '@/routes';
import LoginView from '@/features/auth/LoginView';
import DriverDashboard from '@/features/dashboard/DriverDashboard';
import { DeliveryCategory } from '@/types';

function AppContent() {
  const {
    authUser,
    authChecked,
    currentUserRole,
    currentUserName,
    currentUserInitials,
    login,
    logout,
  } = useAuth();

  const currentUser = {
    name: currentUserName,
    initials: currentUserInitials,
  };

  // Application data & server synchronization hook
  const {
    deliveryRecords,
    setDeliveryRecords,
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

  // Delivery & status action workflows hook
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
    setDeliveryRecords,
  });

  // Role permissions & screen access hook
  const { effectiveScreens, canAccess } = usePermissions(authUser);

  // Navigation & cross-screen selection state
  const [currentScreen, setCurrentScreen] = useState<string>('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);

  // Global search modal state
  const [searchOpen, setSearchOpen] = useState(false);

  // Access request modal state
  const [accessRequestOpen, setAccessRequestOpen] = useState(false);
  const [accessRequestScreen, setAccessRequestScreen] = useState('');

  // Accessibility zoom state
  const [zoomFactor, setZoomFactor] = useState<number>(100);

  useEffect(() => {
    document.documentElement.style.fontSize = `${zoomFactor}%`;
    return () => {
      document.documentElement.style.fontSize = '';
    };
  }, [zoomFactor]);

  // Global Ctrl+K / Cmd+K search shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(open => !open);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const handleNavigate = (screen: string, item_id?: string) => {
    setCurrentScreen(screen);
    setIsSidebarOpen(false);
    if (screen === 'inventory' && item_id) {
      setSelectedProductId(item_id);
    } else if (CATEGORY_SCREENS[screen] && item_id) {
      setSelectedRecordId(item_id);
    }
  };

  // Dynamic counts for sidebar badges
  const countByCategory = (cat: DeliveryCategory, statuses: string[]) =>
    deliveryRecords.filter(r => r.category === cat && statuses.includes(r.status)).length;

  const deliveriesActiveCount = countByCategory('Deliveries', ['Scheduled', 'Pending']);
  const rmaActiveCount = countByCategory('RMA', ['Scheduled', 'Pending', 'On-Hold']);
  const salesOrdersActiveCount = countByCategory('Sales Orders', ['Scheduled', 'Pending']);

  // Auth loading gate
  if (!authChecked) {
    return <div className="min-h-screen bg-[#F8F9FB]" id="auth-check-loading" />;
  }

  // Unauthenticated -> Login view
  if (!authUser) {
    return <LoginView onLoggedIn={login} />;
  }

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
        onClose: () => {
          setAccessRequestOpen(false);
          setAccessRequestScreen('');
        },
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
        onRequestAccess: () => {
          setAccessRequestScreen('');
          setAccessRequestOpen(true);
        },
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
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
