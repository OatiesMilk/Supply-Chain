import { manilaToday } from "@/utils/recordLifecycle";
import React, { useState, useEffect } from "react";
import {
  Menu,
  ZoomIn,
  ZoomOut,
  Clock,
  Search,
  RotateCw,
  LogOut,
  Loader2,
} from "lucide-react";
import { NotificationBell } from "@/components";
import { api } from "@/api";
import { ActionDialog } from "@/components/ActionDialog";
import { DeliveryRecord } from "@/types";

export interface NavbarProps {
  currentScreen: string;
  setIsSidebarOpen: (open: boolean) => void;
  zoomFactor: number;
  setZoomFactor: React.Dispatch<React.SetStateAction<number>>;
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
  zoomFactor,
  setZoomFactor,
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
        className="min-h-16 flex-wrap gap-2 py-2 bg-white border-b border-slate-200 px-4 lg:px-8 flex items-center justify-between shrink-0"
        id="global-header"
      >
        <div className="flex items-center gap-3 text-sm">
          <button
            onClick={() => setIsSidebarOpen(true)}
            className="min-h-11 min-w-11 inline-flex items-center justify-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-700 lg:hidden p-1.5 -ml-1 text-slate-600 hover:text-[#0078C1] hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            id="mobile-sidebar-toggle"
            aria-label="Open navigation menu"
            title="Open navigation menu"
          >
            <Menu className="w-5 h-5" />
          </button>

          <span className="font-semibold text-slate-800 uppercase tracking-tight text-xs">
            {currentScreen === "dashboard"
              ? "Command Dashboard"
              : currentScreen === "main"
                ? "Main"
                : currentScreen.replace(/_/g, " ")}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1 sm:gap-2 text-xs text-slate-500">
          <div
            className="flex items-center gap-1 bg-slate-100 border border-slate-200 rounded-lg p-1"
            id="accessibility-zoom-controls"
          >
            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider px-1 hidden lg:inline">
              Text Size
            </span>
            <button
              onClick={() => setZoomFactor((prev) => Math.max(90, prev - 5))}
              disabled={zoomFactor <= 90}
              className="min-h-11 min-w-11 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-700 p-1 hover:bg-white rounded text-slate-600 hover:text-slate-900 disabled:opacity-40 transition-colors cursor-pointer flex items-center justify-center border border-transparent hover:border-slate-200"
              aria-label="Decrease font size"
              title="Decrease font size"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="px-1.5 text-[10px] font-bold text-slate-700 min-w-[36px] text-center">
              {zoomFactor}%
            </span>
            <button
              onClick={() => setZoomFactor((prev) => Math.min(220, prev + 5))}
              disabled={zoomFactor >= 220}
              className="min-h-11 min-w-11 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-700 p-1 hover:bg-white rounded text-slate-600 hover:text-slate-900 disabled:opacity-40 transition-colors cursor-pointer flex items-center justify-center border border-transparent hover:border-slate-200"
              aria-label="Increase font size"
              title="Increase font size"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            onClick={() => setSearchOpen(true)}
            className="min-h-11 min-w-11 justify-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-700 flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-500 hover:text-slate-700 rounded-lg transition-colors cursor-pointer text-[10px] font-bold"
            aria-label="Search records and products"
            title="Global search (Ctrl+K)"
            id="global-search-button"
            aria-haspopup="dialog"
          >
            <Search className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">Search</span>
            <kbd className="hidden lg:inline bg-slate-200 border border-slate-300 px-1 rounded text-[9px]">
              Ctrl K
            </kbd>
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
              className="min-h-11 min-w-11 inline-flex items-center justify-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-700 p-1.5 bg-slate-100 hover:bg-red-50 border border-slate-200 hover:border-red-200 text-slate-500 hover:text-red-600 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
              id="reset-demo-data-button"
              aria-label="Reset demo data"
              title="Reset all data back to the original demo seed data (dev only)"
            >
              {resetting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RotateCw className="w-3.5 h-3.5" />
              )}
            </button>
          )}

          <button
            onClick={handleLogout}
            className="min-h-11 min-w-11 inline-flex items-center justify-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-700 p-1.5 bg-slate-100 hover:bg-red-50 border border-slate-200 hover:border-red-200 text-slate-500 hover:text-red-600 rounded-lg transition-colors cursor-pointer"
            id="logout-button"
            aria-label="Log out"
            title="Log out"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
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
