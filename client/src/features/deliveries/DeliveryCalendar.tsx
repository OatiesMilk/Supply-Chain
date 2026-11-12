import RecordStatus from '@/components/RecordStatus';
import { manilaToday } from '@/utils/recordLifecycle';
import { useState } from 'react';
import { ChevronLeft, ChevronRight, Truck, X } from 'lucide-react';
import { DeliveryRecord } from '@/types';

import { usePagedRecordsQuery } from '@/api/queries/useRecordsQuery';
import { useCalendarCountsQuery } from '@/api/queries/useOperationalViews';
import { useClampRecordPage } from '@/api/queries/useOperationalViews';
import RecordPageControls from '@/components/RecordPageControls';

interface Props {
  records: DeliveryRecord[];
  onNavigate: (screen: string, item_id?: string) => void;
}

// Solid dot color (used only for the small legend/day dots — fine at full saturation
// since they're tiny). Separate from the chip background below.
const STATUS_COLOR: Record<string, string> = {
  Draft: 'bg-slate-400',
  'In Transit': 'bg-cyan-500',
  Delivered:   'bg-emerald-500',
  Scheduled:   'bg-blue-500',
  Pending:     'bg-amber-500',
  'On-Hold':   'bg-red-500',
  Rescheduled: 'bg-purple-500'
};

// Soft chip background for the per-day event rows. Written as literal
// Tailwind classes (not `${color}-500 bg-opacity-10`, a Tailwind v3 utility
// that no longer exists in v4 — it silently did nothing, leaving every chip
// rendered as a fully solid, saturated block instead of a soft tint).
const STATUS_CHIP: Record<string, string> = {
  Draft: 'bg-slate-100 text-slate-700',
  'In Transit': 'bg-cyan-50 text-cyan-700',
  Delivered:   'bg-emerald-50 text-emerald-700',
  Scheduled:   'bg-blue-50 text-blue-700',
  Pending:     'bg-amber-50 text-amber-700',
  'On-Hold':   'bg-red-50 text-red-700',
  Rescheduled: 'bg-purple-50 text-purple-700'
};

