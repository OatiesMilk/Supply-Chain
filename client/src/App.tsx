import { useState, useEffect, useCallback } from 'react';
import {
  LayoutDashboard,
  LayoutGrid,
  Package,
  Truck,
  Users,
  Clock,
  AlertTriangle,
  RotateCcw,
  Banknote,
  PackageSearch,
  Smartphone,
  ZoomIn,
  ZoomOut,
  Menu,
  X,
  RotateCw,
  ShoppingCart,
  LogOut,
  Loader2,
  ShieldAlert,
  ArrowRightLeft,
  Calendar,
  KanbanSquare,
  UsersRound,
  Search,
  Building2,
  Info,
  Send,
  Lock,
  Shuffle,
  History,
  BarChart2
} from 'lucide-react';

import {
  Product,
  InventoryItem,
  Customer,
  Supplier,
  DeliveryRecord,
  DeliveryCategory,
  UserRole,
  OutputActionConfig,
  OutputActionTrigger
} from './types';
import { DEFAULT_OUTPUT_ACTIONS } from './outputActions';
import { loadState, saveState } from './persistence';
import { CATEGORY_SCREENS } from './screenRouting';
import { setManagedDriverList } from './data';
import { api, ApiUser, ApiCompany, ApiCustomer, ApiSupplier, ApiDriver, ApiDashboardStats, ApiSku, ApiError } from './api';

// Import Screens
import DashboardView from './components/DashboardView';
import InventoryView from './components/InventoryView';
// SkuWorkspace is used inside InventoryView — no direct import needed here
import DeliveryRecordsView from './components/DeliveryRecordsView';
import DriverView from './components/DriverView';
import CustomersView from './components/CustomersView';
import LoginView from './components/LoginView';
import AdminPanel from './components/AdminPanel';
import TransactionCenter from './components/TransactionCenter';
import AccountingCollectionView from './components/AccountingCollectionView';
import NotificationBell from './components/NotificationBell';
import GlobalSearch from './components/GlobalSearch';
import DeliveryCalendar from './components/DeliveryCalendar';
import DriverBoard from './components/DriverBoard';
import AccountManagerDirectory from './components/AccountManagerDirectory';
import SuppliersView from './components/SuppliersView';
import DataSamplerView from './components/DataSamplerView';
import MainView from './components/MainView';
import DriverDashboard from './components/DriverDashboard';
import StatusHistoryView from './components/StatusHistoryView';
import StatisticalReportView from './components/StatisticalReportView';
import DriverManagerView from './components/DriverManagerView';

// Maps the real DB role (SALES_COORDINATOR | LOGISTICS | TASS | ADMIN) to the
// display-friendly UserRole labels the rest of the frontend already uses.
const roleFromApi = (role: ApiUser['role']): UserRole => {
  switch (role) {
    case 'SALES_COORDINATOR': return 'Sales Coordinator';
    case 'LOGISTICS': return 'Logistics';
    case 'TASS': return 'TASS';
    case 'ADMIN': return 'Admin';
    case 'DRIVER': return 'Driver';
    default: return 'Sales Coordinator';
  }
};

const initialsFor = (name: string) =>
  name.split(/\s+/).map(p => p[0]).join('').slice(0, 2).toUpperCase();

// Normalizes a raw API delivery-record payload into the shape the existing
// screens (DeliveryRecordsView, DriverView, DashboardView) already expect,
// adding empty defaults for the client-only IPO Output Actions simulation
// fields that have no backend equivalent (see src/outputActions.ts - the
// simulation stays a frontend-only prototype feature except for the single
// real ACCOMPLISHED trigger, which the backend handles server-side).
function normalizeApiRecord(r: any): DeliveryRecord {
  return {
    ...r,
    customer_id: r.company_id,
    driver_assistants: Array.isArray(r.driver_assistants) ? r.driver_assistants : [],
    output_actions_log: r.output_actions_log ?? [],
    email_notification_sent: r.status === 'Delivered'
  };
}

