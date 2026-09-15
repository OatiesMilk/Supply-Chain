import {
  Truck,
  UserX,
  CheckCircle2,
  PauseCircle,
  RefreshCw,
  ArrowRight,
  AlertTriangle,
  Navigation
} from 'lucide-react';
import { DeliveryRecord } from '../types';
import { ApiDashboardStats } from '../api';
import { screenKeyForCategory } from '../screenRouting';

interface Props {
  stats: Extract<ApiDashboardStats, { role: 'LOGISTICS' }> | null;
  deliveryRecords: DeliveryRecord[];
  onNavigate: (screen: string, item_id?: string) => void;
  onRefresh?: () => void;
}

export default function LogisticsDashboard({ stats, deliveryRecords, onNavigate, onRefresh }: Props) {
  const today = new Date().toISOString().split('T')[0];

  // Derive lists from deliveryRecords (already filtered to Logistics-visible records by API)
  const unassignedRecords = deliveryRecords.filter(r => !r.driver && r.status !== 'Delivered');
  const onHoldRecords = deliveryRecords.filter(r => r.status === 'On-Hold');
  const rescheduledRecords = deliveryRecords.filter(r => r.status === 'Rescheduled');

  // Drivers currently out: assigned, today's date, not yet accomplished
  const driversOutMap: Record<string, { driver: string; records: DeliveryRecord[] }> = {};
  for (const r of deliveryRecords) {
    if (r.driver && r.delivery_date === today && r.status !== 'Delivered') {
      if (!driversOutMap[r.driver]) driversOutMap[r.driver] = { driver: r.driver, records: [] };
      driversOutMap[r.driver].records.push(r);
    }
  }
  const driversOut = Object.values(driversOutMap);

  const assignedToday = stats?.assigned_today ?? deliveryRecords.filter(r => r.driver && r.delivery_date === today && r.status !== 'Delivered').length;
  const unassignedCount = stats?.unassigned_count ?? unassignedRecords.length;
  const completedToday = stats?.completed_today ?? 0;
  const onHoldRescheduled = stats?.on_hold_rescheduled ?? (onHoldRecords.length + rescheduledRecords.length);

  return (
    <div className="space-y-6" id="logistics-dashboard">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-[#1F3864] to-[#122B4F] text-white p-6 rounded-xl shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4 border-l-8 border-l-[#0078C1]">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] bg-[#0078C1] text-white font-extrabold px-2 py-0.5 rounded tracking-widest uppercase">LOGISTICS</span>
            <span className="text-sm text-slate-200 font-bold tracking-wider uppercase">Dispatch Operations</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-black tracking-tight mt-1">Logistics Command Center</h1>
          <p className="text-slate-300 text-sm mt-1 font-medium">
            Driver assignments, delivery status, and daily dispatch overview.
          </p>
        </div>
        <div className="flex items-center gap-2 bg-black/20 px-4 py-2.5 rounded-lg border border-white/10 text-xs font-bold">
          <Truck className="w-4 h-4 text-[#0078C1]" />
          <span>Today: <span className="text-[#0078C1] font-extrabold">{today}</span></span>
        </div>
        {onRefresh && (
          <button onClick={onRefresh} className="flex items-center gap-1.5 bg-black/20 hover:bg-black/30 px-3 py-2 rounded-lg border border-white/10 text-xs font-bold text-white transition-colors cursor-pointer">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Assigned Today */}
        <div
          className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between gap-3 hover:border-[#1F3864] transition-all cursor-pointer"
          onClick={() => onNavigate('deliveries')}
        >
          <div className="min-w-0">
            <p className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">Assigned to Drivers Today</p>
            <h3 className="text-3xl font-black text-slate-900 mt-1">{assignedToday}</h3>
            <span className="text-xs text-slate-600 font-extrabold flex items-center gap-1 mt-2">
              Active today <ArrowRight className="w-3.5 h-3.5 shrink-0" />
            </span>
          </div>
          <div className="bg-blue-50 p-3 rounded-lg text-[#1F3864] shrink-0"><Truck className="w-6 h-6" /></div>
        </div>

        {/* Unassigned (orange — needs attention) */}
        <div
          className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm border-l-4 border-l-amber-500 flex items-center justify-between gap-3 hover:border-amber-400 transition-all cursor-pointer"
          onClick={() => onNavigate('deliveries')}
        >
          <div className="min-w-0">
            <p className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">No Driver Assigned</p>
            <h3 className="text-3xl font-black text-slate-900 mt-1">{unassignedCount}</h3>
            <span className="text-xs text-amber-600 font-extrabold flex items-center gap-1 mt-2">
              Needs driver <UserX className="w-3.5 h-3.5 shrink-0" />
            </span>
          </div>
          <div className={`p-3 rounded-lg shrink-0 ${unassignedCount > 0 ? 'bg-amber-50 text-amber-600 animate-pulse' : 'bg-gray-50 text-gray-400'}`}>
            <UserX className="w-6 h-6" />
          </div>
        </div>

        {/* Completed Today */}
        <div
          className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm border-l-4 border-l-emerald-500 flex items-center justify-between gap-3 hover:border-emerald-400 transition-all cursor-pointer"
          onClick={() => onNavigate('deliveries')}
        >
          <div className="min-w-0">
            <p className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">Deliveries Completed Today</p>
            <h3 className="text-3xl font-black text-slate-900 mt-1">{completedToday}</h3>
            <span className="text-xs text-emerald-600 font-extrabold flex items-center gap-1 mt-2">
              Accomplished <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
            </span>
          </div>
          <div className="bg-emerald-50 p-3 rounded-lg text-emerald-600 shrink-0"><CheckCircle2 className="w-6 h-6" /></div>
        </div>

        {/* On-Hold / Rescheduled */}
        <div
          className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm border-l-4 border-l-purple-500 flex items-center justify-between gap-3 hover:border-purple-400 transition-all cursor-pointer"
          onClick={() => onNavigate('deliveries')}
        >
          <div className="min-w-0">
            <p className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">On-Hold / Rescheduled</p>
            <h3 className="text-3xl font-black text-slate-900 mt-1">{onHoldRescheduled}</h3>
            <span className="text-xs text-purple-600 font-extrabold flex items-center gap-1 mt-2">
              Needs reassignment <RefreshCw className="w-3.5 h-3.5 shrink-0" />
            </span>
          </div>
          <div className="bg-purple-50 p-3 rounded-lg text-purple-600 shrink-0"><RefreshCw className="w-6 h-6" /></div>
        </div>
      </div>

      {/* Drivers Currently Out Card */}
      <div className="bg-[#1F3864] rounded-xl shadow-md p-5 border border-[#1F3864]">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Navigation className="w-5 h-5 text-[#0078C1]" />
            <h4 className="text-sm font-black text-white uppercase tracking-wider">Drivers Currently Out for Delivery</h4>
          </div>
          <span className="bg-[#0078C1] text-white text-[10px] font-bold px-2.5 py-1 rounded-full">
            {driversOut.length} driver{driversOut.length !== 1 ? 's' : ''} active
          </span>
        </div>

        {driversOut.length === 0 ? (
          <p className="text-white/50 text-sm font-semibold text-center py-4">
            No drivers currently assigned to today's deliveries.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {driversOut.map(({ driver, records }) => (
              <div key={driver} className="bg-white/10 rounded-lg p-3 border border-white/10">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-7 h-7 rounded-full bg-[#0078C1] flex items-center justify-center text-white text-[10px] font-black shrink-0">
                    {driver.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()}
                  </div>
                  <span className="text-white font-bold text-xs truncate">{driver}</span>
                </div>
                <p className="text-white/60 text-[10px] font-bold uppercase tracking-wide mb-1.5">
                  {records.length} active deliver{records.length !== 1 ? 'ies' : 'y'}
                </p>
                <div className="space-y-1">
                  {records.slice(0, 3).map(r => (
                    <button
                      key={r.id}
                      onClick={() => onNavigate(screenKeyForCategory(r.category), r.id)}
                      className="block w-full text-left text-[10px] text-white/70 hover:text-white font-mono truncate cursor-pointer"
                    >
                      {r.id} · {r.company_name}
                    </button>
                  ))}
                  {records.length > 3 && (
                    <p className="text-[10px] text-white/40 font-semibold">+{records.length - 3} more records</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Needs Attention Panel */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
          <h4 className="text-sm font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" /> Needs Attention
          </h4>
          <button
            onClick={() => onNavigate('deliveries')}
            className="bg-amber-100 hover:bg-amber-200 text-amber-800 text-xs px-2.5 py-0.5 rounded font-extrabold uppercase tracking-wide cursor-pointer hover:underline transition-colors"
          >
            {unassignedRecords.length + onHoldRecords.length + rescheduledRecords.length} Flags
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Unassigned */}
          <div className="border border-slate-200 rounded-lg p-3 space-y-2 flex flex-col">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
              <UserX className="w-3.5 h-3.5 text-amber-500 shrink-0" /> Unassigned Records
            </span>
            <p className="text-2xl font-black text-slate-900">{unassignedRecords.length}</p>
            <p className="text-[11px] text-slate-400 font-medium flex-1">Records with no driver assigned yet.</p>
            <button
              onClick={() => onNavigate('deliveries')}
              className="text-[10px] text-[#0078C1] hover:underline font-bold uppercase tracking-wide cursor-pointer text-left"
            >
              View records →
            </button>
          </div>

          {/* On-Hold */}
          <div className="border border-slate-200 rounded-lg p-3 space-y-2 flex flex-col">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
              <PauseCircle className="w-3.5 h-3.5 text-red-500 shrink-0" /> On-Hold Items
            </span>
            <p className="text-2xl font-black text-slate-900">{onHoldRecords.length}</p>
            <p className="text-[11px] text-slate-400 font-medium flex-1">Deliveries currently blocked.</p>
            <button
              onClick={() => onNavigate('deliveries')}
              className="text-[10px] text-[#0078C1] hover:underline font-bold uppercase tracking-wide cursor-pointer text-left"
            >
              View records →
            </button>
          </div>

          {/* Rescheduled */}
          <div className="border border-slate-200 rounded-lg p-3 space-y-2 flex flex-col">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
              <RefreshCw className="w-3.5 h-3.5 text-purple-500 shrink-0" /> Rescheduled Items
            </span>
            <p className="text-2xl font-black text-slate-900">{rescheduledRecords.length}</p>
            <p className="text-[11px] text-slate-400 font-medium flex-1">Bumped to a new delivery date.</p>
            <button
              onClick={() => onNavigate('deliveries')}
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
