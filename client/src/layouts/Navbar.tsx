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
import AccountMenu from './AccountMenu';

export interface NavbarProps {
  currentScreen: string;
  setIsSidebarOpen: (open: boolean) => void;
  currentUser: { name: string; initials: string };
  currentUserRole: string;
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
        className="h-16 bg-white border-b border-slate-200 px-4 lg:px-8 flex items-center justify-between shrink-0"
        id="global-header"
      >
        <div className="flex min-w-0 items-center gap-3 text-sm">
          <button
            onClick={() => setIsSidebarOpen(true)}
            className="lg:hidden p-1.5 -ml-1 text-slate-600 hover:text-[#0078C1] hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            id="mobile-sidebar-toggle"
            title="Open navigation menu"
          >
            <Menu className="w-5 h-5" />
          </button>

          <span className="truncate font-semibold text-slate-800 uppercase tracking-tight text-xs">
            {currentScreen === "dashboard"
              ? "Command Dashboard"
              : currentScreen === "main"
                ? "Main"
                : currentScreen.replace(/_/g, " ")}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-4 text-xs text-slate-500">
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="p-2 text-slate-500 hover:text-[#0078C1] hover:bg-slate-100 rounded-lg transition-colors cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
            aria-label="Search"
            aria-haspopup="dialog"
            title="Global search (Ctrl+K)"
            id="global-search-button"
          >
            <Search className="w-4 h-4" aria-hidden="true" />
          </button>
          <NotificationBell
            onNavigate={handleNavigate}
            deliveryRecords={deliveryRecords}
          />

          {canReset && (
            <button
              onClick={() => {
                setResetError(null);
                setResetOpen(true);
              }}
              disabled={resetting}
              className="p-1.5 bg-slate-100 hover:bg-red-50 border border-slate-200 hover:border-red-200 text-slate-500 hover:text-red-600 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
              id="reset-demo-data-button"
              title="Reset all data back to the original demo seed data (dev only)"
            >
              {resetting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RotateCw className="w-3.5 h-3.5" />
              )}
            </button>
          )}

          <AccountMenu name={currentUser.name} role={currentUserRole} onLogout={handleLogout} />
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
