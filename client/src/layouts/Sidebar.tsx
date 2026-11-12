import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Layers,
  LayoutDashboard,
  Truck,
  ContactRound,
  ShieldCheck,
  RotateCcw,
  ShoppingCart,
  Users,
  Building2,
  Calendar,
  BarChart3,
  BookOpen,
  ArrowLeftRight,
  Boxes,
  Database,
  ChevronsLeft,
  ChevronsRight,
  X,
  Banknote,
  PackageSearch,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { UserRole } from '@/types';
import { driverLandingScreen, isDriverScreen } from '@/routes/screenRouting';
import { DATA_SAMPLER_ENABLED } from '@/utils/developmentTools';

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
  accountingActiveCount: number;
  procurementActiveCount: number;
  onRequestAccess?: () => void;
}

interface SidebarTooltipState {
  text: string;
  left: number;
  top: number;
}

function tooltipTarget(target: EventTarget | null): HTMLElement | null {
  return target instanceof Element
    ? target.closest<HTMLElement>('[data-sidebar-tooltip]')
    : null;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentScreen,
  handleNavigate,
  isSidebarCollapsed,
  setIsSidebarCollapsed,
  isSidebarOpen,
  setIsSidebarOpen,
  canAccess,
  deliveriesActiveCount,
  rmaActiveCount,
  salesOrdersActiveCount,
  accountingActiveCount,
  procurementActiveCount,
}) => {
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches,
  );
  const [tooltip, setTooltip] = useState<SidebarTooltipState | null>(null);
  const asideRef = useRef<HTMLElement | null>(null);
  const tooltipTargetRef = useRef<HTMLElement | null>(null);
  const tooltipTimerRef = useRef<number | null>(null);
  const tooltipHasOpenedRef = useRef(false);
  const tooltipId = useId();
  const isCollapsed = isDesktop && isSidebarCollapsed;

  useEffect(() => {
    const media = window.matchMedia('(min-width: 1024px)');
    const updateDesktopState = () => setIsDesktop(media.matches);
    updateDesktopState();
    media.addEventListener('change', updateDesktopState);
    return () => media.removeEventListener('change', updateDesktopState);
  }, []);

  const clearTooltipTimer = useCallback(() => {
    if (tooltipTimerRef.current !== null) {
      window.clearTimeout(tooltipTimerRef.current);
      tooltipTimerRef.current = null;
    }
  }, []);

  useEffect(() => () => clearTooltipTimer(), [clearTooltipTimer]);

  const hideTooltip = useCallback((resetDelay = false) => {
    clearTooltipTimer();
    tooltipTargetRef.current = null;
    setTooltip(null);
    if (resetDelay) tooltipHasOpenedRef.current = false;
  }, [clearTooltipTimer]);

  const getTooltipLeft = useCallback((target: HTMLElement) => {
    const targetRight = target.getBoundingClientRect().right + 8;
    const railRight = asideRef.current?.getBoundingClientRect().right ?? targetRight;
    return Math.min(Math.max(targetRight, railRight + 8), window.innerWidth - 248);
  }, []);

  const getTooltipTop = useCallback((target: HTMLElement) => {
    const bounds = target.getBoundingClientRect();
    return Math.min(Math.max(bounds.top + bounds.height / 2, 24), window.innerHeight - 24);
  }, []);

  const showTooltip = useCallback((target: HTMLElement) => {
    if (!isCollapsed) return;
    const text = target.dataset.sidebarTooltip;
    if (!text) return;

    clearTooltipTimer();
    tooltipTargetRef.current = target;
    tooltipTimerRef.current = window.setTimeout(() => {
      if (tooltipTargetRef.current !== target || !target.isConnected) return;
      setTooltip({
        text,
        left: getTooltipLeft(target),
        top: getTooltipTop(target),
      });
      tooltipHasOpenedRef.current = true;
      tooltipTimerRef.current = null;
    }, tooltipHasOpenedRef.current ? 0 : 150);
  }, [clearTooltipTimer, getTooltipLeft, getTooltipTop, isCollapsed]);

  const repositionTooltip = useCallback(() => {
    const target = tooltipTargetRef.current;
    if (!target) return;
    setTooltip(current => current ? {
      ...current,
      left: getTooltipLeft(target),
      top: getTooltipTop(target),
    } : null);
  }, [getTooltipLeft, getTooltipTop]);

  useEffect(() => {
    if (!tooltip) return;
    window.addEventListener('resize', repositionTooltip);
    window.addEventListener('scroll', repositionTooltip, true);
    return () => {
      window.removeEventListener('resize', repositionTooltip);
      window.removeEventListener('scroll', repositionTooltip, true);
    };
  }, [repositionTooltip, tooltip]);

  useEffect(() => {
    hideTooltip(true);
  }, [hideTooltip, isCollapsed]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (!isDesktop || event.defaultPrevented || event.repeat || !(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey || event.key.toLowerCase() !== 'b') return;
      const focusedField = event.target instanceof Element
        ? event.target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')
        : null;
      if (focusedField) return;
      event.preventDefault();
      setIsSidebarCollapsed(!isSidebarCollapsed);
    };

    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [isDesktop, isSidebarCollapsed, setIsSidebarCollapsed]);

  const handleMouseOver = (event: React.MouseEvent<HTMLElement>) => {
    const target = tooltipTarget(event.target);
    if (!target || target === tooltipTarget(event.relatedTarget)) return;
    showTooltip(target);
  };

  const handleMouseOut = (event: React.MouseEvent<HTMLElement>) => {
    const from = tooltipTarget(event.target);
    if (!from) return;
    const to = tooltipTarget(event.relatedTarget);
    if (from === to) return;
    if (to) {
      showTooltip(to);
      return;
    }
    if (tooltipTarget(document.activeElement) !== from) hideTooltip(true);
  };

  const handleFocus = (event: React.FocusEvent<HTMLElement>) => {
    const target = tooltipTarget(event.target);
    if (target) showTooltip(target);
  };

  const handleBlur = (event: React.FocusEvent<HTMLElement>) => {
    const target = tooltipTarget(event.relatedTarget);
    if (target) showTooltip(target);
    else hideTooltip();
  };

  const handleMouseLeave = () => {
    const focusedTarget = tooltipTarget(document.activeElement);
    if (focusedTarget && asideRef.current?.contains(focusedTarget)) return;
    hideTooltip(true);
  };

  const navItemClass = (screen: string, special = false, active = currentScreen === screen) => {
    const base = 'w-full px-4 py-2.5 flex items-center justify-between text-left transition-colors relative cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white';
    const compact = isCollapsed ? ' lg:h-11 lg:w-11 lg:mx-auto lg:justify-center lg:px-0 lg:py-0 lg:rounded-lg' : '';
    const activeStyle = isCollapsed
      ? ' bg-white/10 text-white font-semibold before:absolute before:left-0 before:top-2 before:bottom-2 before:w-[3px] before:rounded-r before:bg-[#0078C1]'
      : ' bg-white/10 text-white font-semibold before:absolute before:left-0 before:top-0 before:bottom-0 before:w-1 before:bg-[#0078C1]';
    const normalStyle = special
      ? ' text-amber-300/60 hover:text-amber-200 hover:bg-amber-400/10'
      : ' text-white/70 hover:bg-white/5 hover:text-white';
    const specialActiveStyle = ' bg-amber-400/20 text-amber-300 font-semibold border-l-2 border-amber-400';
    return base + compact + (active ? (special && !isCollapsed ? specialActiveStyle : activeStyle) : normalStyle);
  };

  // One entry for the three driver screens; it opens the last tab the user had
  // open, or the first one they are granted.
  const driversScreen = driverLandingScreen(canAccess);

  const renderNavItem = (
    screen: string,
    label: string,
    Icon: LucideIcon,
    activeCount?: number,
    special = false,
    active = currentScreen === screen,
  ) => {
    if (!canAccess(screen)) return null;
    const countText = activeCount && activeCount > 0
      ? (activeCount > 99 ? '99+' : String(activeCount)) + ' active'
      : '';
    const accessibleLabel = countText ? label + ' · ' + countText : label;
    const badge = activeCount && activeCount > 0 ? (
      <span
        aria-hidden="true"
        className={'bg-red-500 text-white font-bold text-[9px] px-1.5 py-0.5 rounded-full' + (isCollapsed
          ? ' lg:absolute lg:-top-1 lg:-right-1 lg:min-w-4 lg:h-4 lg:px-1 lg:flex lg:items-center lg:justify-center lg:leading-none lg:z-10'
          : '')}
      >
        {activeCount > 99 ? '99+' : activeCount}
      </span>
    ) : null;

    return (
      <button
        key={screen}
        type="button"
        onClick={() => handleNavigate(screen)}
        aria-label={accessibleLabel}
        aria-describedby={isCollapsed ? tooltipId : undefined}
        data-sidebar-tooltip={accessibleLabel}
        className={navItemClass(screen, special, active)}
      >
        <span className={'flex items-center space-x-3' + (isCollapsed ? ' lg:space-x-0' : '')}>
          <Icon className={'w-5 h-5 shrink-0' + (special ? ' text-amber-400' : '')} />
          <span className={'text-xs font-medium truncate' + (isCollapsed ? ' lg:hidden' : '')}>{label}</span>
        </span>
        {badge}
      </button>
    );
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
        ref={asideRef}
        onMouseOverCapture={handleMouseOver}
        onMouseOutCapture={handleMouseOut}
        onMouseLeave={handleMouseLeave}
        onFocusCapture={handleFocus}
        onBlurCapture={handleBlur}
        className={'fixed inset-y-0 left-0 z-50 bg-[#1F3864] text-white flex flex-col justify-between transition-transform duration-300 ease-out lg:transition-[width] lg:duration-200 lg:ease-out motion-reduce:transition-none lg:relative lg:translate-x-0 lg:z-auto shrink-0 ' +
          (isSidebarCollapsed ? 'lg:w-[72px]' : 'lg:w-56') +
          ' ' + (isSidebarOpen ? 'w-64 translate-x-0' : 'w-64 -translate-x-full lg:translate-x-0')}
        id="sidebar-panel"
      >
        <div className="p-4 min-h-[88px] border-b border-white/10 relative">
          <button
            type="button"
            onClick={() => setIsSidebarOpen(false)}
            className="absolute top-4 right-4 lg:hidden p-1 bg-white/10 hover:bg-white/20 text-white rounded transition-colors cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            id="close-sidebar-button"
            aria-label="Close menu"
            title="Close menu"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="relative h-14 w-full flex items-center justify-center" role="img" aria-label="Microgenesis">
            <img
              src="/microgenesis_mark_white.png"
              alt=""
              className={'absolute h-8 w-8 object-contain transition-opacity duration-200 ease-out motion-reduce:transition-none' + (isCollapsed ? ' opacity-100' : ' opacity-0')}
            />
            <img
              src="/microgenesis_logo_white.png"
              alt=""
              className={'absolute w-full h-auto max-h-14 object-contain transition-opacity duration-200 ease-out motion-reduce:transition-none' + (isCollapsed ? ' opacity-0' : ' opacity-100')}
            />
          </div>
        </div>

        <nav
          className="flex-1 py-3 space-y-4 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
          id="sidebar-nav"
          onScrollCapture={repositionTooltip}
        >
          <div className="space-y-1">
            {renderNavItem('main', 'Main', Layers)}
          </div>

          <div className="space-y-1">
            {renderNavItem('dashboard', 'Dashboard', LayoutDashboard)}
          </div>

          <div className="space-y-1">
            <span className={'text-[10px] uppercase tracking-wider text-white/40 font-bold px-4 block' + (isCollapsed ? ' lg:hidden' : '')}>Operations</span>
            {isCollapsed && <hr aria-hidden="true" className="hidden lg:block w-6 border-0 border-t border-white/10 my-3 mx-auto" />}

            {renderNavItem('deliveries', 'Deliveries', Truck, deliveriesActiveCount)}
            {renderNavItem('rma', 'RMA', RotateCcw, rmaActiveCount)}
            {renderNavItem('accounting_collection', 'Accounting Collection', Banknote, accountingActiveCount)}
            {renderNavItem('procurement_pickup', 'Procurement Pick-up', PackageSearch, procurementActiveCount)}
            {renderNavItem('sales_orders', 'Sales Orders', ShoppingCart, salesOrdersActiveCount)}
          </div>

          <div className="space-y-1">
            <span className={'text-[10px] uppercase tracking-wider text-white/40 font-bold px-4 block' + (isCollapsed ? ' lg:hidden' : '')}>Master Data</span>
            {isCollapsed && <hr aria-hidden="true" className="hidden lg:block w-6 border-0 border-t border-white/10 my-3 mx-auto" />}

            {renderNavItem('customers', 'Customers', Users)}
            {renderNavItem('suppliers', 'Suppliers', Building2)}
            {driversScreen && renderNavItem(driversScreen, 'Drivers', ContactRound, undefined, false, isDriverScreen(currentScreen))}
            {renderNavItem('admin', 'Admin Panel', ShieldCheck)}
            {renderNavItem('calendar', 'Delivery Calendar', Calendar)}
            {renderNavItem('statistical_reports', 'Reports', BarChart3)}
            {renderNavItem('am_directory', 'AM Directory', BookOpen)}
            {renderNavItem('transactions', 'Transaction Center', ArrowLeftRight)}
            {renderNavItem('inventory', 'SKU Master', Boxes)}
            {DATA_SAMPLER_ENABLED && renderNavItem('data_sampler', 'Data Sampler', Database, undefined, true)}
          </div>
        </nav>

        {/* Desktop collapse toggle: straddles the rail's right edge at mid-height and
            follows the edge as the width animates between collapsed and expanded. */}
        <button
          type="button"
          onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          className="hidden lg:flex absolute top-1/2 right-0 z-20 h-8 w-8 -translate-y-1/2 translate-x-1/2 items-center justify-center rounded-full border border-slate-200 bg-white text-[#1F3864] shadow-md transition-colors hover:bg-slate-50 hover:text-[#0078C1] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0078C1] cursor-pointer"
          id="desktop-sidebar-toggle"
          aria-label={isSidebarCollapsed ? 'Expand menu' : 'Collapse menu'}
          aria-expanded={!isSidebarCollapsed}
          aria-controls="sidebar-panel"
          title={isSidebarCollapsed ? 'Expand menu (Ctrl+B)' : 'Collapse menu (Ctrl+B)'}
        >
          {isSidebarCollapsed ? <ChevronsRight className="w-4 h-4" /> : <ChevronsLeft className="w-4 h-4" />}
        </button>

      </aside>

      {isCollapsed && typeof document !== 'undefined' && createPortal(
        <div
          id={tooltipId}
          role="tooltip"
          aria-hidden={!tooltip}
          hidden={!tooltip}
          className="fixed z-[100] max-w-[240px] -translate-y-1/2 rounded-md border border-white/10 bg-[#122B4F] px-2.5 py-1.5 text-xs font-medium leading-5 text-white shadow-xl pointer-events-none"
          style={tooltip ? { left: tooltip.left, top: tooltip.top } : undefined}
        >
          {tooltip?.text}
        </div>,
        document.body,
      )}
    </>
  );
};

export default Sidebar;
