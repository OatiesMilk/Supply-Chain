import { manilaToday } from '@/utils/recordLifecycle';
import {
  AlertTriangle,
  Package,
  ArrowDownToLine,
  ArrowUpFromLine,
  Truck,
  ArrowRight,
  CheckCircle,
  CheckCircle2,
  Clock,
  UserX,
  PauseCircle,
  RefreshCw,
  RotateCw,
} from "lucide-react";
import DashboardStatusChart from './DashboardStatusChart';
import {
  Product,
  InventoryItem,
  DeliveryRecord,
  DeliveryStatus,
} from "@/types";
import { api, ApiDashboardStats } from "@/api";
import { useQuery } from "@tanstack/react-query";
import { operationalSyncOptions } from "@/api/queries/operationalSync";
import LogisticsDashboard from "@/features/dashboard/LogisticsDashboard";
import TassDashboard from "@/features/dashboard/TassDashboard";
import AdminDashboard from "@/features/dashboard/AdminDashboard";
import { DashboardFilterId, filterRecordsForDashboard } from '@/utils/dashboardFilters';
import { usePermissions } from '@/hooks/usePermissions';

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
  inventory,
  deliveryRecords,
  dashboardStats,
  onNavigate,
  currentUserRole,
  onRefresh,
}: DashboardViewProps) {
  const overviewQuery = useQuery({ ...operationalSyncOptions, queryKey: ['dashboard-overview'], queryFn: api.getDashboardOverview });
  const { canAccess } = usePermissions();
  // TASS is on the shared design system: tiles render from /stats even when /overview fails.
  if (currentUserRole === "TASS") {
    return (
      <TassDashboard
        stats={dashboardStats?.role === "TASS" ? dashboardStats : null}
        overview={overviewQuery.data}
        overviewStatus={overviewQuery.isError ? 'error' : overviewQuery.isPending ? 'pending' : 'success'}
        onRetryOverview={() => void overviewQuery.refetch()}
        onNavigate={onNavigate}
        onRefresh={onRefresh}
        refreshing={overviewQuery.isFetching}
        canAccess={canAccess}
      />
    );
  }
  if (overviewQuery.isPending) return <p role="status" className="p-5 text-sm text-slate-600">Loading dashboard totals…</p>;
  if (overviewQuery.isError) return <div role="alert" className="p-5 text-sm text-red-700">Could not load dashboard totals. <button type="button" className="underline" onClick={() => void overviewQuery.refetch()}>Retry dashboard</button></div>;
  const overview = overviewQuery.data;
  // Narrow the discriminated union to the correct branch per role
  const salesStats =
    dashboardStats?.role === "SALES_COORDINATOR" ? dashboardStats : null;
  const logisticsStats =
    dashboardStats?.role === "LOGISTICS" ? dashboardStats : null;
  const adminStats = dashboardStats?.role === "ADMIN" ? dashboardStats : null;

  // ── Role-specific dashboards ──────────────────────────────────────────────────
  if (currentUserRole === "Logistics") {
    return (
      <LogisticsDashboard
        stats={logisticsStats}
        overview={overview}
        deliveryRecords={deliveryRecords}
        onNavigate={onNavigate}
        onRefresh={onRefresh}
      />
    );
  }

  if (currentUserRole === "Admin") {
    return (
      <AdminDashboard
        stats={adminStats}
        overview={overview}
        deliveryRecords={deliveryRecords}
        onNavigate={onNavigate}
        onRefresh={onRefresh}
      />
    );
  }

  // ── Sales Coordinator dashboard (default) ────────────────────────────────────
  const today = manilaToday();

  const deliveriesScheduledToday =
    salesStats?.deliveries_scheduled_today ??
    filterRecordsForDashboard(deliveryRecords, 'sc-scheduled-today', today).length;
  const pendingDriverAssignment =
    salesStats?.pending_driver_assignment ??
    filterRecordsForDashboard(deliveryRecords, 'sc-pending-assignment', today).length;
  const onHoldCount =
    salesStats?.on_hold ??
    filterRecordsForDashboard(deliveryRecords, 'sc-on-hold', today).length;
  const rescheduledCount =
    salesStats?.rescheduled ??
    filterRecordsForDashboard(deliveryRecords, 'sc-rescheduled', today).length;
  const deliveriesCompletedToday =
    salesStats?.accomplished_today ??
    filterRecordsForDashboard(deliveryRecords, 'sc-completed-today', today).length;

  const statusChartData: {
    status: DeliveryStatus;
    count: number;
  }[] = [
    {
      status: "Scheduled",
      count: overview.status_totals.Scheduled ?? 0,
    },
    {
      status: "Pending",
      count: overview.status_totals.Pending ?? 0,
    },
    { status: "In Transit", count: overview.status_totals["In Transit"] ?? 0 },
    { status: "On-Hold", count: overview.status_totals["On-Hold"] ?? 0 },
    { status: "Rescheduled", count: overview.status_totals.Rescheduled ?? 0 },
    {
      status: "Delivered",
      count: overview.status_totals.Delivered ?? 0,
    },
  ];

  const noDriverApproachingCount = overview.counts['sc-attention-no-driver'] ?? 0;
  const onHoldOrRescheduledCount = overview.counts['sc-attention-on-hold-rescheduled'] ?? 0;
  const pendingConfirmationCount = overview.counts['sc-attention-pending-confirmation'] ?? 0;
  const needsAttentionCount = overview.counts['sc-attention-all'] ?? 0;
  const totalRecordCount = overview.record_total + products.length;

  return (
    <div className="space-y-6" id="dashboard-view-container">
      {/* KPI Cards */}
      <div className="space-y-4">
        <div
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-stretch"
          id="dashboard-kpis"
        >
          <div
            className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between gap-3 hover:border-[#1F3864] transition-all cursor-pointer"
            id="kpi-scheduled-today"
            onClick={() => onNavigate("deliveries", undefined, 'sc-scheduled-today')}
          >
            <div className="min-w-0">
              <p className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">
                Deliveries Scheduled Today
              </p>
              <h3 className="text-3xl font-black text-slate-900 mt-1">
                {deliveriesScheduledToday}
              </h3>
              <span className="text-xs text-slate-600 font-extrabold flex items-center gap-1 mt-2">
                Today's queue <ArrowRight className="w-3.5 h-3.5 shrink-0" />
              </span>
            </div>
            <div className="bg-blue-50 p-3 rounded-lg text-[#1F3864] shrink-0">
              <Truck className="w-6 h-6" />
            </div>
          </div>

          <div
            className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between gap-3 hover:border-amber-400 transition-all cursor-pointer"
            id="kpi-pending-driver"
            onClick={() => onNavigate("deliveries", undefined, 'sc-pending-assignment')}
          >
            <div className="min-w-0">
              <p className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">
                Pending Driver Assignment
              </p>
              <h3 className="text-3xl font-black text-slate-900 mt-1">
                {pendingDriverAssignment}
              </h3>
              <span className="text-xs text-amber-600 font-extrabold flex items-center gap-1 mt-2">
                Needs a driver
              </span>
            </div>
            <div
              className={`p-3 rounded-lg shrink-0 ${pendingDriverAssignment > 0 ? "bg-amber-50 text-amber-600 animate-pulse" : "bg-gray-50 text-gray-400"}`}
            >
              <UserX className="w-6 h-6" />
            </div>
          </div>

          <div
            className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between gap-3 hover:border-red-400 transition-all cursor-pointer"
            id="kpi-on-hold"
            onClick={() => onNavigate("deliveries", undefined, 'sc-on-hold')}
          >
            <div className="min-w-0">
              <p className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">
                On-Hold Items
              </p>
              <h3 className="text-3xl font-black text-slate-900 mt-1">
                {onHoldCount}
              </h3>
              <span className="text-xs text-red-600 font-extrabold flex items-center gap-1 mt-2">
                Blocked
              </span>
            </div>
            <div className="bg-red-50 p-3 rounded-lg text-red-600 shrink-0">
              <PauseCircle className="w-6 h-6" />
            </div>
          </div>

          <div
            className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between gap-3 hover:border-purple-400 transition-all cursor-pointer"
            id="kpi-rescheduled"
            onClick={() => onNavigate("deliveries", undefined, 'sc-rescheduled')}
          >
            <div className="min-w-0">
              <p className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">
                Rescheduled Items
              </p>
              <h3 className="text-3xl font-black text-slate-900 mt-1">
                {rescheduledCount}
              </h3>
              <span className="text-xs text-purple-600 font-extrabold flex items-center gap-1 mt-2">
                Needs follow-up
              </span>
            </div>
            <div className="bg-purple-50 p-3 rounded-lg text-purple-600 shrink-0">
              <RefreshCw className="w-6 h-6" />
            </div>
          </div>

          <div
            className=" bg-white  p-5 rounded-xl border border-transparent shadow-sm flex items-center justify-between gap-3 hover:border-[#0078C1] hover:shadow-md transition-all cursor-pointer"
            id="kpi-completed-today"
            onClick={() => onNavigate("deliveries", undefined, 'sc-completed-today')}
          >
            <div className="min-w-0">
              <p className="text-xs font-extrabold text-[#1F3864] uppercase tracking-wider">
                Deliveries Completed Today
              </p>
              <h3 className="text-3xl font-black text-[#1F3864] mt-1">
                {deliveriesCompletedToday}
              </h3>
              <span className="text-xs text-[#1F3864] font-extrabold flex items-center gap-1 mt-2">
                Confirmed today <ArrowRight className="w-3.5 h-3.5 shrink-0" />
              </span>
            </div>
            <div className="bg-blue-400/10 p-3 rounded-lg text-[#1F3864] shrink-0">
              <CheckCircle2 className="w-6 h-6" />
            </div>
          </div>
        </div>
      </div>

      {/* Chart + Needs Attention — 40/60 split */}
      <div
        className="grid grid-cols-1 lg:grid-cols-5 gap-6"
        id="dashboard-charts"
      >
        <div
          className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm lg:col-span-2"
          id="chart-delivery-status"
        >
          <h4 className="text-base font-black text-slate-800 uppercase tracking-wider">
            Delivery Record Status
          </h4>
          <p className="text-sm text-slate-500 mt-0.5 mb-4 font-medium">
            Status breakdown across all your delivery records
          </p>
          <div className="h-64" id="status-chart-wrapper">
            <DashboardStatusChart data={statusChartData} />
          </div>
        </div>

        {/* Needs Attention Panel */}
        <div
          className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm lg:col-span-3 flex flex-col"
          id="needs-attention-panel"
        >
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-3">
            <h4 className="text-sm font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" /> Needs
              Attention
            </h4>
            <button
              onClick={() => onNavigate("deliveries", undefined, 'sc-attention-all')}
              className="bg-amber-100 hover:bg-amber-200 text-amber-800 text-xs px-2.5 py-0.5 rounded font-extrabold uppercase tracking-wide cursor-pointer hover:underline transition-colors"
            >
              {needsAttentionCount}{" "}
              Items Need Action
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="border border-slate-200 rounded-lg p-3 space-y-2 min-w-0 flex flex-col">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide flex items-start gap-1.5 leading-snug">
                <UserX className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />{" "}
                <span>No Driver, Due Soon</span>
              </span>
              <p className="text-2xl font-black text-slate-900">
                {noDriverApproachingCount}
              </p>
              <p className="text-[11px] text-slate-400 font-medium flex-1">
                Deliveries with no driver assigned, due within 2 days.
              </p>
              <button
                onClick={() => onNavigate("deliveries", undefined, 'sc-attention-no-driver')}
                className="text-[10px] text-[#0078C1] hover:underline font-bold uppercase tracking-wide cursor-pointer text-left"
              >
                View records →
              </button>
            </div>
            <div className="border border-slate-200 rounded-lg p-3 space-y-2 min-w-0 flex flex-col">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide flex items-start gap-1.5 leading-snug">
                <PauseCircle className="w-3.5 h-3.5 text-purple-500 shrink-0 mt-0.5" />{" "}
                <span>On-Hold / Rescheduled</span>
              </span>
              <p className="text-2xl font-black text-slate-900">
                {onHoldOrRescheduledCount}
              </p>
              <p className="text-[11px] text-slate-400 font-medium flex-1">
                Records blocked or bumped to a new date.
              </p>
              <button
                onClick={() => onNavigate("deliveries", undefined, 'sc-attention-on-hold-rescheduled')}
                className="text-[10px] text-[#0078C1] hover:underline font-bold uppercase tracking-wide cursor-pointer text-left"
              >
                View records →
              </button>
            </div>
            <div className="border border-slate-200 rounded-lg p-3 space-y-2 min-w-0 flex flex-col">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide flex items-start gap-1.5 leading-snug">
                <Clock className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />{" "}
                <span>Pending Confirmation</span>
              </span>
              <p className="text-2xl font-black text-slate-900">
                {pendingConfirmationCount}
              </p>
              <p className="text-[11px] text-slate-400 font-medium flex-1">
                Scheduled or pending records awaiting confirmation.
              </p>
              <button
                onClick={() => onNavigate("deliveries", undefined, 'sc-attention-pending-confirmation')}
                className="text-[10px] text-[#0078C1] hover:underline font-bold uppercase tracking-wide cursor-pointer text-left"
              >
                View records →
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Record count footer */}
      <div
        className="bg-white border border-slate-200 rounded-xl p-3 flex items-center justify-between text-[11px] text-slate-500 font-semibold"
        id="record-count-footer"
      >
        <span>
          Records available to your account:{" "}
          <span className="font-black text-slate-800">
            {totalRecordCount.toLocaleString()}
          </span>{" "}
          ({overview.record_total} operational records, {products.length} SKUs)
        </span>
        <span className="text-emerald-600 font-bold">
          Counts include all records you can access.
        </span>
      </div>
    </div>
  );
}
