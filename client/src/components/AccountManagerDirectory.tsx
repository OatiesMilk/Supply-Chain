import { useState } from 'react';
import { Users, TrendingUp, CheckCircle2, Clock, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import { DeliveryRecord } from '../types';

interface Props {
  records: DeliveryRecord[];
  onNavigate: (screen: string, item_id?: string) => void;
}

interface AmStats {
  name: string;
  total: number;
  delivered: number;
  pending: number;
  onHold: number;
  rescheduled: number;
  scheduled: number;
  companies: Set<string>;
  records: DeliveryRecord[];
}

const CATEGORY_SCREEN: Record<string, string> = {
  'Deliveries':            'deliveries',
  'RMA':                   'rma',
  'Accounting Collection': 'accounting_collection',
  'Procurement Pick-up':  'procurement_pickup',
  'Sales Orders':          'sales_orders'
};

function initials(name: string) {
  return name.split(/\s+/).map(p => p[0]).join('').slice(0, 2).toUpperCase();
}

export default function AccountManagerDirectory({ records, onNavigate }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'name' | 'total' | 'delivered'>('total');

  // Aggregate per AM
  const amMap: Record<string, AmStats> = {};
  for (const r of records) {
    const am = r.account_manager || 'Unknown';
    if (!amMap[am]) {
      amMap[am] = { name: am, total: 0, delivered: 0, pending: 0, onHold: 0, rescheduled: 0, scheduled: 0, companies: new Set(), records: [] };
    }
    const s = amMap[am];
    s.total++;
    s.records.push(r);
    s.companies.add(r.company_name);
    if (r.status === 'Delivered')    s.delivered++;
    else if (r.status === 'Pending') s.pending++;
    else if (r.status === 'On-Hold') s.onHold++;
    else if (r.status === 'Rescheduled') s.rescheduled++;
    else if (r.status === 'Scheduled')   s.scheduled++;
  }

  const ams = Object.values(amMap).sort((a, b) => {
    if (sortBy === 'name')      return a.name.localeCompare(b.name);
    if (sortBy === 'delivered') return b.delivered - a.delivered;
    return b.total - a.total;
  });

  const totalAMs = ams.length;
  const totalDelivered = ams.reduce((s, a) => s + a.delivered, 0);
  const totalPending   = ams.reduce((s, a) => s + a.pending, 0);
  const totalOnHold    = ams.reduce((s, a) => s + a.onHold, 0);

  return (
    <div className="space-y-6" id="am-directory-view">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Account Manager Directory</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {totalAMs} active account managers · derived from current delivery records
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-slate-500 font-bold uppercase tracking-wider">Sort by:</span>
          {(['total', 'delivered', 'name'] as const).map(s => (
            <button
              key={s}
              onClick={() => setSortBy(s)}
              className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider border transition-all cursor-pointer ${
                sortBy === s
                  ? 'bg-[#0078C1] text-white border-[#0078C1]'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Account Managers', value: totalAMs, icon: Users, color: 'text-[#0078C1]', bg: 'bg-blue-50' },
          { label: 'Delivered', value: totalDelivered, icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Pending', value: totalPending, icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50' },
          { label: 'On-Hold', value: totalOnHold, icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50' }
        ].map(kpi => (
          <div key={kpi.label} className={`${kpi.bg} rounded-xl p-4 border border-white shadow-sm`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{kpi.label}</span>
              <kpi.icon className={`w-4 h-4 ${kpi.color}`} />
            </div>
            <p className={`text-2xl font-black ${kpi.color}`}>{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* AM Cards */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {ams.map(am => {
          const isExpanded = expanded === am.name;
          const deliveryRate = am.total > 0 ? Math.round((am.delivered / am.total) * 100) : 0;
          return (
            <div key={am.name} className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
              {/* Card header */}
              <button
                onClick={() => setExpanded(isExpanded ? null : am.name)}
                className="w-full flex items-center gap-4 px-6 py-5 hover:bg-slate-50 transition-colors cursor-pointer text-left"
              >
                <div className="w-12 h-12 rounded-xl bg-[#1F3864] text-white font-black text-base flex items-center justify-center shrink-0">
                  {initials(am.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-black text-slate-900 text-base">{am.name}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{am.companies.size} compan{am.companies.size === 1 ? 'y' : 'ies'} · {am.total} records</p>
                </div>

                {/* Mini stats — always visible */}
                <div className="flex items-center gap-5 text-center shrink-0">
                  <div>
                    <p className="text-xl font-black text-slate-900">{am.total}</p>
                    <p className="text-[10px] text-slate-400 font-bold uppercase">Total</p>
                  </div>
                  <div>
                    <p className="text-xl font-black text-emerald-600">{am.delivered}</p>
                    <p className="text-[10px] text-slate-400 font-bold uppercase">Done</p>
                  </div>
                  <div>
                    <p className="text-xl font-black text-amber-600">{am.pending + am.scheduled}</p>
                    <p className="text-[10px] text-slate-400 font-bold uppercase">Active</p>
                  </div>
                  {am.onHold > 0 && (
                    <div>
                      <p className="text-xl font-black text-red-600">{am.onHold}</p>
                      <p className="text-[10px] text-slate-400 font-bold uppercase">On-Hold</p>
                    </div>
                  )}
                </div>

                <div className="ml-2 text-slate-400 shrink-0">
                  {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </div>
              </button>

              {/* Delivery rate bar — always shown below header */}
              <div className="px-6 pb-4 flex items-center gap-3">
                <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 rounded-full transition-all"
                    style={{ width: `${deliveryRate}%` }}
                  />
                </div>
                <span className="text-xs font-bold text-slate-600 shrink-0">{deliveryRate}% delivered</span>
              </div>

              {/* Expanded record list */}
              {isExpanded && (
                <div className="border-t border-slate-100 bg-slate-50">
                  <div className="px-6 py-2.5 flex items-center gap-2 border-b border-slate-100">
                    <TrendingUp className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-xs font-black text-slate-500 uppercase tracking-widest">
                      All Records ({am.records.length})
                    </span>
                  </div>
                  <div className="max-h-64 overflow-y-auto divide-y divide-slate-100">
                    {am.records
                      .sort((a, b) => b.delivery_date.localeCompare(a.delivery_date))
                      .map(r => (
                        <button
                          key={r.id}
                          onClick={() => onNavigate(CATEGORY_SCREEN[r.category] ?? 'deliveries', r.id)}
                          className="w-full text-left flex items-center gap-3 px-6 py-3 hover:bg-blue-50 transition-colors cursor-pointer"
                        >
                          <span className="font-mono text-xs font-bold text-slate-500 w-28 shrink-0">{r.id}</span>
                          <span className="text-sm font-semibold text-slate-800 truncate flex-1">{r.company_name}</span>
                          <span className="text-xs text-slate-400 hidden sm:inline font-medium">{r.delivery_date}</span>
                          <span className={`text-[10px] font-bold border px-2 py-0.5 rounded-full shrink-0 ${
                            r.status === 'Delivered'   ? 'bg-emerald-100 text-emerald-700 border-emerald-200' :
                            r.status === 'Pending'     ? 'bg-amber-100 text-amber-700 border-amber-200' :
                            r.status === 'On-Hold'     ? 'bg-red-100 text-red-700 border-red-200' :
                            r.status === 'Rescheduled' ? 'bg-purple-100 text-purple-700 border-purple-200' :
                            'bg-blue-100 text-blue-700 border-blue-200'
                          }`}>
                            {r.status}
                          </span>
                        </button>
                      ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {ams.length === 0 && (
          <div className="text-center py-16">
            <Users className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-semibold">No account managers found in records</p>
          </div>
        )}
      </div>
    </div>
  );
}
