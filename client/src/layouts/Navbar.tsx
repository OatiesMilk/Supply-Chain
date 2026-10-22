import React, { useState, useEffect } from "react";
import {
  Menu,
  ZoomIn,
  ZoomOut,
  Search,
  RotateCw,
  LogOut,
} from "lucide-react";
import { NotificationBell } from "@/components";
import { api } from "@/api";
import { Button, IconButton } from "@/components/ui";
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
        className="min-h-16 flex-wrap gap-2 bg-white border-b border-slate-200 px-3 py-2 sm:px-4 lg:px-8 flex items-center justify-between shrink-0"
        id="global-header"
      >
        <div className="flex min-w-0 items-center gap-2 text-sm">
          <IconButton label="Open navigation menu"
            onClick={() => setIsSidebarOpen(true)}
            className="lg:hidden"
            id="mobile-sidebar-toggle"
            title="Open navigation menu"
          >
            <Menu aria-hidden="true" className="w-5 h-5" />
          </IconButton>

          <span className="font-semibold text-slate-800 text-sm break-words">
            {currentScreen === "dashboard"
              ? "Command Dashboard"
              : currentScreen === "main"
                ? "Main"
                : currentScreen.replace(/_/g, " ")}
          </span>
        </div>

        <div className="flex max-w-full flex-wrap items-center gap-1 sm:gap-2 text-sm text-slate-600">
          <div
            className="flex items-center gap-1 bg-slate-100 border border-slate-200 rounded-lg p-1"
            id="accessibility-zoom-controls"
          >
            <span className="text-sm font-medium text-slate-600 px-1 hidden lg:inline">
              Text Size
            </span>
            <IconButton label="Decrease font size"
              onClick={() => setZoomFactor((prev) => Math.max(90, prev - 5))}
              disabled={zoomFactor <= 90}
              title="Decrease font size"
            >
              <ZoomOut aria-hidden="true" className="w-3.5 h-3.5" />
            </IconButton>
            <span className="px-1.5 text-sm font-semibold text-slate-700 min-w-[36px] text-center">
              {zoomFactor}%
            </span>
            <IconButton label="Increase font size"
              onClick={() => setZoomFactor((prev) => Math.min(220, prev + 5))}
              disabled={zoomFactor >= 220}
              title="Increase font size"
            >
              <ZoomIn aria-hidden="true" className="w-3.5 h-3.5" />
            </IconButton>
          </div>

          <Button variant="secondary" aria-label="Search records and products" aria-haspopup="dialog"
            onClick={() => setSearchOpen(true)}
            title="Global search (Ctrl+K)"
            id="global-search-button"
          >
            <Search aria-hidden="true" className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">Search</span>
            <kbd className="hidden lg:inline bg-slate-200 border border-slate-300 px-1 rounded text-caption text-slate-600">
              Ctrl K
            </kbd>
          </Button>
          <NotificationBell
            onNavigate={handleNavigate}
            deliveryRecords={deliveryRecords}
          />

          {canReset && (
            <IconButton label="Reset demo data" loading={resetting}
              onClick={() => {
                setResetError(null);
                setResetOpen(true);
              }}
              disabled={resetting}
              id="reset-demo-data-button"
              title="Reset all data back to the original demo seed data (dev only)"
            >
              {!resetting && <RotateCw aria-hidden="true" className="w-4 h-4" />}
            </IconButton>
          )}

          <IconButton label="Log out"
            onClick={handleLogout}
            id="logout-button"
            title="Log out"
          >
            <LogOut aria-hidden="true" className="w-3.5 h-3.5" />
          </IconButton>
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
