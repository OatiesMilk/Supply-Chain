import RecordStatus from '@/components/RecordStatus';
import { manilaToday } from '@/utils/recordLifecycle';
import {
  Truck,
  UserX,
  CheckCircle2,
  PauseCircle,
  RefreshCw,
  ArrowRight,
  AlertTriangle,
  Navigation,
} from "lucide-react";
import { DeliveryRecord } from "@/types";
import { ApiDashboardStats, ApiDashboardOverview } from "@/api";
import { screenKeyForCategory } from "@/routes/screenRouting";
import { DashboardFilterId, filterRecordsForDashboard } from '@/utils/dashboardFilters';

interface Props {
  stats: Extract<ApiDashboardStats, { role: "LOGISTICS" }> | null;
  deliveryRecords: DeliveryRecord[];
  overview: ApiDashboardOverview;
  onNavigate: (screen: string, item_id?: string, dashboardFilterId?: DashboardFilterId) => void;
  onRefresh?: () => void;
}

export default function LogisticsDashboard({
  stats,
  overview,
  deliveryRecords,
  onNavigate,
  onRefresh,
}: Props) {
  const rmaRequests = overview.record_previews.rma_requests;
  const rmaRequestTotal = overview.counts.rma_requests ?? 0;
  const flagsCount = overview.counts['log-flags'] ?? 0;
  const onHoldCount = overview.counts['log-on-hold'] ?? 0;
  const rescheduledCount = overview.counts['log-rescheduled'] ?? 0;
  const driversOut = overview.drivers_out;
  const assignedToday = stats?.assigned_today ?? 0;
  const unassignedCount = stats?.unassigned_count ?? overview.counts['log-unassigned'] ?? 0;
  const completedToday = stats?.completed_today ?? 0;
  const onHoldRescheduled = stats?.on_hold_rescheduled ?? 0;

  return (
    <div className="space-y-6" id="logistics-dashboard">
      <section aria-label="RMA transport requests" className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <header className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50/70 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-[#1F3864]">
              <RefreshCw aria-hidden="true" className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-[#1F3864]">RMA transport requests</h2>
              <p className="mt-0.5 text-xs leading-5 text-slate-500">Returns waiting for Logistics dispatch.</p>
            </div>
          </div>
          <span className="inline-flex min-h-8 items-center self-start rounded-full border border-blue-200 bg-blue-50 px-3 text-xs font-semibold text-[#1F3864] sm:self-auto">
            {rmaRequestTotal} {rmaRequestTotal === 1 ? 'request' : 'requests'}
          </span>
        </header>

        {rmaRequestTotal === 0 ? (
          <div className="p-4 sm:p-5">
            <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-center text-sm text-slate-600">
              No RMA transport requests need dispatch.
            </p>
          </div>
        ) : (
          <>
            <ul className="grid gap-3 p-4 sm:p-5">
              {rmaRequests.map(record => (
                <li key={record.id}>
                  <button
                    type="button"
                    onClick={() => onNavigate('rma', record.id)}
                    aria-label={`Open RMA ${record.rma_reference || record.id} for ${record.company_name}`}
                    className="group w-full rounded-lg border border-slate-200 bg-white p-4 text-left shadow-sm transition-colors hover:border-[#0078C1]/50 hover:bg-blue-50/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0078C1] motion-reduce:transition-none"
                  >
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-[#1F3864]">{record.rma_reference || record.id}</span>
                      <RecordStatus record={record} />
                    </span>
                    <span className="mt-3 grid gap-x-4 gap-y-3 sm:grid-cols-2 xl:grid-cols-4">
                      <span className="min-w-0">
                        <span className="block text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">Company</span>
                        <span className="mt-1 block truncate text-sm font-semibold text-slate-800">{record.company_name}</span>
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">Area</span>
                        <span className="mt-1 block truncate text-sm font-medium text-slate-700">{record.area}</span>
                      </span>
                      <span>
                        <span className="block text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">Transport date</span>
                        <span className="mt-1 block text-sm font-medium text-slate-700">{record.delivery_date}</span>
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">Driver</span>
                        <span className={`mt-1 block truncate text-sm font-semibold ${record.driver ? 'text-slate-800' : 'text-amber-700'}`}>
                          {record.driver || 'Needs driver'}
                        </span>
                      </span>
                    </span>
                    <span className="mt-3 flex items-center justify-end gap-1 text-xs font-semibold text-[#0078C1] group-hover:text-[#1F3864]">
                      Open RMA <ArrowRight aria-hidden="true" className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {rmaRequestTotal > 0 && <footer className="flex flex-col gap-3 border-t border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <p className="text-xs text-slate-500">Showing {rmaRequests.length} of {rmaRequestTotal} requests</p>
              <button
                type="button"
                onClick={() => onNavigate('rma')}
                className="inline-flex min-h-10 items-center justify-center gap-2 self-start rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-[#1F3864] transition-colors hover:border-[#0078C1]/50 hover:bg-blue-50/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0078C1] sm:self-auto motion-reduce:transition-none"
              >
                View all requests <ArrowRight aria-hidden="true" className="h-4 w-4" />
              </button>
            </footer>}
          </>
        )}
      </section>
      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Assigned Today */}
        <div
          className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between gap-3 hover:border-[#1F3864] transition-all cursor-pointer"
          onClick={() => onNavigate("deliveries", undefined, 'log-assigned-today')}
        >
          <div className="min-w-0">
            <p className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">
              Assigned to Drivers Today
            </p>
            <h3 className="text-3xl font-black text-slate-900 mt-1">
              {assignedToday}
            </h3>
            <span className="text-xs text-slate-600 font-extrabold flex items-center gap-1 mt-2">
              Active today <ArrowRight className="w-3.5 h-3.5 shrink-0" />
            </span>
          </div>
          <div className="bg-blue-50 p-3 rounded-lg text-[#1F3864] shrink-0">
            <Truck className="w-6 h-6" />
          </div>
        </div>

        {/* Unassigned (orange — needs attention) */}
        <div
          className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between gap-3 hover:border-amber-400 transition-all cursor-pointer"
          id="kpi-log-unassigned"
          onClick={() => onNavigate("deliveries", undefined, 'log-unassigned')}
        >
          <div className="min-w-0">
            <p className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">
              No Driver Assigned
            </p>
            <h3 className="text-3xl font-black text-slate-900 mt-1">
              {unassignedCount}
            </h3>
            <span className="text-xs text-amber-600 font-extrabold flex items-center gap-1 mt-2">
              Needs driver
            </span>
          </div>
          <div
            className={`p-3 rounded-lg shrink-0 ${unassignedCount > 0 ? "bg-amber-50 text-amber-600 animate-pulse" : "bg-gray-50 text-gray-400"}`}
          >
            <UserX className="w-6 h-6" />
          </div>
        </div>

        {/* Completed Today */}
        <div
          className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between gap-3 hover:border-emerald-400 transition-all cursor-pointer"
          onClick={() => onNavigate("deliveries", undefined, 'log-completed-today')}
        >
          <div className="min-w-0">
            <p className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">
              Deliveries Completed Today
            </p>
            <h3 className="text-3xl font-black text-slate-900 mt-1">
              {completedToday}
            </h3>
            <span className="text-xs text-emerald-600 font-extrabold flex items-center gap-1 mt-2">
              Accomplished
            </span>
          </div>
          <div className="bg-emerald-50 p-3 rounded-lg text-emerald-600 shrink-0">
            <CheckCircle2 className="w-6 h-6" />
          </div>
        </div>

        {/* On-Hold / Rescheduled */}
        <div
          className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between gap-3 hover:border-purple-400 transition-all cursor-pointer"
          onClick={() => onNavigate("deliveries", undefined, 'log-on-hold-rescheduled')}
        >
          <div className="min-w-0">
            <p className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">
              On-Hold / Rescheduled
            </p>
            <h3 className="text-3xl font-black text-slate-900 mt-1">
              {onHoldRescheduled}
            </h3>
            <span className="text-xs text-purple-600 font-extrabold flex items-center gap-1 mt-2">
              Needs reassignment
            </span>
          </div>
          <div className="bg-purple-50 p-3 rounded-lg text-purple-600 shrink-0">
            <RefreshCw className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Drivers Currently Out Card */}
      <div className="bg-[#1F3864] rounded-xl shadow-md p-5 border border-[#1F3864]">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Navigation className="w-5 h-5 text-[#0078C1]" />
            <h4 className="text-sm font-black text-white uppercase tracking-wider">
              Drivers Currently Out for Delivery
            </h4>
          </div>
          <span className="bg-[#0078C1] text-white text-[10px] font-bold px-2.5 py-1 rounded-full">
            {overview.drivers_out_total} driver{overview.drivers_out_total !== 1 ? "s" : ""}{" "}
            active
          </span>
        </div>

        {driversOut.length === 0 ? (
          <p className="text-white/50 text-sm font-semibold text-center py-4">
            No drivers currently assigned to today's deliveries.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {driversOut.map(({ driver, records, total }) => (
              <div
                key={driver}
                className="bg-white/10 rounded-lg p-3 border border-white/10"
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-7 h-7 rounded-full bg-[#0078C1] flex items-center justify-center text-white text-[10px] font-black shrink-0">
                    {driver
                      .split(" ")
                      .map((p) => p[0])
                      .join("")
                      .slice(0, 2)
                      .toUpperCase()}
                  </div>
                  <span className="text-white font-bold text-xs truncate">
                    {driver}
                  </span>
                </div>
                <p className="text-white/60 text-[10px] font-bold uppercase tracking-wide mb-1.5">
                  {total} active deliver
                  {total !== 1 ? "ies" : "y"}
                </p>
                <div className="space-y-1">
                  {records.slice(0, 3).map((r) => (
                    <button
                      key={r.id}
                      onClick={() =>
                        onNavigate(screenKeyForCategory(r.category), r.id)
                      }
                      className="block w-full text-left text-[10px] text-white/70 hover:text-white font-mono truncate cursor-pointer"
                    >
                      {r.id} · {r.company_name}
                    </button>
                  ))}
                  {total > records.length && (
                    <p className="text-[10px] text-white/40 font-semibold">
                      +{total - records.length} more records
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {overview.drivers_out_total > driversOut.length && <button type="button" onClick={() => onNavigate('driver_board')} className="text-sm text-blue-800 underline">View all {overview.drivers_out_total} assigned Drivers</button>}
      {/* Needs Attention Panel */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
          <h4 className="text-sm font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" /> Needs Attention
          </h4>
          <button
            onClick={() => onNavigate("deliveries", undefined, 'log-flags')}
            className="bg-amber-100 hover:bg-amber-200 text-amber-800 text-xs px-2.5 py-0.5 rounded font-extrabold uppercase tracking-wide cursor-pointer hover:underline transition-colors"
          >
            {flagsCount}{" "}
            Flags
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Unassigned */}
          <div className="border border-slate-200 rounded-lg p-3 space-y-2 flex flex-col">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
              <UserX className="w-3.5 h-3.5 text-amber-500 shrink-0" />{" "}
              Unassigned Records
            </span>
            <p className="text-2xl font-black text-slate-900">
              {unassignedCount}
            </p>
            <p className="text-[11px] text-slate-400 font-medium flex-1">
              Records with no driver assigned yet.
            </p>
            <button
              onClick={() => onNavigate("deliveries", undefined, 'log-unassigned')}
              className="text-[10px] text-[#0078C1] hover:underline font-bold uppercase tracking-wide cursor-pointer text-left"
            >
              View records →
            </button>
          </div>

          {/* On-Hold */}
          <div className="border border-slate-200 rounded-lg p-3 space-y-2 flex flex-col">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
              <PauseCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />{" "}
              On-Hold Items
            </span>
            <p className="text-2xl font-black text-slate-900">
              {onHoldCount}
            </p>
            <p className="text-[11px] text-slate-400 font-medium flex-1">
              Deliveries currently blocked.
            </p>
            <button
              onClick={() => onNavigate("deliveries", undefined, 'log-on-hold')}
              className="text-[10px] text-[#0078C1] hover:underline font-bold uppercase tracking-wide cursor-pointer text-left"
            >
              View records →
            </button>
          </div>

          {/* Rescheduled */}
          <div className="border border-slate-200 rounded-lg p-3 space-y-2 flex flex-col">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
              <RefreshCw className="w-3.5 h-3.5 text-purple-500 shrink-0" />{" "}
              Rescheduled Items
            </span>
            <p className="text-2xl font-black text-slate-900">
              {rescheduledCount}
            </p>
            <p className="text-[11px] text-slate-400 font-medium flex-1">
              Bumped to a new delivery date.
            </p>
            <button
              onClick={() => onNavigate("deliveries", undefined, 'log-rescheduled')}
              className="text-[10px] text-[#0078C1] hover:underline font-bold uppercase tracking-wide cursor-pointer text-left"
            >
              View records →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
