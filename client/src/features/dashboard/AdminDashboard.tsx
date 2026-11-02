import { manilaToday } from '@/utils/recordLifecycle';
import {
  Users,
  ClipboardList,
  Banknote,
  ShieldAlert,
  ArrowRight,
  CheckCircle,
  RotateCw,
} from "lucide-react";
import DashboardStatusChart from './DashboardStatusChart';
import { ApiDashboardStats, ApiDashboardOverview } from "@/api";
import { DeliveryRecord } from "@/types";
import { DashboardFilterId, getManilaWeekRange, matchesDashboardFilter } from '@/utils/dashboardFilters';

interface Props {
  stats: Extract<ApiDashboardStats, { role: "ADMIN" }> | null;
  deliveryRecords: DeliveryRecord[];
  overview: ApiDashboardOverview;
  onNavigate: (screen: string, item_id?: string, dashboardFilterId?: DashboardFilterId) => void;
  onRefresh?: () => void;
}

const ACTION_BADGE: Record<string, string> = {
  CREATE: "bg-green-100 text-green-700",
  UPDATE: "bg-blue-100 text-blue-700",
  DELETE: "bg-red-100 text-red-700",
};

const ROLE_LABELS: Record<string, string> = {
  SALES_COORDINATOR: "Sales Coordinator",
  LOGISTICS: "Logistics",
  TASS: "TASS",
  ADMIN: "Admin",
};

