import React, { useState } from 'react';
import { Truck, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import { DeliveryRecord } from '../types';
import { DRIVERS, DRIVER_COVERAGE } from '../data';

function splitDriversByArea(recordArea: string): { matched: string[]; others: string[] } {
  const area = recordArea.toLowerCase();
  const matched = DRIVERS.filter(d =>
    (DRIVER_COVERAGE[d] ?? []).some(kw => area.includes(kw.toLowerCase()))
  );
  return { matched, others: DRIVERS.filter(d => !matched.includes(d)) };
}

interface Props {
  records: DeliveryRecord[];
  onNavigate: (screen: string, item_id?: string) => void;
  onUpdateRecord: (id: string, updates: Partial<DeliveryRecord>) => void;
  currentUserName: string;
}

const CATEGORY_SCREEN: Record<string, string> = {
  'Deliveries':            'deliveries',
  'RMA':                   'rma',
  'Accounting Collection': 'accounting_collection',
  'Procurement Pick-up':  'procurement_pickup',
  'Sales Orders':          'sales_orders'
};

const STATUS_COLOR: Record<string, string> = {
  Delivered:   'bg-emerald-100 text-emerald-700 border-emerald-200',
  Scheduled:   'bg-blue-100 text-blue-700 border-blue-200',
  Pending:     'bg-amber-100 text-amber-700 border-amber-200',
  'On-Hold':   'bg-red-100 text-red-700 border-red-200',
  Rescheduled: 'bg-purple-100 text-purple-700 border-purple-200'
};

function initials(name: string) {
  return name.split(/\s+/).map(p => p[0]).join('').slice(0, 2).toUpperCase();
}

interface CardProps {
  record: DeliveryRecord;
  onNavigate: (screen: string, id?: string) => void;
  onAssign: (id: string, driver: string) => void;
  currentUserName: string;
}

const RecordCard: React.FC<CardProps> = function RecordCard({ record, onNavigate, onAssign, currentUserName }) {
  const [showAssign, setShowAssign] = useState(false);

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-3 space-y-2 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-2">
        <button
          onClick={() => onNavigate(CATEGORY_SCREEN[record.category] ?? 'deliveries', record.id)}
          className="text-left min-w-0 cursor-pointer"
        >
          <p className="font-mono text-[10px] text-slate-400">{record.reference}</p>
          <p className="font-bold text-xs text-slate-900 leading-tight truncate">{record.company_name}</p>
        </button>
        <span className={`text-[9px] font-bold border px-1.5 py-0.5 rounded-full shrink-0 ${STATUS_COLOR[record.status] ?? 'bg-slate-100 text-slate-600 border-slate-200'}`}>
          {record.status}
        </span>
      </div>
      <div className="text-[10px] text-slate-500 space-y-0.5">
        <p>{record.delivery_date} · {record.area}</p>
        <p className="capitalize">{record.category}</p>
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-2">
        {showAssign ? (
          <select
            autoFocus
            defaultValue={record.driver}
            onBlur={() => setShowAssign(false)}
            onChange={e => { onAssign(record.id, e.target.value); setShowAssign(false); }}
            className="flex-1 text-[11px] border border-slate-300 rounded px-1.5 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-[#0078C1]/30"
          >
            <option value="">-- Unassigned --</option>
            {(() => {
              const { matched, others } = record.area ? splitDriversByArea(record.area) : { matched: [], others: DRIVERS };
              return (
                <>
                  {matched.length > 0 && (
                    <optgroup label="✓ Match">
                      {matched.map(d => <option key={d} value={d}>{d}</option>)}
                    </optgroup>
                  )}
                  {others.length > 0 && (
                    <optgroup label={matched.length > 0 ? 'Others' : 'Drivers'}>
                      {others.map(d => <option key={d} value={d}>{d}</option>)}
                    </optgroup>
                  )}
                </>
              );
            })()}
          </select>
        ) : (
          <>
            <span className={`text-[10px] font-semibold ${record.driver ? 'text-slate-700' : 'text-amber-600 italic'}`}>
              {record.driver || 'Unassigned'}
            </span>
            <button
              onClick={() => setShowAssign(true)}
              className="text-[9px] font-bold text-[#0078C1] hover:underline cursor-pointer"
            >
              Reassign
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function DriverBoard({ records, onNavigate, onUpdateRecord, currentUserName }: Props) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [areaFilter, setAreaFilter] = useState<string>('All');

  // Active (non-Delivered) records only for the board
  const activeRecords = records.filter(r => r.status !== 'Delivered');

  // Collect distinct areas for filter chips
  const allAreas = ['All', ...Array.from(new Set(activeRecords.map(r => r.area).filter(Boolean))).sort()];

  // Apply area filter
  const filteredRecords = areaFilter === 'All'
    ? activeRecords
    : activeRecords.filter(r => r.area === areaFilter);

  // Group by driver; unassigned first
  const unassigned = filteredRecords.filter(r => !r.driver);
  const byDriver: Record<string, DeliveryRecord[]> = {};
  for (const r of filteredRecords.filter(r => r.driver)) {
    if (!byDriver[r.driver]) byDriver[r.driver] = [];
    byDriver[r.driver].push(r);
  }

  const handleAssign = (id: string, driver: string) => {
    onUpdateRecord(id, {
      driver,
      remarks: driver ? `Driver assigned: ${driver}` : 'Driver unassigned',
      modified_by: `${currentUserName} (Logistics)`,
      modified_at: new Date().toISOString()
    } as any);
  };

  const toggleCol = (key: string) => setCollapsed(prev => ({ ...prev, [key]: !prev[key] }));

  const columns = [
    { key: '__unassigned__', label: 'Unassigned', items: unassigned, accent: 'border-t-amber-400', headerBg: 'bg-amber-50' },
    ...Object.entries(byDriver).map(([driver, items]) => ({
      key: driver,
      label: driver,
      items,
      accent: 'border-t-[#0078C1]',
      headerBg: 'bg-blue-50'
    }))
  ];

  return (
    <div className="space-y-5" id="driver-board-view">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Driver Assignment Board</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Active records grouped by driver — {unassigned.length} unassigned, {filteredRecords.length} shown
            {areaFilter !== 'All' ? ` (${activeRecords.length} total)` : ''}
          </p>
        </div>
        {unassigned.length > 0 && (
          <div className="flex items-center gap-1.5 text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg text-[11px] font-bold">
            <AlertTriangle className="w-3.5 h-3.5" />
            {unassigned.length} need driver
          </div>
        )}
      </div>

      {/* Area filter chips */}
      <div className="flex flex-wrap gap-2">
        {allAreas.map(area => (
          <button
            key={area}
            onClick={() => setAreaFilter(area)}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-all cursor-pointer ${
              areaFilter === area
                ? 'bg-[#1F3864] text-white border-[#1F3864]'
                : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
            }`}
          >
            {area}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto pb-4">
        <div className="flex gap-4 min-w-max">
          {columns.map(col => (
            <div key={col.key} className={`w-64 shrink-0 rounded-xl border border-slate-200 overflow-hidden shadow-sm border-t-4 ${col.accent}`}>
              {/* Column header */}
              <div className={`px-3 py-2.5 ${col.headerBg} flex items-center justify-between`}>
                <div className="flex items-center gap-2">
                  {col.key === '__unassigned__'
                    ? <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                    : (
                      <div className="w-6 h-6 rounded-full bg-[#1F3864] text-white text-[9px] font-black flex items-center justify-center">
                        {initials(col.label)}
                      </div>
                    )
                  }
                  <span className="text-[11px] font-bold text-slate-800 truncate max-w-[140px]">{col.label}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="bg-white text-slate-700 text-[9px] font-black border border-slate-200 px-1.5 py-0.5 rounded-full">
                    {col.items.length}
                  </span>
                  <button onClick={() => toggleCol(col.key)} className="p-0.5 text-slate-400 hover:text-slate-700 cursor-pointer">
                    {collapsed[col.key] ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
                  </button>
                </div>
              </div>

              {/* Cards */}
              {!collapsed[col.key] && (
                <div className="p-2 space-y-2 bg-slate-50 min-h-[120px] max-h-[calc(100vh-280px)] overflow-y-auto">
                  {col.items.length === 0 ? (
                    <div className="flex items-center justify-center h-20">
                      <div className="text-center">
                        <Truck className="w-5 h-5 text-slate-300 mx-auto mb-1" />
                        <p className="text-[10px] text-slate-400">No records</p>
                      </div>
                    </div>
                  ) : (
                    col.items.map(r => (
                      <RecordCard
                        key={r.id}
                        record={r}
                        onNavigate={onNavigate}
                        onAssign={handleAssign}
                        currentUserName={currentUserName}
                      />
                    ))
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
