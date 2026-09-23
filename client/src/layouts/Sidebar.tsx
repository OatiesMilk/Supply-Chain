import React from 'react';
import {
  LayoutGrid,
  LayoutDashboard,
  Truck,
  RotateCcw,
  ShoppingCart,
  Users,
  Building2,
  Calendar,
  Columns,
  History,
  BarChart3,
  BookOpen,
  ArrowLeftRight,
  Boxes,
  Database,
  Menu,
  X,
} from 'lucide-react';
import { UserRole } from '@/types';

export interface SidebarProps {
  currentScreen: string;
  handleNavigate: (screen: any) => void;
  isSidebarCollapsed: boolean;
  setIsSidebarCollapsed: (collapsed: boolean) => void;
  isSidebarOpen: boolean;
  setIsSidebarOpen: (open: boolean) => void;
  canAccess: (screen: any) => boolean;
  currentUserRole: UserRole;
  currentUser: { name: string; initials: string };
  deliveriesActiveCount: number;
  rmaActiveCount: number;
  salesOrdersActiveCount: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
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
}) => {
  const navItemClass = (screen: any) => {
    const active = currentScreen === screen;
    const base = 'w-full px-4 py-2.5 flex items-center justify-between text-left transition-colors relative cursor-pointer';
    if (active) {
      return `${base} bg-white/10 text-white font-semibold before:absolute before:left-0 before:top-0 before:bottom-0 before:w-1 before:bg-[#0078C1]`;
    }
    return `${base} text-white/70 hover:bg-white/5 hover:text-white`;
  };

  return (
    <>
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-40 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
          id="mobile-sidebar-backdrop"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 bg-[#1F3864] text-white flex flex-col justify-between transition-all duration-300 lg:static lg:translate-x-0 lg:z-auto shrink-0 ${
          isSidebarCollapsed ? 'lg:w-28' : 'lg:w-56'
        } ${isSidebarOpen ? 'w-64 translate-x-0' : 'w-64 -translate-x-full lg:translate-x-0'}`}
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
            <div className="flex flex-col items-center gap-2">
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

              <div className="w-full max-h-14 flex items-center">
                <img src="/microgenesis_logo_white.png" alt="Microgenesis - Making It Easy For You!" className="w-full h-auto max-h-14 object-contain" />
              </div>
            </div>
          )}
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 py-3 space-y-4 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]" id="sidebar-nav">
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
                    ? <span className="absolute top-1.5 right-3 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                    : <span className="bg-red-500 text-white font-bold text-[9px] px-1.5 py-0.5 rounded-full">{deliveriesActiveCount}</span>
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
                    ? <span className="absolute top-1.5 right-3 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                    : <span className="bg-red-500 text-white font-bold text-[9px] px-1.5 py-0.5 rounded-full">{rmaActiveCount}</span>
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
                    ? <span className="absolute top-1.5 right-3 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                    : <span className="bg-red-500 text-white font-bold text-[9px] px-1.5 py-0.5 rounded-full">{salesOrdersActiveCount}</span>
                )}
              </button>
            )}
          </div>

          {/* Master Data */}
          <div className="space-y-1">
            {!isSidebarCollapsed ? (
              <span className="text-[10px] uppercase tracking-wider text-white/40 font-bold px-4 block">Master Data</span>
            ) : (
              <div className="border-t border-white/10 my-2 mx-3" />
            )}

            <button onClick={() => handleNavigate('customers')} title={isSidebarCollapsed ? 'Customers' : ''} className={navItemClass('customers')}>
              <span className={`flex items-center ${isSidebarCollapsed ? '' : 'space-x-3'}`}>
                <Users className="w-5 h-5 shrink-0" />
                {!isSidebarCollapsed && <span className="text-xs font-medium truncate">Customers</span>}
              </span>
            </button>

            <button onClick={() => handleNavigate('suppliers')} title={isSidebarCollapsed ? 'Suppliers' : ''} className={navItemClass('suppliers')}>
              <span className={`flex items-center ${isSidebarCollapsed ? '' : 'space-x-3'}`}>
                <Building2 className="w-5 h-5 shrink-0" />
                {!isSidebarCollapsed && <span className="text-xs font-medium truncate">Suppliers</span>}
              </span>
            </button>

            {canAccess('driver') && (
              <button onClick={() => handleNavigate('driver')} title={isSidebarCollapsed ? 'Driver View' : ''} className={navItemClass('driver')}>
                <span className={`flex items-center ${isSidebarCollapsed ? '' : 'space-x-3'}`}>
                  <Truck className="w-5 h-5 shrink-0" />
                  {!isSidebarCollapsed && <span className="text-xs font-medium truncate">Driver View</span>}
                </span>
              </button>
            )}

            {canAccess('driver_manager') && (
              <button onClick={() => handleNavigate('driver_manager')} title={isSidebarCollapsed ? 'Driver Manager' : ''} className={navItemClass('driver_manager')}>
                <span className={`flex items-center ${isSidebarCollapsed ? '' : 'space-x-3'}`}>
                  <Truck className="w-5 h-5 shrink-0" />
                  {!isSidebarCollapsed && <span className="text-xs font-medium truncate">Driver Manager</span>}
                </span>
              </button>
            )}

            {canAccess('admin') && (
              <button onClick={() => handleNavigate('admin')} title={isSidebarCollapsed ? 'Admin Panel' : ''} className={navItemClass('admin')}>
                <span className={`flex items-center ${isSidebarCollapsed ? '' : 'space-x-3'}`}>
                  <Users className="w-5 h-5 shrink-0" />
                  {!isSidebarCollapsed && <span className="text-xs font-medium truncate">Admin Panel</span>}
                </span>
              </button>
            )}

            {canAccess('calendar') && (
              <button onClick={() => handleNavigate('calendar')} title={isSidebarCollapsed ? 'Delivery Calendar' : ''} className={navItemClass('calendar')}>
                <span className={`flex items-center ${isSidebarCollapsed ? '' : 'space-x-3'}`}>
                  <Calendar className="w-5 h-5 shrink-0" />
                  {!isSidebarCollapsed && <span className="text-xs font-medium truncate">Delivery Calendar</span>}
                </span>
              </button>
            )}

            {canAccess('driver_board') && (
              <button onClick={() => handleNavigate('driver_board')} title={isSidebarCollapsed ? 'Driver Board' : ''} className={navItemClass('driver_board')}>
                <span className={`flex items-center ${isSidebarCollapsed ? '' : 'space-x-3'}`}>
                  <Columns className="w-5 h-5 shrink-0" />
                  {!isSidebarCollapsed && <span className="text-xs font-medium truncate">Driver Board</span>}
                </span>
              </button>
            )}

            {canAccess('status_history') && (
              <button onClick={() => handleNavigate('status_history')} title={isSidebarCollapsed ? 'Status History' : ''} className={navItemClass('status_history')}>
                <span className={`flex items-center ${isSidebarCollapsed ? '' : 'space-x-3'}`}>
                  <History className="w-5 h-5 shrink-0" />
                  {!isSidebarCollapsed && <span className="text-xs font-medium truncate">Status History</span>}
                </span>
              </button>
            )}

            {canAccess('statistical_reports') && (
              <button onClick={() => handleNavigate('statistical_reports')} title={isSidebarCollapsed ? 'Reports' : ''} className={navItemClass('statistical_reports')}>
                <span className={`flex items-center ${isSidebarCollapsed ? '' : 'space-x-3'}`}>
                  <BarChart3 className="w-5 h-5 shrink-0" />
                  {!isSidebarCollapsed && <span className="text-xs font-medium truncate">Reports</span>}
                </span>
              </button>
            )}

            {canAccess('am_directory') && (
              <button onClick={() => handleNavigate('am_directory')} title={isSidebarCollapsed ? 'AM Directory' : ''} className={navItemClass('am_directory')}>
                <span className={`flex items-center ${isSidebarCollapsed ? '' : 'space-x-3'}`}>
                  <BookOpen className="w-5 h-5 shrink-0" />
                  {!isSidebarCollapsed && <span className="text-xs font-medium truncate">AM Directory</span>}
                </span>
              </button>
            )}

            <button onClick={() => handleNavigate('transactions')} title={isSidebarCollapsed ? 'Transaction Center' : ''} className={navItemClass('transactions')}>
              <span className={`flex items-center ${isSidebarCollapsed ? '' : 'space-x-3'}`}>
                <ArrowLeftRight className="w-5 h-5 shrink-0" />
                {!isSidebarCollapsed && <span className="text-xs font-medium truncate">Transaction Center</span>}
              </span>
            </button>

            <button onClick={() => handleNavigate('inventory')} title={isSidebarCollapsed ? 'SKU Master' : ''} className={navItemClass('inventory')}>
              <span className={`flex items-center ${isSidebarCollapsed ? '' : 'space-x-3'}`}>
                <Boxes className="w-5 h-5 shrink-0" />
                {!isSidebarCollapsed && <span className="text-xs font-medium truncate">SKU Master</span>}
              </span>
            </button>

            {canAccess('data_sampler') && (
              <button
                onClick={() => handleNavigate('data_sampler')}
                title={isSidebarCollapsed ? 'Data Sampler' : ''}
                className={`w-full px-4 py-2 flex items-center transition-all cursor-pointer ${
                  isSidebarCollapsed ? 'justify-center' : 'space-x-3'
                } ${
                  currentScreen === 'data_sampler'
                    ? 'bg-amber-400/20 text-amber-300 font-semibold border-l-2 border-amber-400'
                    : 'text-amber-300/60 hover:text-amber-200 hover:bg-amber-400/10'
                }`}
              >
                <Database className="w-5 h-5 shrink-0 text-amber-400" />
                {!isSidebarCollapsed && <span className="text-xs truncate font-medium">Data Sampler</span>}
              </button>
            )}
          </div>
        </nav>

        {/* User Info Footer */}
        <div className="p-3 border-t border-white/10 bg-black/10">
          <div className="flex items-center justify-between">
            <div className={`flex items-center ${isSidebarCollapsed ? 'justify-center' : 'space-x-3'}`}>
              <div className="w-8 h-8 rounded-full bg-[#0078C1] flex items-center justify-center font-bold text-white text-xs shrink-0">
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
    </>
  );
};

export default Sidebar;