const CATEGORY_SCREEN: Record<string, string> = {
  'Deliveries':            'deliveries',
  'RMA':                   'rma',
  'Accounting Collection': 'accounting_collection',
  'Procurement Pick-up':  'procurement_pickup',
  'Sales Orders':          'sales_orders'
};

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function isoDate(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export default function DeliveryCalendar({ records, onNavigate }: Props) {
  const todayStr = manilaToday();
  const [todayYear, todayMonth] = todayStr.split("-").map(Number);
  const [year, setYear] = useState(todayYear);
  const [month, setMonth] = useState(todayMonth - 1);
  const [dayPopup, setDayPopup] = useState<{ date: string } | null>(null);
  const [dayPage, setDayPage] = useState(1);

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const startStr = isoDate(year, month, 1);
  const endStr = isoDate(year, month, daysInMonth);
  const monthQuery = useCalendarCountsQuery(startStr, endStr);
  const dayQuery = usePagedRecordsQuery({ dateFrom: dayPopup?.date, dateTo: dayPopup?.date, page: dayPage, limit: 25 }, !!dayPopup);
  useClampRecordPage(dayPage, dayQuery.data?.total, setDayPage);
  const byDate: Record<string, { date: string; total: number; statuses: Record<string, number> }> = {};
  for (const day of monthQuery.data ?? []) byDate[day.date] = day;

  const prevMonth = () => {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
  };

  const nextMonth = () => {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
  };


  const monthLabel = new Date(year, month, 1).toLocaleString('default', { month: 'long', year: 'numeric' });

  // Total cells (leading blanks + days)
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1)
  ];

  return (
    <div className="space-y-4" id="delivery-calendar-view">
      {/* Month Navigation & Legend */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-3">
          {Object.entries(STATUS_COLOR).map(([s, c]) => (
            <div key={s} className="flex items-center gap-1.5 text-[10px] font-bold text-slate-600">
              <span className={`w-2.5 h-2.5 rounded-full ${c}`} /> {s}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={prevMonth}
            className="p-2 rounded-lg hover:bg-slate-100 border border-slate-200 text-slate-600 transition-all cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-bold text-slate-800 min-w-[160px] text-center">{monthLabel}</span>
          <button
            onClick={nextMonth}
            className="p-2 rounded-lg hover:bg-slate-100 border border-slate-200 text-slate-600 transition-all cursor-pointer"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {monthQuery.isPending && <p role="status" className="text-sm text-slate-600">Loading calendar counts…</p>}
      {monthQuery.error && <p role="alert" className="text-sm text-red-700">Could not load calendar. <button type="button" className="underline" onClick={() => void monthQuery.refetch()}>Retry</button></p>}
      {/* Calendar grid */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Day-of-week header */}
        <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
          {DOW.map(d => (
            <div key={d} className="py-2 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">
              {d}
            </div>
          ))}
        </div>

        {/* Cells */}
        <div className="grid grid-cols-7 divide-x divide-y divide-slate-100">
          {cells.map((day, idx) => {
            if (day === null) {
              return <div key={`blank-${idx}`} className="min-h-[80px] bg-slate-50/50" />;
            }
            const dateStr = isoDate(year, month, day);
            const daySummary = byDate[dateStr];
            const dayTotal = daySummary?.total ?? 0;
            const dayStatuses = Object.entries(daySummary?.statuses ?? {});
            const isToday = dateStr === todayStr;
            const MAX_SHOW = 3;

            return (
              <div
                key={dateStr}
                onClick={() => { if (dayTotal > 0) { setDayPage(1); setDayPopup({ date: dateStr }); } }}
                className={`min-h-[80px] p-1.5 transition-colors ${dayTotal > 0 ? 'hover:bg-blue-50 cursor-pointer' : ''} ${isToday ? 'bg-blue-50/60' : ''}`}
              >
                <div className={`text-[11px] font-bold mb-1 w-5 h-5 flex items-center justify-center rounded-full ${
                  isToday ? 'bg-[#0078C1] text-white' : 'text-slate-500'
                }`}>
                  {day}
                </div>
                <div className="space-y-0.5">
                  {dayStatuses.slice(0, MAX_SHOW).map(([status, count]) => <div key={status}
                    className={`flex items-center gap-1 rounded px-1 py-0.5 ${STATUS_CHIP[status] ?? 'bg-slate-100 text-slate-600'}`}>
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_COLOR[status] ?? 'bg-slate-400'}`} />
                    <span className="text-[9px] font-semibold truncate">{status}: {count}</span>
                  </div>)}
                  {dayTotal > 0 && <div className="text-[9px] text-slate-500 font-bold pl-1">{dayTotal} records · View all</div>}

                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Day popup */}
      {dayPopup && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={e => { if (e.target === e.currentTarget) setDayPopup(null); }}
        >
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md max-h-[70vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <Truck className="w-4 h-4 text-[#0078C1]" />
                <span className="font-bold text-slate-900 text-sm">{dayPopup.date}</span>
                <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-bold">
                  {dayQuery.data?.total ?? 0} record{dayQuery.data?.total !== 1 ? 's' : ''}
                </span>
              </div>
              <button onClick={() => setDayPopup(null)} className="text-slate-400 hover:text-slate-700 p-1 rounded cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
              {(dayQuery.data?.rows ?? []).map(r => (
                <button
                  key={r.id}
                  onClick={() => { onNavigate(CATEGORY_SCREEN[r.category] ?? 'deliveries', r.id); setDayPopup(null); }}
                  className="w-full text-left flex items-start gap-3 px-5 py-3.5 hover:bg-blue-50 transition-colors cursor-pointer"
                >
                  <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${STATUS_COLOR[r.status] ?? 'bg-slate-400'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] font-bold text-slate-500">{r.id}</span>
                      <span className="text-[10px] text-slate-400">{r.category}</span>
                    </div>
                    <p className="text-xs font-bold text-slate-800 truncate">{r.company_name}</p>
                    <p className="text-[10px] text-slate-500">
                      {r.driver || 'No driver'} · {r.area} · <RecordStatus record={r} />
                    </p>
                  </div>
                </button>
              ))}
            </div>
            <RecordPageControls page={dayPage} total={dayQuery.data?.total ?? 0} onPageChange={setDayPage}
              loading={dayQuery.isPending} error={dayQuery.error} retry={() => void dayQuery.refetch()} />
          </div>
        </div>
      )}
    </div>
  );
}
