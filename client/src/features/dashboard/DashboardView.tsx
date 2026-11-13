import { Product, InventoryItem, DeliveryRecord } from "@/types";
import { api, ApiDashboardStats } from "@/api";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { operationalSyncOptions } from "@/api/queries/operationalSync";
import { usePermissions } from "@/hooks/usePermissions";
import LogisticsDashboard from "@/features/dashboard/LogisticsDashboard";
import TassDashboard from "@/features/dashboard/TassDashboard";
import AdminDashboard from "@/features/dashboard/AdminDashboard";
import SalesCoordinatorDashboard from "@/features/dashboard/SalesCoordinatorDashboard";
import { DashboardFilterId } from '@/utils/dashboardFilters';

interface DashboardViewProps {
  products: Product[];
  inventory: InventoryItem[];
  deliveryRecords: DeliveryRecord[];
  dashboardStats?: ApiDashboardStats | null;
  onNavigate: (screen: string, item_id?: string, dashboardFilterId?: DashboardFilterId) => void;
  currentUserRole: string;
  onRefresh?: () => Promise<void> | void;
}

export default function DashboardView({
  products,
  dashboardStats,
  onNavigate,
  currentUserRole,
  onRefresh,
}: DashboardViewProps) {
  const overviewQuery = useQuery({ ...operationalSyncOptions, queryKey: ['dashboard-overview'], queryFn: api.getDashboardOverview });
  const { canAccess, canResource } = usePermissions();
  const [refreshing, setRefreshing] = useState(false);
  // One Refresh updates tiles, panels and the sidebar badges together, so the button waits for all of them.
  const refresh = onRefresh ? async () => { setRefreshing(true); try { await onRefresh(); } finally { setRefreshing(false); } } : undefined;
  const overviewStatus = overviewQuery.isError ? 'error' : overviewQuery.isPending ? 'pending' : 'success';
  // Dashboards on the shared design system render their tiles from /stats even when /overview fails.
  const shared = {
    overview: overviewQuery.data,
    overviewStatus: overviewStatus as 'pending' | 'error' | 'success',
    onRetryOverview: () => void overviewQuery.refetch(),
    onNavigate,
    onRefresh: refresh,
    refreshing,
    canAccess,
  };

  if (currentUserRole === "TASS") {
    return <TassDashboard stats={dashboardStats?.role === "TASS" ? dashboardStats : null} {...shared} />;
  }

  if (currentUserRole === "Logistics") {
    return <LogisticsDashboard stats={dashboardStats?.role === "LOGISTICS" ? dashboardStats : null} canReadRecords={canResource('records')} {...shared} />;
  }

  if (currentUserRole === "Admin") {
    return <AdminDashboard stats={dashboardStats?.role === "ADMIN" ? dashboardStats : null} overview={overviewQuery.data} onNavigate={onNavigate} onRefresh={refresh} refreshing={refreshing} canAccess={canAccess} />;
  }

  return <SalesCoordinatorDashboard stats={dashboardStats?.role === "SALES_COORDINATOR" ? dashboardStats : null} skuCount={products.length} {...shared} />;
}