export default function AdminDashboard({
  stats,
  overview,
  deliveryRecords,
  onNavigate,
  onRefresh,
}: Props) {
  const today = manilaToday();
  const weekRange = getManilaWeekRange(today);
  const weekStart = new Date(`${weekRange.from}T00:00:00+08:00`).getTime();
  const endExclusive = new Date(`${today}T00:00:00+08:00`).getTime() + 86_400_000;

  // Compute from deliveryRecords as fallback / supplement
  const totalActiveUsers = stats?.total_active_users ?? 0;
  const userBreakdown = stats?.user_breakdown ?? {};
  const recordsThisWeek =
    stats?.records_this_week ??
    deliveryRecords.filter((r) => {
      const createdAt = new Date(r.created_at).getTime();
      return createdAt >= weekStart && createdAt < endExclusive;
    }).length;
  const unverifiedCollections =
    stats?.unverified_collections ??
    deliveryRecords.filter(r => matchesDashboardFilter(r, 'admin-unverified-collections')).length;
  const unverifiedCollectionsAmount = overview.unverified_collections_amount;
  const auditEventsToday = stats?.audit_events_today ?? 0;

  const statusChartData = stats?.records_by_status ?? [];

  const recentAudit = stats?.recent_audit ?? [];

  return (
    <div className="space-y-6" id="admin-dashboard">
      {/* KPI Row 1 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Active Users */}
        <div
          className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between gap-3 hover:border-[#1F3864] transition-all cursor-pointer"
          onClick={() => onNavigate("admin", undefined, 'admin-active-users')}
        >
          <div className="min-w-0">
            <p className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">
              Total Active Users
            </p>
            <h3 className="text-3xl font-black text-slate-900 mt-1">
              {totalActiveUsers}
            </h3>
            <div className="flex flex-wrap gap-1 mt-2">
              {Object.entries(userBreakdown).map(([role, count]) => (
                <span
                  key={role}
                  className="text-[9px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-bold"
                >
                  {count} {ROLE_LABELS[role] ?? role}
                </span>
              ))}
            </div>
          </div>
          <div className="bg-blue-50 p-3 rounded-lg text-[#1F3864] shrink-0">
            <Users className="w-6 h-6" />
          </div>
        </div>

        {/* Records Created This Week */}
        <div
          className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between gap-3 hover:border-[#1F3864] transition-all cursor-pointer"
          onClick={() => onNavigate("transactions", undefined, 'admin-records-this-week')}
        >
          <div className="min-w-0">
            <p className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">
              Records This Week
            </p>
            <h3 className="text-3xl font-black text-slate-900 mt-1">
              {recordsThisWeek}
            </h3>
            <span className="text-xs text-slate-600 font-extrabold flex items-center gap-1 mt-2">
              All modules <ArrowRight className="w-3.5 h-3.5 shrink-0" />
            </span>
          </div>
          <div className="bg-blue-50 p-3 rounded-lg text-[#1F3864] shrink-0">
            <ClipboardList className="w-6 h-6" />
          </div>
        </div>

        {/* Unverified Collections */}
        <div
          className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between gap-3 hover:border-amber-400 transition-all cursor-pointer"
          onClick={() => onNavigate("accounting_collection", undefined, 'admin-unverified-collections')}
        >
          <div className="min-w-0">
            <p className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">
              Unverified Collections
            </p>
            <h3 className="text-3xl font-black text-slate-900 mt-1">
              {unverifiedCollections}
            </h3>
            {unverifiedCollectionsAmount > 0 && (
              <p className="text-xs font-black text-amber-700 mt-0.5 tabular-nums leading-tight">
                ₱
                {unverifiedCollectionsAmount.toLocaleString("en-PH", {
                  minimumFractionDigits: 2,
                })}{" "}
                <span className="font-normal text-slate-400">
                  across {unverifiedCollections} record
                  {unverifiedCollections !== 1 ? "s" : ""}
                </span>
              </p>
            )}
            <span className="text-xs text-amber-600 font-extrabold flex items-center gap-1 mt-1">
              Awaiting TASS
            </span>
          </div>
          <div
            className={`p-3 rounded-lg shrink-0 ${unverifiedCollections > 0 ? "bg-amber-50 text-amber-600 animate-pulse" : "bg-gray-50 text-gray-400"}`}
          >
            <Banknote className="w-6 h-6" />
          </div>
        </div>

        {/* System Audit Events Today */}
        <div
          className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between gap-3 hover:border-[#1F3864] transition-all cursor-pointer"
          onClick={() => onNavigate("admin", undefined, 'admin-audit-today')}
        >
          <div className="min-w-0">
            <p className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">
              Audit Events Today
            </p>
            <h3 className="text-3xl font-black text-slate-900 mt-1">
              {auditEventsToday}
            </h3>
            <span className="text-xs text-slate-600 font-extrabold flex items-center gap-1 mt-2">
              System activity <ArrowRight className="w-3.5 h-3.5 shrink-0" />
            </span>
          </div>
          <div className="bg-blue-50 p-3 rounded-lg text-[#1F3864] shrink-0">
            <ShieldAlert className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Row 2: Records by Status + Recent System Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Records by Status chart */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm lg:col-span-1">
          <h4 className="text-base font-black text-slate-800 uppercase tracking-wider">
            Records by Status
          </h4>
          <p className="text-sm text-slate-500 mt-0.5 mb-4 font-medium">
            All modules — system-wide
          </p>
          {statusChartData.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-slate-400">
              <CheckCircle className="w-8 h-8 mr-2" /> No records found
            </div>
          ) : (
            <div className="h-56">
              <DashboardStatusChart data={statusChartData} />
            </div>
          )}
        </div>

        {/* Recent System Activity */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm lg:col-span-2 flex flex-col">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-3">
            <h4 className="text-sm font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-[#0078C1]" /> Recent System
              Activity
            </h4>
            <button
              onClick={() => onNavigate("admin")}
              className="text-[10px] text-[#0078C1] hover:underline font-bold uppercase tracking-wide cursor-pointer"
            >
              View Full Log →
            </button>
          </div>

          {recentAudit.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center flex-1">
              <CheckCircle className="w-8 h-8 text-emerald-500 mb-2" />
              <p className="text-sm font-bold text-slate-700">
                No activity recorded today
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 flex-1 overflow-y-auto max-h-64">
              {recentAudit.map((entry) => (
                <button
                  key={entry.id}
                  onClick={() => onNavigate("admin")}
                  className="w-full text-left flex items-center gap-3 py-2.5 px-1 hover:bg-slate-50 rounded-md transition-all cursor-pointer"
                >
                  <span
                    className={`px-2 py-0.5 rounded-full border text-[10px] font-bold tracking-wide shrink-0 ${ACTION_BADGE[entry.action] ?? "bg-slate-50 text-slate-600 border-slate-200"}`}
                  >
                    {entry.action}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-slate-800 truncate">
                      <span className="font-bold">{entry.changed_by}</span>
                      <span className="text-slate-500 font-normal">
                        {" "}
                        · {entry.record_type}{" "}
                      </span>
                      <span className="font-mono text-slate-700">
                        {entry.record_id.slice(0, 12)}
                        {entry.record_id.length > 12 ? "…" : ""}
                      </span>
                    </p>
                    <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                      {new Date(entry.timestamp).toLocaleString()}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