export default function App() {
  // --- AUTH STATE: real login against the Express + Prisma backend, JWT in an
  // --- httpOnly cookie. Replaces the old header role-switcher <select>, which
  // --- let anyone pretend to be any role with zero credentials.
  const [authUser, setAuthUser] = useState<ApiUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    api.me()
      .then(setAuthUser)
      .catch(() => setAuthUser(null))
      .finally(() => setAuthChecked(true));
  }, []);

  const currentUserRole: UserRole = authUser ? roleFromApi(authUser.role) : 'Sales Coordinator';
  const currentUser = authUser
    ? { name: authUser.name, initials: initialsFor(authUser.name) }
    : { name: '', initials: '' };

  // --- SERVER-BACKED STATE: delivery records, companies, SKU Master, and the
  // --- Customer/Supplier directories all live in PostgreSQL via the Express
  // --- + Prisma API (server/).
  const [deliveryRecords, setDeliveryRecords] = useState<DeliveryRecord[]>([]);
  const [companies, setCompanies] = useState<ApiCompany[]>([]);
  const [customers, setCustomers] = useState<ApiCustomer[]>([]);
  const [suppliers, setSuppliers] = useState<ApiSupplier[]>([]);
  const [dashboardStats, setDashboardStats] = useState<ApiDashboardStats | null>(null);
  const [products, setProducts] = useState<ApiSku[]>([]);
  const [managedDrivers, setManagedDrivers] = useState<ApiDriver[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);

  const refreshData = useCallback(async () => {
    setDataLoading(true);
    setDataError(null);
    try {
      const [records, companyList, customerList, supplierList, stats, skuList] = await Promise.all([
        api.getRecords(),
        api.getCompanies(),
        api.getCustomers(),
        api.getSuppliers(),
        api.getDashboardStats(),
        api.getSkus(),
      ]);
      setDeliveryRecords(records.map(normalizeApiRecord));
      setCompanies(companyList);
      setCustomers(customerList);
      setSuppliers(supplierList);
      setDashboardStats(stats);
      setProducts(skuList);

      // Driver manager fetch is non-blocking — if the Driver table doesn't
      // exist yet (migration not run), core data still loads.
      try {
        const driverList = await api.getDrivers(true);
        setManagedDrivers(driverList);
        setManagedDriverList(driverList.map(d => ({
          name: d.name,
          type: d.type,
          coverage_areas: d.coverage_areas,
          is_active: d.is_active,
        })));
      } catch {
        // Driver table may not exist yet — fall back to hardcoded defaults
      }
    } catch (err) {
      setDataError(err instanceof ApiError ? err.message : 'Failed to load data from the server.');
    } finally {
      setDataLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authUser) refreshData();
  }, [authUser, refreshData]);

  const handleLogout = async () => {
    try { await api.logout(); } catch { /* ignore */ }
    setAuthUser(null);
    setDeliveryRecords([]);
    setCompanies([]);
    setCustomers([]);
    setSuppliers([]);
    setDashboardStats(null);
    setProducts([]);
    setManagedDrivers([]);
  };

  const handleCreateCustomer = async (data: { name: string; contact_person?: string; email?: string; phone?: string; address?: string; city?: string }) => {
    try {
      await api.createCustomer(data);
      await refreshData();
    } catch (err) {
      setDataError(err instanceof ApiError ? err.message : 'Failed to create customer.');
    }
  };

  const handleCreateSupplier = async (data: { name: string; contact_person?: string; email?: string; phone?: string; address?: string; city?: string; category?: string }) => {
    try {
      await api.createSupplier(data);
      await refreshData();
    } catch (err) {
      setDataError(err instanceof ApiError ? err.message : 'Failed to create supplier.');
    }
  };

  const handleCreateDriver = async (data: { name: string; type: 'DRIVER' | 'ASSISTANT'; coverage_areas?: string[] }) => {
    try {
      await api.createDriver(data);
      await refreshData();
    } catch (err) {
      setDataError(err instanceof ApiError ? err.message : 'Failed to create driver.');
    }
  };

  const handleUpdateDriver = async (id: string, data: Partial<{ name: string; type: string; coverage_areas: string[]; is_active: boolean }>) => {
    try {
      await api.updateDriver(id, data);
      await refreshData();
    } catch (err) {
      setDataError(err instanceof ApiError ? err.message : 'Failed to update driver.');
    }
  };

  const handleDeleteDriver = async (id: string) => {
    try {
      await api.deleteDriver(id);
      await refreshData();
    } catch (err) {
      setDataError(err instanceof ApiError ? err.message : 'Failed to delete driver.');
    }
  };

  // --- AUTO-REFRESH: poll server every 60 seconds to keep data live.
  useEffect(() => {
    if (!authUser) return;
    const id = setInterval(() => { refreshData(); }, 60_000);
    return () => clearInterval(id);
  }, [authUser, refreshData]);

  // --- IPO OUTPUT ACTIONS: shared, app-wide config per trigger event. Editing
  // --- a toggle anywhere (record drawer, new-record form) updates this shared
  // --- config, so it applies consistently the next time that trigger fires
  // --- anywhere in the app (including from the Logistics dispatch board).
  const [outputActionConfigs, setOutputActionConfigs] = useState<Record<OutputActionTrigger, OutputActionConfig>>(() => loadState('outputActionConfigs', DEFAULT_OUTPUT_ACTIONS));
  useEffect(() => { saveState('outputActionConfigs', outputActionConfigs); }, [outputActionConfigs]);
  const handleUpdateOutputActionConfig = (trigger: OutputActionTrigger, patch: Partial<OutputActionConfig>) => {
    setOutputActionConfigs(prev => ({ ...prev, [trigger]: { ...prev[trigger], ...patch } }));
  };

  // Reset Demo Data now that persistence is server-side: instead of clearing
  // localStorage and reloading, this calls a dev-only backend endpoint that
  // truncates and re-runs the seed script, then refetches. See final report -
  // this preserves the pre-demo "fresh data" workflow the prototype had.
  const [resetting, setResetting] = useState(false);
  const handleResetDemoData = async () => {
    if (!window.confirm('Reset all Supply Chain Portal data back to the original demo seed data? This clears every change made on the server and cannot be undone.')) return;
    setResetting(true);
    try {
      await api.resetSeed();
      await refreshData();
    } catch (err) {
      setDataError(err instanceof ApiError ? err.message : 'Failed to reset demo data.');
    } finally {
      setResetting(false);
    }
  };

  // --- GLOBAL SEARCH ---
  const [searchOpen, setSearchOpen] = useState(false);

  // --- ACCESS REQUEST MODAL ---
  const [accessRequestOpen, setAccessRequestOpen] = useState(false);
  const [accessRequestScreen, setAccessRequestScreen] = useState('');
  const [accessRequestNote, setAccessRequestNote] = useState('');
  const [accessRequestSent, setAccessRequestSent] = useState(false);

  const handleAccessRequest = () => {
    // In a real system this would POST to /api/access-requests
    // For now we simulate a sent state
    setAccessRequestSent(true);
    setTimeout(() => {
      setAccessRequestOpen(false);
      setAccessRequestSent(false);
      setAccessRequestNote('');
    }, 2000);
  };

  // Role scope: which screens each role can access (default baseline)
  const DEFAULT_ROLE_SCOPE: Record<string, string[]> = {
    'Sales Coordinator': ['main', 'dashboard', 'deliveries', 'rma', 'accounting_collection', 'procurement_pickup', 'sales_orders', 'customers', 'suppliers', 'am_directory', 'transactions', 'inventory'],
    'Logistics':         ['main', 'dashboard', 'deliveries', 'rma', 'accounting_collection', 'procurement_pickup', 'sales_orders', 'customers', 'suppliers', 'driver', 'driver_manager', 'calendar', 'driver_board', 'transactions', 'inventory', 'status_history', 'statistical_reports'],
    'TASS':              ['main', 'dashboard', 'rma', 'procurement_pickup', 'accounting_collection', 'transactions', 'inventory', 'suppliers'],
    'Admin':             ['main', 'dashboard', 'deliveries', 'rma', 'accounting_collection', 'procurement_pickup', 'sales_orders', 'customers', 'suppliers', 'driver', 'driver_manager', 'admin', 'calendar', 'driver_board', 'am_directory', 'transactions', 'inventory', 'data_sampler', 'status_history', 'statistical_reports'],
    'Driver':            ['driver_dashboard'],
  };

  const [effectiveScreens, setEffectiveScreens] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!authUser) { setEffectiveScreens(new Set()); return; }
    const role = roleFromApi(authUser.role);
    const screens = new Set(DEFAULT_ROLE_SCOPE[role] ?? []);
    for (const perm of authUser.permissions ?? []) {
      if (perm.granted) screens.add(perm.screen);
      else screens.delete(perm.screen);
    }
    // Admin always retains the admin screen regardless of overrides
    if (authUser.role === 'ADMIN') screens.add('admin');
    // Warehouse module is retired — force-excluded regardless of any stale
    // per-user permission grant left over from before it was hidden.
    screens.delete('warehouses');
    setEffectiveScreens(screens);
  }, [authUser]); // eslint-disable-line react-hooks/exhaustive-deps

  const canAccess = (screen: string) => effectiveScreens.has(screen);

  const handleRestrictedNavigate = (screen: string, label: string) => {
    if (canAccess(screen)) {
      handleNavigate(screen);
    } else {
      setAccessRequestScreen(label);
      setAccessRequestOpen(true);
    }
  };

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

  // --- NAVIGATION STATE ---
  const [currentScreen, setCurrentScreen] = useState<string>('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);

  // --- ACCESSIBILITY ZOOM STATE ---
  // zoomFactor is the actual root font-size percentage: 100 = a true, un-zoomed 16px root.
  const [zoomFactor, setZoomFactor] = useState<number>(100);

  useEffect(() => {
    document.documentElement.style.fontSize = `${zoomFactor}%`;
    return () => {
      document.documentElement.style.fontSize = '';
    };
  }, [zoomFactor]);

  // Cross-screen navigation (e.g. clicking a SKU or record elsewhere jumps + highlights)
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);

  // Driver View is a Logistics-only tool. If a Logistics session ends (logout)
  // while it's open, the login gate below unmounts the whole app shell anyway,
  // so no extra guard is needed here beyond the sidebar's own role check.

  const handleNavigate = (screen: string, item_id?: string) => {
    setCurrentScreen(screen);
    setIsSidebarOpen(false);
    if (screen === 'inventory' && item_id) {
      setSelectedProductId(item_id);
    } else if (CATEGORY_SCREENS[screen] && item_id) {
      setSelectedRecordId(item_id);
    }
  };

  // --- Create a new DeliveryRecord via POST /api/records (Sales Coordinator only,
  // --- enforced server-side). created_by / created_at / modified_by / modified_at
  // --- now come from the DB via the API response, not client-computed strings. ---
  const handleCreateRecord = async (
    data: Omit<DeliveryRecord, 'id' | 'created_by' | 'created_at' | 'modified_by' | 'modified_at' | 'email_notification_sent'>
  ) => {
    try {
      await api.createRecord(data as unknown as Record<string, unknown>);
      await refreshData();
    } catch (err) {
      setDataError(err instanceof ApiError ? err.message : 'Failed to create record.');
    }
  };

  // --- Update an existing DeliveryRecord. Status-only changes go through the
  // --- dedicated PATCH /status endpoint (Logistics only, server-enforced, and
  // --- the sole path that can fire the real ACCOMPLISHED email trigger);
  // --- everything else (driver/vehicle/remarks/etc) goes through PUT. ---
  const handleUpdateRecord = async (id: string, updates: Partial<DeliveryRecord>) => {
    try {
      if (updates.status) {
        const u = updates as any;
        const extra: { time_out?: string; received_by?: string } = {};
        if (u.time_out) extra.time_out = u.time_out;
        if (u.received_by) extra.received_by = u.received_by;
        await api.patchStatus(
          id,
          updates.status,
          u.status_remarks ?? u.remarks ?? '',
          Object.keys(extra).length > 0 ? extra : undefined
        );
      } else {
        const { modified_by, modified_at, output_actions_log, email_notification_sent, company_name, customer_id, ...rest } = updates as any;
        await api.updateRecord(id, rest);
      }
      await refreshData();
    } catch (err) {
      setDataError(err instanceof ApiError ? err.message : 'Failed to update record.');
    }
  };

  // --- Collection verification (TASS only, Accounting Collection ACCOMPLISHED records) ---
  const handleVerifyCollection = async (id: string) => {
    try {
      await api.verifyCollection(id);
      await refreshData();
    } catch (err) {
      setDataError(err instanceof ApiError ? err.message : 'Failed to verify collection.');
    }
  };

  // --- DERIVE LEGACY SHAPES for DashboardView which expects Product[] + InventoryItem[].
  // --- These are computed from the API-fetched ApiSku[] and passed down to DashboardView.
  const legacyProducts: Product[] = products.map(sku => ({
    id: sku.id,
    sku_code: sku.sku_code,
    name: sku.name,
    category: sku.category as 'A' | 'B' | 'C',
    unit_cost: sku.unit_cost,
    unit_price: sku.unit_price,
    reorder_point: sku.reorder_point,
    description: sku.description,
    created_by: sku.created_by,
    created_at: sku.created_at,
    modified_by: sku.modified_by,
    modified_at: sku.updated_at
  }));

  const legacyInventory: InventoryItem[] = products
    .filter(sku => sku.inventory !== null)
    .map(sku => ({
      product_id: sku.id,
      warehouse_location: sku.inventory!.warehouse_location,
      on_hand_qty: sku.inventory!.on_hand_qty,
      allocated_qty: sku.inventory!.allocated_qty
    }));

  // --- DYNAMIC COUNTS FOR SIDEBAR BADGES ---
  const lowStockAlertCount = products.filter(
    sku => sku.inventory && sku.inventory.atp <= sku.reorder_point
  ).length;

  const countByCategory = (cat: DeliveryCategory, statuses: string[]) =>
    deliveryRecords.filter(r => r.category === cat && statuses.includes(r.status)).length;

  const deliveriesActiveCount = countByCategory('Deliveries', ['Scheduled', 'Pending']);
  const rmaActiveCount = countByCategory('RMA', ['Scheduled', 'Pending', 'On-Hold']);
  const accountingActiveCount = countByCategory('Accounting Collection', ['Scheduled', 'Pending']);
  const procurementActiveCount = countByCategory('Procurement Pick-up', ['Scheduled', 'Pending']);
  const salesOrdersActiveCount = countByCategory('Sales Orders', ['Scheduled', 'Pending']);

  // --- DYNAMICALLY RENDERED VIEW ROUTING ---
  const renderScreen = () => {
    // Accounting Collection — TASS (verify), Sales Coordinator (read-only), Admin/Logistics (full)
    if (currentScreen === 'accounting_collection') {
      return (
        <AccountingCollectionView
          records={deliveryRecords.filter(r => r.category === 'Accounting Collection')}
          companies={companies}
          currentUserRole={currentUserRole}
          currentUserName={currentUser.name}
          onCreateRecord={handleCreateRecord}
          onUpdateRecord={handleUpdateRecord}
          onVerifyCollection={handleVerifyCollection}
          selectedRecordIdFromDashboard={selectedRecordId}
          clearSelectedRecordId={() => setSelectedRecordId(null)}
        />
      );
    }

    if (CATEGORY_SCREENS[currentScreen]) {
      const category = CATEGORY_SCREENS[currentScreen];
      const titleMap: Record<string, { title: string; subtitle: string }> = {
        'Deliveries': { title: 'Deliveries (Delivery Scheduling)', subtitle: 'Schedule and track outbound deliveries to merchant customers.' },
        'RMA': { title: 'RMA (Returns / Pull-out)', subtitle: 'Manage returns, defective unit pull-outs, and replacement drop-offs.' },
        'Accounting Collection': { title: 'Accounting Collection', subtitle: 'Track billing statement and payment collection runs.' },
        'Procurement Pick-up': { title: 'Procurement Pick-up', subtitle: 'Track supplier pick-up runs feeding inbound stock.' },
        'Sales Orders': { title: 'Sales Orders', subtitle: 'B2B merchant sales orders queued for fulfillment.' }
      };
      const baseMeta = titleMap[category];
      const meta = (category === 'RMA' && currentUserRole === 'Logistics')
        ? { title: 'TASS (Returns / Pull-out)', subtitle: 'View returns and pull-out records (read-only — driver assignment not available for Logistics on this screen).' }
        : baseMeta;
      return (
        <DeliveryRecordsView
          category={category}
          title={meta.title}
          subtitle={meta.subtitle}
          records={deliveryRecords}
          companies={companies}
          currentUserRole={currentUserRole}
          currentUserName={currentUser.name}
          onCreateRecord={handleCreateRecord}
          onUpdateRecord={handleUpdateRecord}
          onVerifyCollection={handleVerifyCollection}
          outputActionConfigs={outputActionConfigs}
          onUpdateOutputActionConfig={handleUpdateOutputActionConfig}
          selectedRecordIdFromDashboard={selectedRecordId}
          clearSelectedRecordId={() => setSelectedRecordId(null)}
          onRefresh={refreshData}
        />
      );
    }

    switch (currentScreen) {
      case 'dashboard':
        return (
          <DashboardView
            products={legacyProducts}
            inventory={legacyInventory}
            deliveryRecords={deliveryRecords}
            dashboardStats={dashboardStats}
            onNavigate={handleNavigate}
            currentUserRole={currentUserRole}
            onRefresh={refreshData}
          />
        );
      case 'inventory':
        return (
          <InventoryView
            skus={products}
            currentUserRole={currentUserRole}
            currentUserName={currentUser.name}
            onRefresh={refreshData}
            selectedProductIdFromDashboard={selectedProductId}
            clearSelectedProductId={() => setSelectedProductId(null)}
          />
        );
      case 'driver':
        return (
          <DriverView
            records={deliveryRecords}
            onUpdateRecord={handleUpdateRecord}
            currentUserName={currentUser.name}
            outputActionConfigs={outputActionConfigs}
            onNavigate={handleNavigate}
          />
        );
      case 'driver_manager':
        return (
          <DriverManagerView
            drivers={managedDrivers}
            currentUserRole={currentUserRole}
            currentUserName={currentUser.name}
            onCreateDriver={handleCreateDriver}
            onUpdateDriver={handleUpdateDriver}
            onDeleteDriver={handleDeleteDriver}
          />
        );
      case 'suppliers':
        return (
          <SuppliersView
            suppliers={suppliers as unknown as Supplier[]}
            deliveryRecords={deliveryRecords}
            currentUserRole={currentUserRole}
            currentUserName={currentUser.name}
            onCreateSupplier={handleCreateSupplier}
          />
        );
      case 'customers':
        return (
          <CustomersView
            customers={customers as unknown as Customer[]}
            deliveryRecords={deliveryRecords}
            currentUserRole={currentUserRole}
            currentUserName={currentUser.name}
            onNavigate={handleNavigate}
            onCreateCustomer={handleCreateCustomer}
          />
        );
      case 'transactions':
        return (
          <TransactionCenter
            currentUserRole={currentUserRole}
            currentUserName={currentUser.name}
          />
        );
      case 'admin':
        return <AdminPanel />;
      case 'main':
        return (
          <MainView
            records={deliveryRecords}
            currentUserRole={currentUserRole}
            currentUserName={currentUser.name}
            onNavigate={handleNavigate}
            companies={companies}
            onCreateRecord={handleCreateRecord}
            effectiveScreens={effectiveScreens}
          />
        );
      case 'data_sampler':
        return (
          <DataSamplerView
            companies={companies}
            currentUserName={currentUser.name}
            onRefresh={refreshData}
          />
        );
      case 'calendar':
        return (
          <DeliveryCalendar
            records={deliveryRecords}
            onNavigate={handleNavigate}
          />
        );
      case 'driver_board':
        return (
          <DriverBoard
            records={deliveryRecords}
            onNavigate={handleNavigate}
            onUpdateRecord={handleUpdateRecord}
            currentUserName={currentUser.name}
          />
        );
      case 'status_history':
        return <StatusHistoryView />;
      case 'statistical_reports':
        return <StatisticalReportView currentUserName={currentUser.name} currentUserRole={currentUserRole} />;
      case 'am_directory':
        if (!canAccess('am_directory')) {
          return (
            <div className="flex flex-col items-center justify-center py-24 text-center space-y-3">
              <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center">
                <Lock className="w-6 h-6 text-red-400" />
              </div>
              <h2 className="text-base font-bold text-slate-700">Access Denied</h2>
              <p className="text-xs text-slate-400 max-w-xs">AM Directory is not available for your role. Contact your administrator if you need access.</p>
            </div>
          );
        }
        return (
          <AccountManagerDirectory
            records={deliveryRecords}
            onNavigate={handleNavigate}
          />
        );
      default:
        return <div className="text-center py-12">View Not Found</div>;
    }
  };

  const navItemClass = (screen: string) =>
    `w-full px-4 py-2 flex items-center transition-all cursor-pointer ${
      isSidebarCollapsed ? 'justify-center' : 'justify-between'
    } ${
      currentScreen === screen
        ? 'text-white bg-white/10 border-r-4 border-[#0078C1]'
        : 'text-white/70 hover:text-white hover:bg-white/5'
    }`;

  // --- LOGIN GATE: while the initial /api/auth/me check is in flight, render
  // --- nothing (avoids a login-screen flash for an already-authenticated
  // --- session); once checked, show the real login screen or the app shell. ---
  if (!authChecked) {
    return <div className="min-h-screen bg-[#F8F9FB]" id="auth-check-loading" />;
  }
  if (!authUser) {
    return <LoginView onLoggedIn={setAuthUser} />;
  }

  // Driver role gets a standalone mobile-first dashboard — no sidebar/header shell.
  if (authUser.role === 'DRIVER') {
    return (
      <DriverDashboard
        records={deliveryRecords}
        currentUserName={currentUser.name}
        onUpdateRecord={handleUpdateRecord}
        onLogout={handleLogout}
        dataLoading={dataLoading}
      />
    );
  }

  return (
    <div className="flex h-screen bg-[#F8F9FB] font-sans text-slate-800 overflow-hidden" id="app-root">
      <GlobalSearch
        isOpen={searchOpen}
        onClose={() => setSearchOpen(false)}
        deliveryRecords={deliveryRecords}
        products={products}
        onNavigate={handleNavigate}
      />

      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-40 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
          id="mobile-sidebar-backdrop"
        />
      )}

      {/* 1. LEFT SIDEBAR */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 bg-[#1F3864] text-white flex flex-col justify-between transition-all duration-300 lg:static lg:translate-x-0 lg:z-auto shrink-0 ${
          isSidebarCollapsed ? 'lg:w-28' : 'lg:w-56'
        } ${
          isSidebarOpen ? 'w-64 translate-x-0' : 'w-64 -translate-x-full lg:translate-x-0'
        }`}
        id="sidebar-panel"
      >
        {/* Brand Header */}
        <div className="p-4 border-b border-white/10 relative">
          <button
            onClick={() => setIsSidebarOpen(false)}
            className="absolute top-4 right-4 lg:hidden p-1 bg-white/10 hover:bg-white/20 text-white rounded transition-colors cursor-pointer"
            id="close-sidebar-button"
            title="Close menu"
          >
            <X className="w-5 h-5" />
          </button>

          {isSidebarCollapsed ? (
            <div className="flex flex-col items-center gap-3">
              <button
                onClick={() => setIsSidebarCollapsed(false)}
                className="hidden lg:flex p-1.5 bg-white/10 hover:bg-white/20 text-white rounded transition-colors cursor-pointer"
                id="expand-sidebar-button"
                title="Expand menu"
              >
                <Menu className="w-5 h-5" />
              </button>

              <div className="w-full px-1 flex items-center justify-center" title="Microgenesis">
                <img src="/microgenesis_logo_white.png" alt="Microgenesis" className="w-full h-auto max-h-14 object-contain" />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <button
                  onClick={() => setIsSidebarCollapsed(true)}
                  className="hidden lg:flex p-1.5 bg-white/10 hover:bg-white/20 text-white rounded transition-colors cursor-pointer"
                  id="collapse-sidebar-button"
                  title="Collapse menu"
                >
                  <Menu className="w-5 h-5" />
                </button>
              </div>

              {/* Logo asset is the white/light variant (brand-assets/Microgenesis
                  Logo.png) with a genuinely transparent background — verified via
                  the PNG's alpha channel, so no wrapper background or blend-mode
                  hack is needed here. If a future export of this asset ever bakes
                  in an opaque white background, add `mix-blend-mode: multiply`
                  (or swap back to a dark-on-transparent variant) rather than
                  reintroducing a white box. */}
              <div className="w-full max-h-14 flex items-center">
                <img src="/microgenesis_logo_white.png" alt="Microgenesis - Making It Easy For You!" className="w-full h-auto max-h-14 object-contain" />
              </div>
            </div>
          )}
        </div>

        {/* Navigation Items - exactly the 9 confirmed sidebar categories, in order */}
        <nav className="flex-1 py-3 space-y-4 overflow-y-auto" id="sidebar-nav">

          {/* 0. Main */}
          <div className="space-y-1">
            <button onClick={() => handleNavigate('main')} title={isSidebarCollapsed ? 'Main' : ''} className={navItemClass('main')}>
              <span className={`flex items-center ${isSidebarCollapsed ? '' : 'space-x-3'}`}>
                <LayoutGrid className="w-5 h-5 shrink-0" />
                {!isSidebarCollapsed && <span className="text-xs font-medium truncate">Main</span>}
              </span>
            </button>
          </div>

          {/* 1. Dashboard */}
          <div className="space-y-1">
            <button onClick={() => handleNavigate('dashboard')} title={isSidebarCollapsed ? 'Dashboard' : ''} className={navItemClass('dashboard')}>
              <span className={`flex items-center ${isSidebarCollapsed ? '' : 'space-x-3'}`}>
                <LayoutDashboard className="w-5 h-5 shrink-0" />
                {!isSidebarCollapsed && <span className="text-xs font-medium truncate">Dashboard</span>}
              </span>
            </button>
          </div>

          <div className="space-y-1">
            {!isSidebarCollapsed ? (
              <span className="text-[10px] uppercase tracking-wider text-white/40 font-bold px-4 block">Operations</span>
            ) : (
              <div className="border-t border-white/10 my-2 mx-3" />
            )}

            {/* 2. Deliveries */}
            {canAccess('deliveries') && (
            <button onClick={() => handleNavigate('deliveries')} title={isSidebarCollapsed ? 'Deliveries' : ''} className={navItemClass('deliveries')}>
              <span className={`flex items-center ${isSidebarCollapsed ? '' : 'space-x-3'}`}>
                <Truck className="w-5 h-5 shrink-0" />
                {!isSidebarCollapsed && <span className="text-xs font-medium truncate">Deliveries</span>}
              </span>
              {deliveriesActiveCount > 0 && (
                isSidebarCollapsed
                  ? <span className="absolute top-1.5 right-3 w-2 h-2 bg-[#0078C1] rounded-full animate-pulse" />
                  : <span className="bg-[#0078C1] text-white font-bold text-[9px] px-1.5 py-0.5 rounded-full">{deliveriesActiveCount}</span>
              )}
            </button>
            )}

            {/* 3. RMA */}
            {canAccess('rma') && (
            <button onClick={() => handleNavigate('rma')} title={isSidebarCollapsed ? (currentUserRole === 'Logistics' ? 'TASS' : 'RMA') : ''} className={navItemClass('rma')}>
              <span className={`flex items-center ${isSidebarCollapsed ? '' : 'space-x-3'}`}>
                <RotateCcw className="w-5 h-5 shrink-0" />
                {!isSidebarCollapsed && <span className="text-xs font-medium truncate">{currentUserRole === 'Logistics' ? 'TASS' : 'RMA'}</span>}
              </span>
              {rmaActiveCount > 0 && (
                isSidebarCollapsed
                  ? <span className="absolute top-1.5 right-3 w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
                  : <span className="bg-amber-500 text-white font-bold text-[9px] px-1.5 py-0.5 rounded-full">{rmaActiveCount}</span>
              )}
            </button>
            )}

            {/* 4. Accounting Collection */}
            {canAccess('accounting_collection') && (
            <button onClick={() => handleNavigate('accounting_collection')} title={isSidebarCollapsed ? 'Accounting Collection' : ''} className={navItemClass('accounting_collection')}>
              <span className={`flex items-center ${isSidebarCollapsed ? '' : 'space-x-3'}`}>
                <Banknote className="w-5 h-5 shrink-0" />
                {!isSidebarCollapsed && <span className="text-xs font-medium truncate">Accounting Collection</span>}
              </span>
              {accountingActiveCount > 0 && (
                isSidebarCollapsed
                  ? <span className="absolute top-1.5 right-3 w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                  : <span className="bg-green-500 text-white font-bold text-[9px] px-1.5 py-0.5 rounded-full">{accountingActiveCount}</span>
              )}
            </button>
            )}

            {/* 5. Procurement Pick-up */}
            {canAccess('procurement_pickup') && (
            <button onClick={() => handleNavigate('procurement_pickup')} title={isSidebarCollapsed ? 'Procurement Pick-up' : ''} className={navItemClass('procurement_pickup')}>
              <span className={`flex items-center ${isSidebarCollapsed ? '' : 'space-x-3'}`}>
                <PackageSearch className="w-5 h-5 shrink-0" />
                {!isSidebarCollapsed && <span className="text-xs font-medium truncate">Procurement Pick-up</span>}
              </span>
              {procurementActiveCount > 0 && (
                isSidebarCollapsed
                  ? <span className="absolute top-1.5 right-3 w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
                  : <span className="bg-blue-400 text-white font-bold text-[9px] px-1.5 py-0.5 rounded-full">{procurementActiveCount}</span>
              )}
            </button>
            )}

            {/* 6. Sales Orders */}
            {canAccess('sales_orders') && (
            <button onClick={() => handleNavigate('sales_orders')} title={isSidebarCollapsed ? 'Sales Orders' : ''} className={navItemClass('sales_orders')}>
              <span className={`flex items-center ${isSidebarCollapsed ? '' : 'space-x-3'}`}>
                <ShoppingCart className="w-5 h-5 shrink-0" />
                {!isSidebarCollapsed && <span className="text-xs font-medium truncate">Sales Orders</span>}
              </span>
              {salesOrdersActiveCount > 0 && (
                isSidebarCollapsed
                  ? <span className="absolute top-1.5 right-3 w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                  : <span className="bg-emerald-400 text-white font-bold text-[9px] px-1.5 py-0.5 rounded-full">{salesOrdersActiveCount}</span>
              )}
            </button>
            )}
          </div>

          <div className="space-y-1">
            {!isSidebarCollapsed ? (
              <span className="text-[10px] uppercase tracking-wider text-white/40 font-bold px-4 block">Directory</span>
            ) : (
              <div className="border-t border-white/10 my-2 mx-3" />
            )}

            {/* 7. Customers */}
            <button onClick={() => handleNavigate('customers')} title={isSidebarCollapsed ? 'Customers' : ''} className={navItemClass('customers')}>
              <span className={`flex items-center ${isSidebarCollapsed ? '' : 'space-x-3'}`}>
                <Users className="w-5 h-5 shrink-0" />
                {!isSidebarCollapsed && <span className="text-xs font-medium truncate">Customers</span>}
              </span>
            </button>

            {/* Suppliers */}
            <button onClick={() => handleNavigate('suppliers')} title={isSidebarCollapsed ? 'Suppliers' : ''} className={navItemClass('suppliers')}>
              <span className={`flex items-center ${isSidebarCollapsed ? '' : 'space-x-3'}`}>
                <Building2 className="w-5 h-5 shrink-0" />
                {!isSidebarCollapsed && <span className="text-xs font-medium truncate">Suppliers</span>}
              </span>
            </button>

            {/* 8. Driver View — Logistics + Admin */}
            {canAccess('driver') && (
              <button onClick={() => handleNavigate('driver')} title={isSidebarCollapsed ? 'Driver View' : ''} className={navItemClass('driver')}>
                <span className={`flex items-center ${isSidebarCollapsed ? '' : 'space-x-3'}`}>
                  <Smartphone className="w-5 h-5 shrink-0" />
                  {!isSidebarCollapsed && <span className="text-xs font-medium truncate">Driver View</span>}
                </span>
              </button>
            )}

            {/* Driver Manager — Logistics + Admin */}
            {canAccess('driver_manager') && (
              <button onClick={() => handleNavigate('driver_manager')} title={isSidebarCollapsed ? 'Driver Manager' : ''} className={navItemClass('driver_manager')}>
                <span className={`flex items-center ${isSidebarCollapsed ? '' : 'space-x-3'}`}>
                  <UsersRound className="w-5 h-5 shrink-0" />
                  {!isSidebarCollapsed && <span className="text-xs font-medium truncate">Driver Manager</span>}
                </span>
              </button>
            )}

            {/* Admin Panel - visible to Admin role only */}
            {currentUserRole === 'Admin' && (
              <button onClick={() => handleNavigate('admin')} title={isSidebarCollapsed ? 'Admin Panel' : ''} className={navItemClass('admin')}>
                <span className={`flex items-center ${isSidebarCollapsed ? '' : 'space-x-3'}`}>
                  <ShieldAlert className="w-5 h-5 shrink-0" />
                  {!isSidebarCollapsed && <span className="text-xs font-medium truncate">Admin Panel</span>}
                </span>
              </button>
            )}

            {/* Delivery Calendar — Logistics + Admin */}
            {(currentUserRole === 'Logistics' || currentUserRole === 'Admin') && (
              <button onClick={() => handleNavigate('calendar')} title={isSidebarCollapsed ? 'Delivery Calendar' : ''} className={navItemClass('calendar')}>
                <span className={`flex items-center ${isSidebarCollapsed ? '' : 'space-x-3'}`}>
                  <Calendar className="w-5 h-5 shrink-0" />
                  {!isSidebarCollapsed && <span className="text-xs font-medium truncate">Delivery Calendar</span>}
                </span>
              </button>
            )}

            {/* Driver Board — Logistics + Admin */}
            {(currentUserRole === 'Logistics' || currentUserRole === 'Admin') && (
              <button onClick={() => handleNavigate('driver_board')} title={isSidebarCollapsed ? 'Driver Board' : ''} className={navItemClass('driver_board')}>
                <span className={`flex items-center ${isSidebarCollapsed ? '' : 'space-x-3'}`}>
                  <KanbanSquare className="w-5 h-5 shrink-0" />
                  {!isSidebarCollapsed && <span className="text-xs font-medium truncate">Driver Board</span>}
                </span>
              </button>
            )}

            {/* Status History — Logistics + Admin */}
            {canAccess('status_history') && (
              <button onClick={() => handleNavigate('status_history')} title={isSidebarCollapsed ? 'Status History' : ''} className={navItemClass('status_history')}>
                <span className={`flex items-center ${isSidebarCollapsed ? '' : 'space-x-3'}`}>
                  <History className="w-5 h-5 shrink-0" />
                  {!isSidebarCollapsed && <span className="text-xs font-medium truncate">Status History</span>}
                </span>
              </button>
            )}

            {/* Statistical Reports — Logistics + Admin */}
            {canAccess('statistical_reports') && (
              <button onClick={() => handleNavigate('statistical_reports')} title={isSidebarCollapsed ? 'Reports' : ''} className={navItemClass('statistical_reports')}>
                <span className={`flex items-center ${isSidebarCollapsed ? '' : 'space-x-3'}`}>
                  <BarChart2 className="w-5 h-5 shrink-0" />
                  {!isSidebarCollapsed && <span className="text-xs font-medium truncate">Reports</span>}
                </span>
              </button>
            )}

            {/* Account Manager Directory — Sales Coordinator + Admin only */}
            {canAccess('am_directory') && (
            <button onClick={() => handleNavigate('am_directory')} title={isSidebarCollapsed ? 'AM Directory' : ''} className={navItemClass('am_directory')}>
              <span className={`flex items-center ${isSidebarCollapsed ? '' : 'space-x-3'}`}>
                <UsersRound className="w-5 h-5 shrink-0" />
                {!isSidebarCollapsed && <span className="text-xs font-medium truncate">AM Directory</span>}
              </span>
            </button>
            )}

            {/* Transaction Center */}
            <button onClick={() => handleNavigate('transactions')} title={isSidebarCollapsed ? 'Transaction Center' : ''} className={navItemClass('transactions')}>
              <span className={`flex items-center ${isSidebarCollapsed ? '' : 'space-x-3'}`}>
                <ArrowRightLeft className="w-5 h-5 shrink-0" />
                {!isSidebarCollapsed && <span className="text-xs font-medium truncate">Transaction Center</span>}
              </span>
            </button>

            {/* 9. SKU Master */}
            <button onClick={() => handleNavigate('inventory')} title={isSidebarCollapsed ? 'SKU Master' : ''} className={navItemClass('inventory')}>
              <span className={`flex items-center ${isSidebarCollapsed ? '' : 'space-x-3'}`}>
                <Package className="w-5 h-5 shrink-0" />
                {!isSidebarCollapsed && <span className="text-xs font-medium truncate">SKU Master</span>}
              </span>
              {lowStockAlertCount > 0 && (
                isSidebarCollapsed
                  ? <span className="absolute top-1.5 right-3 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                  : <span className="bg-red-500 text-white font-bold text-[9px] px-1.5 py-0.5 rounded-full animate-pulse">{lowStockAlertCount}</span>
              )}
            </button>
          </div>

          {/* 10. Tools — Admin only */}
          {currentUserRole === 'Admin' && (
            <div className="space-y-1">
              {!isSidebarCollapsed ? (
                <span className="text-[10px] uppercase tracking-wider text-white/40 font-bold px-4 block">Tools</span>
              ) : (
                <div className="border-t border-white/10 my-2 mx-3" />
              )}
              <button
                onClick={() => handleNavigate('data_sampler')}
                title={isSidebarCollapsed ? 'Data Sampler' : ''}
                className={`w-full px-4 py-2 flex items-center transition-all cursor-pointer ${
                  isSidebarCollapsed ? 'justify-center' : 'space-x-3'
                } ${
                  currentScreen === 'data_sampler'
                    ? 'text-white bg-white/20 border-r-4 border-violet-400 font-bold'
                    : 'text-violet-300 hover:text-white hover:bg-white/5 border-r-4 border-violet-500/20'
                }`}
              >
                <Shuffle className="w-5 h-5 shrink-0 text-violet-400" />
                {!isSidebarCollapsed && <span className="text-xs truncate font-medium">Data Sampler</span>}
              </button>
            </div>
          )}
        </nav>

        {/* User Profile + Role Scope Banner */}
        <div className="px-4 pt-2 pb-4 space-y-2">
          {/* Role scope info — collapsed shows tooltip only */}
          {!isSidebarCollapsed && (
            <div className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 space-y-1">
              <p className="text-[9px] font-black text-white/40 uppercase tracking-widest">Your Access Scope</p>
              <p className="text-[10px] text-white/70 leading-snug">
                {currentUserRole === 'Sales Coordinator' && 'Create & track records across all modules. Read-only on RMA and Accounting Collection.'}
                {currentUserRole === 'Logistics' && 'Assign drivers, update statuses, manage dispatch board and delivery calendar.'}
                {currentUserRole === 'TASS' && 'View and verify Accounting Collection records; view RMA records only.'}
                {currentUserRole === 'Admin' && 'Full access to all modules, users, and audit logs.'}
              </p>
              {currentUserRole !== 'Admin' && (
                <button
                  onClick={() => { setAccessRequestScreen(''); setAccessRequestOpen(true); }}
                  className="text-[9px] text-[#0078C1] hover:text-white font-bold uppercase tracking-wider mt-1 flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <Lock className="w-2.5 h-2.5" /> Request temporary access
                </button>
              )}
            </div>
          )}
          <div className="bg-white/5 rounded-lg p-2">
            <div className={`flex items-center ${isSidebarCollapsed ? 'justify-center' : 'space-x-3'}`}>
              <div className="w-8 h-8 rounded bg-[#0078C1] flex items-center justify-center font-bold text-white text-xs shrink-0" title={`${currentUser.name} (${currentUserRole})`}>
                {currentUser.initials}
              </div>
              {!isSidebarCollapsed && (
                <div className="overflow-hidden">
                  <p className="text-xs text-white truncate font-medium">{currentUser.name}</p>
                  <p className="text-[9.5px] text-white/50 truncate font-semibold uppercase tracking-wider">{currentUserRole}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </aside>

      {/* Access Request Modal */}
      {accessRequestOpen && (
        <div className="fixed inset-0 z-[70] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center px-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md p-6 space-y-4">
            {accessRequestSent ? (
              <div className="flex flex-col items-center justify-center py-6 gap-3 text-center">
                <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center">
                  <Send className="w-5 h-5 text-emerald-600" />
                </div>
                <p className="text-sm font-bold text-slate-800">Request Sent</p>
                <p className="text-xs text-slate-500">Your admin has been notified.</p>
              </div>
            ) : (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
                      <Lock className="w-4 h-4 text-amber-600" />
                    </div>
                    <div>
                      <h3 className="text-sm font-black text-slate-800">Request Temporary Access</h3>
                      <p className="text-[11px] text-slate-500">
                        {accessRequestScreen ? `For: ${accessRequestScreen}` : 'Submit to your system administrator'}
                      </p>
                    </div>
                  </div>
                  <button onClick={() => setAccessRequestOpen(false)} className="p-1 hover:bg-slate-100 rounded text-slate-400 cursor-pointer">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-start gap-2">
                  <Info className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-amber-700">
                    Your current role is <strong>{currentUserRole}</strong>. Access changes are subject to admin approval and may be time-limited.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">Module / Screen Needed</label>
                  <input
                    type="text"
                    value={accessRequestScreen}
                    onChange={e => setAccessRequestScreen(e.target.value)}
                    placeholder="e.g. RMA, Deliveries, Admin Panel…"
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#0078C1]/30 focus:border-[#0078C1]"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">Reason for Request</label>
                  <textarea
                    value={accessRequestNote}
                    onChange={e => setAccessRequestNote(e.target.value)}
                    placeholder="Briefly explain why you need access to this module…"
                    rows={3}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs resize-none focus:outline-none focus:ring-2 focus:ring-[#0078C1]/30 focus:border-[#0078C1]"
                  />
                </div>

                <div className="flex items-center gap-2 justify-end">
                  <button
                    onClick={() => setAccessRequestOpen(false)}
                    className="px-4 py-2 text-xs font-semibold text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAccessRequest}
                    disabled={!accessRequestScreen.trim() || !accessRequestNote.trim()}
                    className="px-4 py-2 text-xs font-bold text-white bg-[#1F3864] hover:bg-[#0078C1] rounded-lg transition-colors cursor-pointer disabled:opacity-40"
                  >
                    Submit Request
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* 2. MAIN APPLICATION CONTENT AREA */}
      <div className="flex-1 flex flex-col min-w-0" id="main-content-area">
        <header className="h-16 bg-white border-b border-slate-200 px-4 lg:px-8 flex items-center justify-between shrink-0" id="global-header">
          <div className="flex items-center gap-3 text-sm">
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="lg:hidden p-1.5 -ml-1 text-slate-600 hover:text-[#0078C1] hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              id="mobile-sidebar-toggle"
              title="Open navigation menu"
            >
              <Menu className="w-5 h-5" />
            </button>

            <span className="text-slate-400 hidden sm:inline">Main System</span>
            <span className="text-slate-300 hidden sm:inline">/</span>
            <span className="font-semibold text-slate-800 uppercase tracking-tight text-xs">
              {currentScreen === 'dashboard' ? 'Command Dashboard' : currentScreen === 'main' ? 'Main' : currentScreen.replace(/_/g, ' ')}
            </span>
            <div className="hidden md:flex items-center gap-1.5 bg-green-50 border border-green-100 text-green-700 px-2 py-0.5 rounded-full text-[10px] font-medium">
              <span className="w-1 h-1 rounded-full bg-green-500 animate-pulse" />
              <span>Manila Hub-01</span>
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs text-slate-500">
            <div className="flex items-center gap-1 bg-slate-100 border border-slate-200 rounded-lg p-1" id="accessibility-zoom-controls">
              <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider px-1 hidden lg:inline">Text Size</span>
              <button
                onClick={() => setZoomFactor(prev => Math.max(90, prev - 5))}
                disabled={zoomFactor <= 90}
                className="p-1 hover:bg-white rounded text-slate-600 hover:text-slate-900 disabled:opacity-40 transition-colors cursor-pointer flex items-center justify-center border border-transparent hover:border-slate-200"
                title="Decrease font size"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="px-1.5 text-[10px] font-bold text-slate-700 min-w-[36px] text-center">{zoomFactor}%</span>
              <button
                onClick={() => setZoomFactor(prev => Math.min(220, prev + 5))}
                disabled={zoomFactor >= 220}
                className="p-1 hover:bg-white rounded text-slate-600 hover:text-slate-900 disabled:opacity-40 transition-colors cursor-pointer flex items-center justify-center border border-transparent hover:border-slate-200"
                title="Increase font size"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
            </div>

            <span className="hidden md:flex items-center gap-1.5 font-bold text-slate-500 text-[10.5px] uppercase tracking-wide">
              <Clock className="w-3.5 h-3.5 text-slate-400" /> {new Date().toISOString().split('T')[0]}
            </span>
            <div className="flex items-center gap-1.5 bg-slate-100 border border-slate-200 rounded-lg px-2.5 py-1" id="header-current-user" title="Signed in as">
              <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider hidden sm:inline">Signed in</span>
              <span className="text-slate-700 font-bold text-[10px] uppercase">{currentUser.name} &middot; {currentUserRole}</span>
            </div>

            <button
              onClick={() => setSearchOpen(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-500 hover:text-slate-700 rounded-lg transition-colors cursor-pointer text-[10px] font-bold"
              title="Global search (Ctrl+K)"
              id="global-search-button"
            >
              <Search className="w-3.5 h-3.5" />
              <span className="hidden lg:inline">Search</span>
              <kbd className="hidden lg:inline bg-slate-200 border border-slate-300 px-1 rounded text-[9px]">Ctrl K</kbd>
            </button>
            <NotificationBell onNavigate={handleNavigate} deliveryRecords={deliveryRecords} />

            <button
              onClick={handleResetDemoData}
              disabled={resetting}
              className="p-1.5 bg-slate-100 hover:bg-red-50 border border-slate-200 hover:border-red-200 text-slate-500 hover:text-red-600 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
              id="reset-demo-data-button"
              title="Reset all data back to the original demo seed data (dev only)"
            >
              {resetting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCw className="w-3.5 h-3.5" />}
            </button>

            <button
              onClick={handleLogout}
              className="p-1.5 bg-slate-100 hover:bg-red-50 border border-slate-200 hover:border-red-200 text-slate-500 hover:text-red-600 rounded-lg transition-colors cursor-pointer"
              id="logout-button"
              title="Log out"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </header>

        {dataError && (
          <div className="bg-red-50 border-b border-red-200 text-red-700 text-[11px] font-semibold px-6 py-1.5 flex items-center gap-2" id="data-error-banner">
            <AlertTriangle className="w-3.5 h-3.5" /> {dataError}
          </div>
        )}

        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 bg-[#F8F9FB]" id="main-routed-view">
          {renderScreen()}
        </main>
      </div>
    </div>
  );
}
