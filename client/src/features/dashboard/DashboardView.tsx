import { Product, InventoryItem, DeliveryRecord } from "@/types";
import { api, ApiDashboardStats } from "@/api";
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
  onRefresh?: () => void;
}

export default function DashboardView({
  products,
  deliveryRecords,
  dashboardStats,
  onNavigate,
  currentUserRole,
  onRefresh,
}: DashboardViewProps) {
  const overviewQuery = useQuery({ ...operationalSyncOptions, queryKey: ['dashboard-overview'], queryFn: api.getDashboardOverview });
  const { canAccess } = usePermissions();
  const overviewStatus = overviewQuery.isError ? 'error' : overviewQuery.isPending ? 'pending' : 'success';
  // Dashboards on the shared design system render their tiles from /stats even when /overview fails.
  const shared = {
    overview: overviewQuery.data,
    overviewStatus: overviewStatus as 'pending' | 'error' | 'success',
    onRetryOverview: () => void overviewQuery.refetch(),
    onNavigate,
    onRefresh,
    refreshing: overviewQuery.isFetching,
    canAccess,
  };

  if (currentUserRole === "TASS") {
    return <TassDashboard stats={dashboardStats?.role === "TASS" ? dashboardStats : null} {...shared} />;
  }

  if (currentUserRole !== "Logistics" && currentUserRole !== "Admin") {
    return <SalesCoordinatorDashboard stats={dashboardStats?.role === "SALES_COORDINATOR" ? dashboardStats : null} skuCount={products.length} {...shared} />;
  }

  if (overviewQuery.isPending) return <p role="status" className="p-5 text-sm text-slate-600">Loading dashboard totals…</p>;
  if (overviewQuery.isError) return <div role="alert" className="p-5 text-sm text-red-700">Could not load dashboard totals. <button type="button" className="underline" onClick={() => void overviewQuery.refetch()}>Retry dashboard</button></div>;
  const overview = overviewQuery.data;

  if (currentUserRole === "Logistics") {
    return (
      <LogisticsDashboard
        stats={dashboardStats?.role === "LOGISTICS" ? dashboardStats : null}
        overview={overview}
        deliveryRecords={deliveryRecords}
        onNavigate={onNavigate}
        onRefresh={onRefresh}
      />
    );
  }

  return (
    <AdminDashboard
      stats={dashboardStats?.role === "ADMIN" ? dashboardStats : null}
      overview={overview}
      deliveryRecords={deliveryRecords}
      onNavigate={onNavigate}
      onRefresh={onRefresh}
    />
  );
}
