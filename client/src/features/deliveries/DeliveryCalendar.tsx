import RecordStatus from '@/components/RecordStatus';
import { manilaToday } from '@/utils/recordLifecycle';
import { useState } from 'react';
import { ChevronLeft, ChevronRight, Truck, X } from 'lucide-react';
import { DeliveryRecord } from '@/types';

import { usePagedRecordsQuery } from '@/api/queries/useRecordsQuery';
import { useCalendarCountsQuery } from '@/api/queries/useOperationalViews';
import { useClampRecordPage } from '@/api/queries/useOperationalViews';
import RecordPageControls from '@/components/RecordPageControls';
import { recordLabel } from '../../utils/recordLabel';
import { CALENDAR_LEGEND_STATUSES, statusChipClass, statusDotClass } from '@/utils/statusTheme';

interface Props {
  records: DeliveryRecord[];
  onNavigate: (screen: string, item_id?: string) => void;
}

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


  const goToToday = () => {
    setYear(todayYear);
    setMonth(todayMonth - 1);
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
          {CALENDAR_LEGEND_STATUSES.map(({ key, label }) => (
            <div key={key} className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
              <span className={`w-2.5 h-2.5 rounded-full ${statusDotClass(key)}`} /> {label}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={goToToday}
            className="h-9 px-3 rounded-lg bg-white hover:bg-slate-50 border border-slate-200 text-xs font-medium text-slate-700 transition-colors cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue"
          >
            Today
          </button>
          <button
            type="button"
            onClick={prevMonth}
            aria-label="Previous month"
            className="h-9 w-9 inline-flex items-center justify-center rounded-lg bg-white hover:bg-slate-50 border border-slate-200 text-slate-600 transition-colors cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-semibold text-slate-900 min-w-[150px] text-center">{monthLabel}</span>
          <button
            type="button"
            onClick={nextMonth}
            aria-label="Next month"
            className="h-9 w-9 inline-flex items-center justify-center rounded-lg bg-white hover:bg-slate-50 border border-slate-200 text-slate-600 transition-colors cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue"
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
            <div key={d} className="py-2 text-center text-xs font-semibold text-slate-600 uppercase tracking-wide">
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
                <div className={`text-xs font-bold mb-1 w-6 h-6 flex items-center justify-center rounded-full ${
                  isToday ? 'bg-brand-blue text-white' : 'text-slate-600'
                }`}>
                  {day}
                </div>
                <div className="space-y-0.5">
                  {dayStatuses.slice(0, MAX_SHOW).map(([status, count]) => <div key={status}
                    className={`flex items-center gap-1 rounded px-1 py-0.5 ${statusChipClass(status)}`}>
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusDotClass(status)}`} />
                    <span className="text-xs font-medium tabular-nums truncate">{status}: {count}</span>
                  </div>)}
                  {dayTotal > 0 && <div className="text-xs text-slate-500 font-medium tabular-nums pl-1">{dayTotal} records · View all</div>}

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
                <Truck className="w-4 h-4 text-brand-blue" />
                <span className="font-bold text-slate-900 text-sm">{dayPopup.date}</span>
                <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-semibold">
                  {dayQuery.data?.total ?? 0} record{dayQuery.data?.total !== 1 ? 's' : ''}
                </span>
              </div>
              <button type="button" onClick={() => setDayPopup(null)} aria-label="Close day summary" className="text-slate-500 hover:text-slate-800 p-1 rounded cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
              {(dayQuery.data?.rows ?? []).map(r => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => { onNavigate(CATEGORY_SCREEN[r.category] ?? 'deliveries', r.id); setDayPopup(null); }}
                  className="w-full text-left flex items-start gap-3 px-5 py-3.5 hover:bg-blue-50 transition-colors cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-brand-blue"
                >
                  <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${statusDotClass(r.status)}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="tabular-nums text-xs font-semibold text-brand-navy">{recordLabel(r)}</span>
                      <span className="text-xs text-slate-500">{r.category}</span>
                    </div>
                    <p className="text-sm font-semibold text-slate-900 truncate">{r.company_name}</p>
                    <p className="text-xs text-slate-600 mt-0.5">
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
