import { manilaToday } from '@/utils/recordLifecycle';
import React from "react";
import {
  Menu,
  ZoomIn,
  ZoomOut,
  Clock,
  Search,
  LogOut,
} from "lucide-react";
import { NotificationBell } from "@/components";
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
  handleLogout,
}) => {
  return (
    <header
      className="h-16 bg-white border-b border-slate-200 px-4 lg:px-8 flex items-center justify-between shrink-0"
      id="global-header"
    >
      <div className="flex items-center gap-3 text-sm">
        <button
          onClick={() => setIsSidebarOpen(true)}
          className="lg:hidden p-1.5 -ml-1 text-slate-600 hover:text-[#0078C1] hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
          id="mobile-sidebar-toggle"
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

      <div className="flex items-center gap-4 text-xs text-slate-500">
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
            className="p-1 hover:bg-white rounded text-slate-600 hover:text-slate-900 disabled:opacity-40 transition-colors cursor-pointer flex items-center justify-center border border-transparent hover:border-slate-200"
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
            className="p-1 hover:bg-white rounded text-slate-600 hover:text-slate-900 disabled:opacity-40 transition-colors cursor-pointer flex items-center justify-center border border-transparent hover:border-slate-200"
            title="Increase font size"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
        </div>

        <span className="hidden md:flex items-center gap-1.5 font-bold text-slate-500 text-[10.5px] uppercase tracking-wide">
          <Clock className="w-3.5 h-3.5 text-slate-400" />{" "}
          {manilaToday()}
        </span>

        <button
          onClick={() => setSearchOpen(true)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-500 hover:text-slate-700 rounded-lg transition-colors cursor-pointer text-[10px] font-bold"
          title="Global search (Ctrl+K)"
          id="global-search-button"
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
  );
};

export default Navbar;
