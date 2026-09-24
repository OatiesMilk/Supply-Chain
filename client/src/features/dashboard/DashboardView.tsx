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
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import {
  Product,
  InventoryItem,
  DeliveryRecord,
  DeliveryStatus,
} from "@/types";
import { ApiDashboardStats } from "@/api";
import LogisticsDashboard from "@/features/dashboard/LogisticsDashboard";
import TassDashboard from "@/features/dashboard/TassDashboard";
import AdminDashboard from "@/features/dashboard/AdminDashboard";

interface DashboardViewProps {
  products: Product[];
  inventory: InventoryItem[];
  deliveryRecords: DeliveryRecord[];
  dashboardStats?: ApiDashboardStats | null;
  onNavigate: (screen: string, item_id?: string) => void;
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
  // Narrow the discriminated union to the correct branch per role
  const salesStats =
    dashboardStats?.role === "SALES_COORDINATOR" ? dashboardStats : null;
  const logisticsStats =
    dashboardStats?.role === "LOGISTICS" ? dashboardStats : null;
  const tassStats = dashboardStats?.role === "TASS" ? dashboardStats : null;
  const adminStats = dashboardStats?.role === "ADMIN" ? dashboardStats : null;

  // ── Role-specific dashboards ──────────────────────────────────────────────────
  if (currentUserRole === "Logistics") {
    return (
      <LogisticsDashboard
        stats={logisticsStats}
        deliveryRecords={deliveryRecords}
        onNavigate={onNavigate}
        onRefresh={onRefresh}
      />
    );
  }

  if (currentUserRole === "TASS") {
    return (
      <TassDashboard
        stats={tassStats}
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
        deliveryRecords={deliveryRecords}
        onNavigate={onNavigate}
        onRefresh={onRefresh}
      />
    );
  }

  // ── Sales Coordinator dashboard (default) ────────────────────────────────────
  const today = new Date().toISOString().split("T")[0];

  const deliveriesScheduledToday =
    salesStats?.deliveries_scheduled_today ??
    deliveryRecords.filter(
      (r) => r.delivery_date === today && r.status === "Scheduled",
    ).length;
  const pendingDriverAssignment =
    salesStats?.pending_driver_assignment ??
    deliveryRecords.filter((r) => !r.driver && r.status !== "Delivered").length;
  const onHoldCount =
    salesStats?.on_hold ??
    deliveryRecords.filter((r) => r.status === "On-Hold").length;
  const rescheduledCount =
    salesStats?.rescheduled ??
    deliveryRecords.filter((r) => r.status === "Rescheduled").length;
  const deliveriesCompletedToday =
    salesStats?.accomplished_today ??
    deliveryRecords.filter(
      (r) => r.status === "Delivered" && r.modified_at.split("T")[0] === today,
    ).length;

  const statusChartData: {
    name: DeliveryStatus;
    count: number;
    fill: string;
  }[] = [
    {
      name: "Scheduled",
      count: deliveryRecords.filter((r) => r.status === "Scheduled").length,
      fill: "#0078C1",
    },
    {
      name: "Pending",
      count: deliveryRecords.filter((r) => r.status === "Pending").length,
      fill: "#d97706",
    },
    { name: "On-Hold", count: onHoldCount, fill: "#dc2626" },
    { name: "Rescheduled", count: rescheduledCount, fill: "#9333ea" },
    {
      name: "Delivered",
      count: deliveryRecords.filter((r) => r.status === "Delivered").length,
      fill: "#059669",
    },
  ];

  const msInDay = 24 * 60 * 60 * 1000;
  const noDriverApproaching = deliveryRecords.filter((r) => {
    if (r.driver) return false;
    if (r.status === "Delivered") return false;
    const diffDays =
      (new Date(r.delivery_date).getTime() - new Date(today).getTime()) /
      msInDay;
    return diffDays <= 2;
  });

  const onHoldOrRescheduled = deliveryRecords.filter(
    (r) => r.status === "On-Hold" || r.status === "Rescheduled",
  );
  const pendingConfirmation = deliveryRecords.filter(
    (r) => r.status === "Pending" || r.status === "Scheduled",
  );

  const totalRecordCount = deliveryRecords.length + products.length;

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
            onClick={() => onNavigate("deliveries")}
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
            className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm border-l-4 border-l-amber-500 flex items-center justify-between gap-3 hover:border-amber-400 transition-all cursor-pointer"
            id="kpi-pending-driver"
            onClick={() => onNavigate("deliveries")}
          >
            <div className="min-w-0">
              <p className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">
                Pending Driver Assignment
              </p>
              <h3 className="text-3xl font-black text-slate-900 mt-1">
                {pendingDriverAssignment}
              </h3>
              <span className="text-xs text-amber-600 font-extrabold flex items-center gap-1 mt-2">
                Needs a driver <UserX className="w-3.5 h-3.5 shrink-0" />
              </span>
            </div>
            <div
              className={`p-3 rounded-lg shrink-0 ${pendingDriverAssignment > 0 ? "bg-amber-50 text-amber-600 animate-pulse" : "bg-gray-50 text-gray-400"}`}
            >
              <UserX className="w-6 h-6" />
            </div>
          </div>

