import {
  RotateCcw,
  Clock,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ShieldCheck,
  PackageSearch,
  RotateCw,
} from 'lucide-react';
import { DeliveryRecord } from '../types';
import { ApiDashboardStats } from '../api';

interface Props {
  stats: Extract<ApiDashboardStats, { role: 'TASS' }> | null;
  deliveryRecords: DeliveryRecord[];
  onNavigate: (screen: string, item_id?: string) => void;
  onRefresh?: () => void;
}

function daysSince(dateStr: string): number {
  const then = new Date(dateStr).getTime();
  return Math.floor((Date.now() - then) / (1000 * 60 * 60 * 24));
}

const STATUS_BADGE: Record<string, string> = {
  'Scheduled': 'bg-blue-50 text-blue-700 border-blue-200',
  'Pending':   'bg-amber-50 text-amber-700 border-amber-200',
  'On-Hold':   'bg-red-50 text-red-700 border-red-200',
};

export default function TassDashboard({ stats, deliveryRecords, onNavigate, onRefresh }: Props) {
  // KPI values — fall back to computing from deliveryRecords when stats haven't loaded
  const openRma = stats?.open_rma
    ?? deliveryRecords.filter(r => r.category === 'RMA' && (r.status === 'Scheduled' || r.status === 'Pending')).length;

  const rmaOnHold = stats?.rma_on_hold
    ?? deliveryRecords.filter(r => r.category === 'RMA' && r.status === 'On-Hold').length;

  const pendingProcurementPickup = stats?.pending_procurement_pickup
    ?? deliveryRecords.filter(r => r.category === 'Procurement Pick-up' && (r.status === 'Scheduled' || r.status === 'Pending')).length;

  const pendingVerification = stats?.pending_verification
    ?? deliveryRecords.filter(r => r.category === 'Accounting Collection' && r.status === 'Delivered' && !r.collection_verified).length;

  const verifiedToday = stats?.verified_today
    ?? (() => {
      const today = new Date().toISOString().split('T')[0];
      return deliveryRecords.filter(r => r.collection_verified && r.collection_verified_at?.slice(0, 10) === today).length;
    })();

  // Needs Attention table — open RMA records sorted oldest first
  const openRmaRecords = deliveryRecords
    .filter(r => r.category === 'RMA' && ['Scheduled', 'Pending', 'On-Hold'].includes(r.status))
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  return (
    <div className="space-y-6" id="tass-dashboard">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-[#1F3864] to-[#122B4F] text-white p-6 rounded-xl shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4 border-l-8 border-l-blue-400">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] bg-blue-600 text-white font-extrabold px-2 py-0.5 rounded tracking-widest uppercase">TASS</span>
            <span className="text-sm text-slate-200 font-bold tracking-wider uppercase">Technical Admin Shared Services</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-black tracking-tight mt-1">Technical Operations</h1>
          <p className="text-slate-300 text-sm mt-1 font-medium">
            Manage returns, warranty processing, and supplier coordination.
          </p>
        </div>
        <div className="flex items-center gap-2 bg-white/10 border border-white/20 rounded-md px-3 py-1.5 text-white text-sm">
          <RotateCcw className="w-4 h-4 text-blue-400" />
          <span>Role: <span className="text-blue-400 font-extrabold uppercase">TASS</span></span>
        </div>
        {onRefresh && (
          <button onClick={onRefresh} className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 border border-white/20 rounded-md px-3 py-1.5 text-white text-sm transition-colors cursor-pointer">
            <RotateCw className="w-3.5 h-3.5" /> Refresh
          </button>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Open RMA Records */}
        <div
          className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm border-l-4 border-l-blue-500 flex items-center justify-between gap-3 hover:border-blue-400 transition-all cursor-pointer"
          onClick={() => onNavigate('rma')}
        >
          <div className="min-w-0">
            <p className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">Open RMA Records</p>
            <h3 className="text-3xl font-black text-slate-900 mt-1">{openRma}</h3>
            <span className="text-xs text-blue-600 font-extrabold flex items-center gap-1 mt-2">
              View RMA <ArrowRight className="w-3.5 h-3.5 shrink-0" />
            </span>
          </div>
          <div className={`p-3 rounded-lg shrink-0 ${openRma > 0 ? 'bg-blue-50 text-blue-600' : 'bg-gray-50 text-gray-400'}`}>
            <RotateCcw className="w-6 h-6" />
          </div>
        </div>

        {/* RMA On-Hold */}
        <div
          className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm border-l-4 border-l-red-500 flex items-center justify-between gap-3 hover:border-red-400 transition-all cursor-pointer"
          onClick={() => onNavigate('rma')}
        >
          <div className="min-w-0">
            <p className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">RMA On-Hold</p>
            <h3 className="text-3xl font-black text-slate-900 mt-1">{rmaOnHold}</h3>
            <span className="text-xs text-red-600 font-extrabold flex items-center gap-1 mt-2">
              Blocked — needs action <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            </span>
          </div>
          <div className={`p-3 rounded-lg shrink-0 ${rmaOnHold > 0 ? 'bg-red-50 text-red-600 animate-pulse' : 'bg-gray-50 text-gray-400'}`}>
            <AlertTriangle className="w-6 h-6" />
          </div>
        </div>

        {/* Procurement Pick-ups Pending */}
        <div
          className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm border-l-4 border-l-purple-500 flex items-center justify-between gap-3 hover:border-purple-400 transition-all cursor-pointer"
          onClick={() => onNavigate('procurement_pickup')}
        >
          <div className="min-w-0">
            <p className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">Pick-ups Pending</p>
            <h3 className="text-3xl font-black text-slate-900 mt-1">{pendingProcurementPickup}</h3>
            <span className="text-xs text-purple-600 font-extrabold flex items-center gap-1 mt-2">
              View pick-ups <ArrowRight className="w-3.5 h-3.5 shrink-0" />
            </span>
          </div>
          <div className={`p-3 rounded-lg shrink-0 ${pendingProcurementPickup > 0 ? 'bg-purple-50 text-purple-600' : 'bg-gray-50 text-gray-400'}`}>
            <PackageSearch className="w-6 h-6" />
          </div>
        </div>

        {/* Collections Pending Verification */}
        <div
          className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm border-l-4 border-l-amber-400 flex items-center justify-between gap-3 hover:border-amber-300 transition-all cursor-pointer"
          onClick={() => onNavigate('accounting_collection')}
        >
          <div className="min-w-0">
            <p className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">Collections Pending</p>
            <h3 className="text-3xl font-black text-slate-900 mt-1">{pendingVerification}</h3>
            <span className="text-xs text-amber-600 font-extrabold flex items-center gap-1 mt-1">
              {verifiedToday > 0 ? `${verifiedToday} verified today` : 'Awaiting TASS sign-off'} <Clock className="w-3.5 h-3.5 shrink-0" />
            </span>
          </div>
          <div className={`p-3 rounded-lg shrink-0 ${pendingVerification > 0 ? 'bg-amber-50 text-amber-500' : 'bg-gray-50 text-gray-400'}`}>
            <Clock className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Needs Attention: Open RMA Records */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
          <h4 className="text-sm font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
            <RotateCcw className="w-4 h-4 text-blue-500" /> Open RMA Records — Needs Attention
          </h4>
          <span className={`text-xs px-2.5 py-0.5 rounded font-extrabold uppercase tracking-wide ${
            openRmaRecords.length > 0 ? 'bg-blue-100 text-blue-800' : 'bg-emerald-100 text-emerald-800'
          }`}>
            {openRmaRecords.length} open
          </span>
        </div>

        {openRmaRecords.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <ShieldCheck className="w-10 h-10 text-emerald-500 mb-2" />
            <p className="text-base font-bold text-slate-700">No open RMA records</p>
            <p className="text-xs text-slate-400">All return and warranty records are resolved.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  <th className="px-4 py-3 whitespace-nowrap">Record ID</th>
                  <th className="px-4 py-3">Company</th>
                  <th className="px-4 py-3">Reference</th>
                  <th className="px-4 py-3">Area</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3 text-center whitespace-nowrap">Delivery Date</th>
                  <th className="px-4 py-3 text-center whitespace-nowrap">Days Open</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {openRmaRecords.map(r => {
                  const days = daysSince(r.created_at);
                  return (
                    <tr
                      key={r.id}
                      className="hover:bg-blue-50/30 cursor-pointer transition-all"
                      onClick={() => onNavigate('rma', r.id)}
                    >
                      <td className="px-4 py-3 font-mono font-bold text-slate-900 whitespace-nowrap">{r.id}</td>
                      <td className="px-4 py-3 font-semibold text-slate-800 max-w-[180px] truncate">{r.company_name}</td>
                      <td className="px-4 py-3 font-mono text-slate-500 text-[10px]">{r.reference || '—'}</td>
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{r.area || '—'}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`border text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_BADGE[r.status] ?? 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                          {r.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center text-slate-600 font-semibold whitespace-nowrap">{r.delivery_date || '—'}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`font-black text-sm ${days > 7 ? 'text-red-600' : days > 3 ? 'text-amber-600' : 'text-slate-600'}`}>
                          {days === 0 ? 'Today' : `${days}d`}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
