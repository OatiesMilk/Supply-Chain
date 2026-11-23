import React, { useState, useEffect } from "react";
import {
  Menu,
  Search,
  RotateCw,
  Loader2,
} from "lucide-react";
import { NotificationBell } from "@/components";
import { api } from "@/api";
import { ActionDialog } from "@/components/ActionDialog";
import { DeliveryRecord } from "@/types";
import { navbarIconButtonClass } from "@/utils/uiClasses";
import AccountMenu from './AccountMenu';

export const SCREEN_TITLES: Record<string, string> = {
  main: "Main",
  dashboard: "Dashboard",
  deliveries: "Deliveries",
  rma: "RMA",
  accounting_collection: "Accounting Collection",
  procurement_pickup: "Procurement Pick-up",
  sales_orders: "Sales Orders",
  customers: "Customers",
  suppliers: "Suppliers",
  driver: "Drivers",
  driver_board: "Drivers · Board",
  driver_manager: "Drivers · Manager",
  driver_dashboard: "Driver Dashboard",
  calendar: "Delivery Calendar",
  transactions: "Transaction Center",
  inventory: "SKU Master",
  am_directory: "Account Manager Directory",
  statistical_reports: "Statistical Reports",
  admin: "Admin Panel",
  data_sampler: "Data Sampler",
};

export function screenTitleFor(screen: string): string {
  return (
    SCREEN_TITLES[screen] ??
    screen
      .replace(/_/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase())
  );
}

export interface NavbarProps {
  currentScreen: string;
  setIsSidebarOpen: (open: boolean) => void;
  currentUser: { name: string; email: string; initials: string };
  currentUserRole: string;
  canManageAdmin: boolean;
  setSearchOpen: (open: boolean) => void;
  deliveryRecords: DeliveryRecord[];
  handleNavigate: (screen: any) => void;
  handleResetDemoData: () => Promise<void>;
  resetting: boolean;
  handleLogout: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentScreen,
  setIsSidebarOpen,
  currentUser,
  currentUserRole,
  canManageAdmin,
  setSearchOpen,
  deliveryRecords,
  handleNavigate,
  handleResetDemoData,
  resetting,
  handleLogout,
}) => {
  const [canReset, setCanReset] = useState(false);
  useEffect(() => {
    let mounted = true;
    if (currentUserRole === "Admin") {
      api
        .canResetDemo()
        .then((result) => {
          if (mounted) setCanReset(result.enabled);
        })
        .catch(() => {
          if (mounted) setCanReset(false);
        });
    }
    return () => {
      mounted = false;
    };
  }, [currentUserRole]);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  const confirmReset = async () => {
    if (resetting) return;
    setResetError(null);
    try {
      await handleResetDemoData();
      setResetOpen(false);
    } catch (error) {
      setResetError(
        error instanceof Error ? error.message : "Could not reset demo data",
      );
    }
  };

  return (
    <>
      <header
        className="h-15 bg-white/95 backdrop-blur-xs border-b border-slate-200/80 px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4 shrink-0"
        id="global-header"
      >
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={() => setIsSidebarOpen(true)}
            className="lg:hidden p-1.5 -ml-1 text-slate-600 hover:text-brand-navy hover:bg-slate-100 rounded-lg transition-colors cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue"
            id="mobile-sidebar-toggle"
            aria-label="Open navigation menu"
            title="Open navigation menu"
          >
            <Menu className="w-5 h-5" />
          </button>

          <span className="truncate text-base font-semibold tracking-tight text-slate-900">
            {screenTitleFor(currentScreen)}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-2 text-xs text-slate-600">
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="inline-flex h-9 w-9 sm:w-auto sm:min-w-[210px] md:min-w-[250px] shrink-0 items-center justify-center sm:justify-between gap-2 rounded-lg border border-slate-200/90 bg-slate-50/70 sm:px-3 text-slate-500 transition-colors hover:border-slate-300 hover:bg-white hover:text-slate-700 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue"
            aria-label="Search"
            aria-haspopup="dialog"
            title="Global search (Ctrl+K)"
            id="global-search-button"
          >
            <span className="flex items-center gap-2">
              <Search className="w-4 h-4 shrink-0 text-slate-400" aria-hidden="true" />
              <span className="hidden sm:inline text-xs font-normal text-slate-500">Search records, companies…</span>
            </span>
            <kbd className="hidden sm:inline-flex items-center rounded border border-slate-200 bg-white px-1.5 py-0.5 text-xs font-medium text-slate-400 shadow-2xs">
              Ctrl K
            </kbd>
          </button>
          <NotificationBell
            onNavigate={handleNavigate}
            deliveryRecords={deliveryRecords}
          />

          {canReset && (
            <button
              type="button"
              onClick={() => {
                setResetError(null);
                setResetOpen(true);
              }}
              disabled={resetting}
              className={`${navbarIconButtonClass} hover:bg-red-50 hover:border-red-200 hover:text-red-600`}
              id="reset-demo-data-button"
              aria-label="Reset demo data"
              title="Reset all data back to the original demo seed data (dev only)"
            >
              {resetting ? (
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              ) : (
                <RotateCw className="w-4 h-4" aria-hidden="true" />
              )}
            </button>
          )}

          <AccountMenu name={currentUser.name} email={currentUser.email} role={currentUserRole}
            canManageAdmin={canManageAdmin} onNavigate={handleNavigate} onLogout={handleLogout} />
        </div>
      </header>
      <ActionDialog
        open={resetOpen}
        title="Reset demo data?"
        description="All Supply Chain Portal data will return to the original demo seed. Every change made on the server will be cleared. This cannot be undone."
        confirmLabel="Reset all data"
        destructive
        pending={resetting}
        error={resetError}
        onConfirm={confirmReset}
        onDismiss={() => {
          setResetOpen(false);
          setResetError(null);
        }}
      />
    </>
  );
};

export default Navbar;
