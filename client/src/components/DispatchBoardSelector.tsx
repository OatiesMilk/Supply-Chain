import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, Truck, X, Loader2 } from 'lucide-react';
import { DRIVERS, DRIVER_COVERAGE } from '../data';

function driversForArea(recordArea: string): { matched: string[]; others: string[] } {
  const area = recordArea.toLowerCase();
  const matched = DRIVERS.filter(d =>
    (DRIVER_COVERAGE[d] ?? []).some(kw => area.includes(kw.toLowerCase()))
  );
  const others = DRIVERS.filter(d => !matched.includes(d));
  return { matched, others };
}

const CATEGORY_ORDER: { label: string; badge: string }[] = [
  { label: 'Sales Orders',          badge: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
  { label: 'Procurement Pick-up',   badge: 'bg-amber-100 text-amber-700 border-amber-200'   },
  { label: 'Deliveries',            badge: 'bg-blue-100 text-blue-700 border-blue-200'       },
  { label: 'RMA',                   badge: 'bg-purple-100 text-purple-700 border-purple-200' },
  { label: 'Accounting Collection', badge: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
];

interface DeliveryItem {
  id: string;
  record_id?: string;
  company_name?: string;
  category: string;
  driver?: string;
  status?: string;
  delivery_date?: string;
  reference?: string;
  area?: string;
  is_draft?: string;
}

interface Props {
  records: DeliveryItem[]
  onUpdateRecord: (id: string, data: Record<string, unknown>) => Promise<unknown>;
  currentUserName: string;
}

export default function DispatchBoardSelector({ records, onUpdateRecord, currentUserName }: Props) {
  const [selectedId, setSelectedId] = useState<string>('');
  const [assignDriver, setAssignDriver] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const active = records.filter(r => r.is_draft !== 'Yes');
  const unassigned = active.filter(r => !r.driver || !r.driver.trim()).length;

  const groups = CATEGORY_ORDER.map(cat => ({
    ...cat,
    items: active.filter(r => r.category === cat.label),
  })).filter(g => g.items.length > 0);

  const selected = active.find(r => r.id === selectedId) ?? null;

  const handleSelect = (e: React.ChangeEvent<HTMLSelectElement>): void => {
    setSelectedId(e.target.value);
    setAssignDriver('');
    setBanner(null);
  };

  const handleAssign = async () => {
    if (!selected || !assignDriver.trim()) return;
    setAssigning(true);
    setBanner(null);
    try {
      await onUpdateRecord(selected.id, { driver: assignDriver, remarks: `Driver assigned: ${assignDriver}` });
      setBanner({ type: 'success', msg: `${assignDriver} assigned to ${selected.record_id ?? selected.id}.` });
      setAssignDriver('');
    } catch {
      setBanner({ type: 'error', msg: 'Assignment failed. Please try again.' });
    } finally {
      setAssigning(false);
    }
  };

  const handleClear = () => {
    setSelectedId('');
    setAssignDriver('');
    setBanner(null);
  };

  const catBadge = (categoryLabel: string) =>
    CATEGORY_ORDER.find(c => c.label === categoryLabel)?.badge ?? 'bg-slate-100 text-slate-600 border-slate-200';

  const hasDriver = !!selected?.driver?.trim();

  return (
    <div className="space-y-4 max-w-2xl">
      {/* Warning banner */}
      {unassigned > 0 && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-300 rounded-lg px-4 py-3">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
          <p className="text-xs font-bold text-amber-800">
            {unassigned} record{unassigned !== 1 ? 's' : ''} still need{unassigned === 1 ? 's' : ''} a driver assigned
          </p>
        </div>
      )}

      {/* Record selector */}
      <div>
        <label className="text-[10px] font-black text-slate-600 uppercase tracking-wider block mb-1.5">
          Select Record
        </label>
        <select
          value={selectedId}
          onChange={handleSelect}
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[#0078C1]/30 focus:border-[#0078C1] bg-white"
        >
          <option value="">— choose a record —</option>
          {groups.map(g => (
            <optgroup key={g.label} label={g.label}>
              {g.items.map(r => (
                <option key={r.id} value={r.id}>
                  {r.record_id ?? r.id} — {r.company_name ?? ''}
                  {r.driver ? ` ✓ ${r.driver}` : '  (unassigned)'}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      {/* Detail panel */}
      {selected && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          {/* Header row */}
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-0.5">Record</p>
              <p className="text-base font-black text-slate-800">{selected.record_id ?? selected.id}</p>
            </div>
            <button
              onClick={handleClear}
              className="text-slate-400 hover:text-slate-600 transition-colors cursor-pointer mt-0.5"
              aria-label="Clear selection"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-0.5">Customer</p>
              <p className="font-bold text-slate-700">{selected.company_name ?? '—'}</p>
            </div>
            <div>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-0.5">Type</p>
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black border ${catBadge(selected.category)}`}>
                {selected.category}
              </span>
            </div>
            <div>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-0.5">Delivery Date</p>
              <p className="font-bold text-slate-700">{selected.delivery_date ?? '—'}</p>
            </div>
            <div>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-0.5">Area</p>
              <p className="font-bold text-slate-700">{selected.area ?? '—'}</p>
            </div>
            <div>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-0.5">Driver Assigned</p>
              {hasDriver
                ? <p className="font-bold text-slate-700">{selected.driver}</p>
                : <span className="inline-flex items-center gap-1 text-amber-700 font-black">
                    <AlertTriangle className="w-3 h-3" /> None
                  </span>
              }
            </div>
            <div>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-0.5">Status</p>
              <p className="font-bold text-slate-700">{selected.status ?? '—'}</p>
            </div>
          </div>

          {/* Assign driver */}
          <div className="border-t border-slate-100 pt-4 space-y-3">
            <label className="text-[10px] font-black text-slate-600 uppercase tracking-wider block">
              Assign Driver
            </label>
            {(() => {
              const { matched, others } = selected?.area
                ? driversForArea(selected.area)
                : { matched: [], others: DRIVERS };
              return (
                <select
                  value={assignDriver}
                  onChange={e => setAssignDriver(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[#0078C1]/30 focus:border-[#0078C1] bg-white"
                >
                  <option value="">— select driver —</option>
                  {matched.length > 0 && (
                    <optgroup label="✓ Coverage Match">
                      {matched.map(d => <option key={d} value={d}>{d}</option>)}
                    </optgroup>
                  )}
                  {others.length > 0 && (
                    <optgroup label={matched.length > 0 ? 'Other Drivers' : 'All Drivers'}>
                      {others.map(d => <option key={d} value={d}>{d}</option>)}
                    </optgroup>
                  )}
                </select>
              );
            })()}

            <div className="flex items-center gap-2">
              <button
                onClick={handleAssign}
                disabled={!assignDriver.trim() || assigning}
                className="flex items-center gap-1.5 px-4 py-2 bg-[#1F3864] hover:bg-[#0078C1] text-white text-xs font-bold rounded-lg transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {assigning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Truck className="w-3.5 h-3.5" />}
                Assign Driver
              </button>
              <button
                onClick={handleClear}
                className="px-4 py-2 border border-slate-300 text-slate-600 hover:bg-slate-50 text-xs font-bold rounded-lg transition-colors cursor-pointer"
              >
                Clear
              </button>
            </div>
          </div>

          {/* Feedback */}
          {banner && (
            <div className={`flex items-center gap-2 rounded-lg px-3 py-2.5 ${
              banner.type === 'success'
                ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                : 'bg-red-50 border border-red-200 text-red-800'
            }`}>
              {banner.type === 'success'
                ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                : <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />
              }
              <p className="text-[11px] font-bold">{banner.msg}</p>
            </div>
          )}
        </div>
      )}

      {!selected && active.length === 0 && (
        <div className="text-center py-10 text-slate-400">
          <Truck className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p className="text-xs font-bold">No records available</p>
        </div>
      )}
    </div>
  );
}