          <div
            className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm border-l-4 border-l-red-500 flex items-center justify-between gap-3 hover:border-red-400 transition-all cursor-pointer"
            id="kpi-on-hold"
            onClick={() => onNavigate("deliveries")}
          >
            <div className="min-w-0">
              <p className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">
                On-Hold Items
              </p>
              <h3 className="text-3xl font-black text-slate-900 mt-1">
                {onHoldCount}
              </h3>
              <span className="text-xs text-red-600 font-extrabold flex items-center gap-1 mt-2">
                Blocked <PauseCircle className="w-3.5 h-3.5 shrink-0" />
              </span>
            </div>
            <div className="bg-red-50 p-3 rounded-lg text-red-600 shrink-0">
              <PauseCircle className="w-6 h-6" />
            </div>
          </div>

          <div
            className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm border-l-4 border-l-purple-500 flex items-center justify-between gap-3 hover:border-purple-400 transition-all cursor-pointer"
            id="kpi-rescheduled"
            onClick={() => onNavigate("deliveries")}
          >
            <div className="min-w-0">
              <p className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">
                Rescheduled Items
              </p>
              <h3 className="text-3xl font-black text-slate-900 mt-1">
                {rescheduledCount}
              </h3>
              <span className="text-xs text-purple-600 font-extrabold flex items-center gap-1 mt-2">
                Needs follow-up <RefreshCw className="w-3.5 h-3.5 shrink-0" />
              </span>
            </div>
            <div className="bg-purple-50 p-3 rounded-lg text-purple-600 shrink-0">
              <RefreshCw className="w-6 h-6" />
            </div>
          </div>

          <div
            className=" bg-white  p-5 rounded-xl border border-transparent shadow-sm flex items-center justify-between gap-3 hover:border-[#0078C1] hover:shadow-md transition-all cursor-pointer"
            id="kpi-completed-today"
            onClick={() => onNavigate("deliveries")}
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
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={statusChartData}
                layout="vertical"
                margin={{ top: 5, right: 15, left: 5, bottom: 5 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  horizontal={false}
                  stroke="#F1F5F9"
                />
                <XAxis
                  type="number"
                  stroke="#94A3B8"
                  fontSize={11}
                  tickLine={false}
                />
                <YAxis
                  dataKey="name"
                  type="category"
                  stroke="#94A3B8"
                  fontSize={10}
                  tickLine={false}
                  width={80}
                />
                <Tooltip
                  formatter={(value: any) => [`${value} records`, "Total"]}
                  contentStyle={{
                    backgroundColor: "#fff",
                    border: "1px solid #E2E8F0",
                    borderRadius: "8px",
                  }}
                />
                <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
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
              onClick={() => onNavigate("deliveries")}
              className="bg-amber-100 hover:bg-amber-200 text-amber-800 text-xs px-2.5 py-0.5 rounded font-extrabold uppercase tracking-wide cursor-pointer hover:underline transition-colors"
            >
              {noDriverApproaching.length +
                onHoldOrRescheduled.length +
                pendingConfirmation.length}{" "}
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
                {noDriverApproaching.length}
              </p>
              <p className="text-[11px] text-slate-400 font-medium flex-1">
                Deliveries with no driver assigned, due within 2 days.
              </p>
              <button
                onClick={() => onNavigate("deliveries")}
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
                {onHoldOrRescheduled.length}
              </p>
              <p className="text-[11px] text-slate-400 font-medium flex-1">
                Records blocked or bumped to a new date.
              </p>
              <button
                onClick={() => onNavigate("deliveries")}
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
                {pendingConfirmation.length}
              </p>
              <p className="text-[11px] text-slate-400 font-medium flex-1">
                Scheduled or pending records awaiting confirmation.
              </p>
              <button
                onClick={() => onNavigate("deliveries")}
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
          Total records in system:{" "}
          <span className="font-black text-slate-800">
            {totalRecordCount.toLocaleString()}
          </span>{" "}
          ({deliveryRecords.length} delivery records, {products.length} SKUs)
        </span>
        <span className="text-emerald-600 font-bold">
          No list-view threshold — unlimited record growth supported.
        </span>
      </div>
    </div>
  );
}
