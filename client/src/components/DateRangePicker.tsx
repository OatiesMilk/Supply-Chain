import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import {
  autoUpdate, flip, offset, shift, size, FloatingFocusManager, FloatingPortal,
  useDismiss, useFloating, useInteractions,
} from '@floating-ui/react';
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { manilaToday } from '@/utils/recordLifecycle';
import {
  addCalendarMonths, calendarCells, calendarDate, calendarKeyboardDay, calendarPresets,
  formatCalendarRange, monthStart, orderedCalendarRange, type CalendarRange,
} from '@/utils/dateRangePicker';

interface Props {
  dateFrom: string;
  dateTo: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (range: CalendarRange) => void;
}

type Drag = {
  pointerId: number; downDay: string; anchor: string; lastDay: string; moved: boolean;
  original: CalendarRange; wasSelectingEnd: boolean;
};

const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const months = Array.from({ length: 12 }, (_, month) => new Intl.DateTimeFormat('en', { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, month, 1))));
const dayLabel = (day: string) => new Intl.DateTimeFormat('en-US', {
  weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC',
}).format(calendarDate(day));
const monthLabel = (month: string) => new Intl.DateTimeFormat('en-US', {
  month: 'long', year: 'numeric', timeZone: 'UTC',
}).format(calendarDate(month));
const focusClass = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0078C1]';

/** Draft selection stays local until Apply; closing the popover cancels it. */
export default function DateRangePicker({ dateFrom, dateTo, open, onOpenChange, onChange }: Props) {
  const id = useId();
  const today = manilaToday();
  const [draft, setDraft] = useState<CalendarRange>({ from: dateFrom, to: dateTo });
  const [month, setMonth] = useState(monthStart(dateFrom || dateTo || today));
  const [activeDay, setActiveDay] = useState(dateFrom || dateTo || today);
  const [selectingEnd, setSelectingEnd] = useState(false);
  const [preview, setPreview] = useState<CalendarRange | null>(null);
  const drag = useRef<Drag | null>(null);
  const pointerType = useRef('');
  const gridRef = useRef<HTMLDivElement>(null);
  const dayRefs = useRef(new Map<string, HTMLButtonElement>());
  const focusPending = useRef(false);
  const { refs, floatingStyles, context } = useFloating({
    open, onOpenChange, placement: 'bottom-start', strategy: 'fixed', whileElementsMounted: autoUpdate,
    middleware: [offset(8), flip({ padding: 12 }), shift({ padding: 12, crossAxis: true }), size({
      padding: 12,
      apply({ availableWidth, availableHeight, elements }) {
        Object.assign(elements.floating.style, {
          width: `${Math.min(660, Math.max(0, availableWidth))}px`,
          maxHeight: `${Math.max(0, availableHeight)}px`,
        });
      },
    })],
  });
  const { getReferenceProps, getFloatingProps } = useInteractions([useDismiss(context)]);

  useEffect(() => {
    drag.current = null;
    setPreview(null);
    if (!open) return;
    const initial = dateFrom || dateTo || today;
    setDraft({ from: dateFrom, to: dateTo });
    setMonth(monthStart(initial));
    setActiveDay(initial);
    setSelectingEnd(Boolean(dateFrom && !dateTo));
    focusPending.current = true;
  }, [open, dateFrom, dateTo, today]);

  useEffect(() => {
    if (!open || !focusPending.current) return;
    const frame = requestAnimationFrame(() => {
      dayRefs.current.get(activeDay)?.focus();
      focusPending.current = false;
    });
    return () => cancelAnimationFrame(frame);
  }, [open, month, activeDay]);

  const chooseDay = (day: string) => {
    setActiveDay(day);
    setPreview(null);
    if (selectingEnd && draft.from) {
      setDraft(orderedCalendarRange(draft.from, day));
      setSelectingEnd(false);
    } else {
      setDraft({ from: day, to: '' });
      setSelectingEnd(true);
    }
  };

  const dayAtPointer = (event: PointerEvent): string | null => {
    const element = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-calendar-day]');
    return element && gridRef.current?.contains(element) ? element.dataset.calendarDay ?? null : null;
  };

  const startDrag = (event: PointerEvent<HTMLButtonElement>, day: string) => {
    if (drag.current) return;
    pointerType.current = event.pointerType;
    // Touch keeps ordinary page scrolling; two taps select a range.
    if (event.pointerType === 'touch' || event.button !== 0 || !event.isPrimary) return;
    event.preventDefault();
    event.currentTarget.focus();
    drag.current = {
      pointerId: event.pointerId, downDay: day, anchor: selectingEnd && draft.from ? draft.from : day,
      lastDay: day, moved: false, original: draft, wasSelectingEnd: selectingEnd,
    };
    setPreview(orderedCalendarRange(drag.current.anchor, day));
    gridRef.current?.setPointerCapture(event.pointerId);
  };

  const moveDrag = (event: PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const day = dayAtPointer(event);
    if (!day) return;
    current.lastDay = day;
    current.moved ||= day !== current.downDay;
    setPreview(orderedCalendarRange(current.anchor, day));
  };

  const finishDrag = (event: PointerEvent<HTMLDivElement>, cancelled = false) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    drag.current = null;
    setPreview(null);
    if (gridRef.current?.hasPointerCapture(event.pointerId)) gridRef.current.releasePointerCapture(event.pointerId);
    if (cancelled) {
      setDraft(current.original);
      setSelectingEnd(current.wasSelectingEnd);
      return;
    }
    const end = dayAtPointer(event) ?? current.lastDay;
    focusPending.current = true;
    setActiveDay(end);
    if (current.moved || end !== current.downDay) {
      setDraft(orderedCalendarRange(current.anchor, end));
      setSelectingEnd(false);
    } else chooseDay(current.downDay);
  };

  const handleDayKey = (event: KeyboardEvent<HTMLButtonElement>, day: string) => {
    const next = calendarKeyboardDay(day, event.key, event.shiftKey);
    if (!next) return;
    event.preventDefault();
    focusPending.current = true;
    setActiveDay(next);
    const lastMonth = addCalendarMonths(month, 1).slice(0, 7);
    if (next.slice(0, 7) < month.slice(0, 7) || next.slice(0, 7) > lastMonth || !dayRefs.current.get(next)?.getClientRects().length) {
      setMonth(monthStart(next));
    }
  };

  const navigateMonth = (next: string) => {
    setMonth(next);
    setActiveDay(next);
    setPreview(null);
  };
  const selected = preview ?? draft;
  const rangeEnd = selected.to || selected.from;
  const year = Number(month.slice(0, 4));
  const yearStart = Math.min(Number(today.slice(0, 4)) - 100, year);
  const yearEnd = Math.max(Number(today.slice(0, 4)) + 50, year);
  const years = Array.from({ length: yearEnd - yearStart + 1 }, (_, index) => yearStart + index);

  const renderMonth = (value: string, second = false) => <div key={value} className={second ? 'hidden min-w-0 sm:block' : 'min-w-0'}>
    <h3 className="mb-3 text-center text-sm font-bold text-slate-800">{monthLabel(value)}</h3>
    <div role="grid" aria-label={monthLabel(value)} aria-multiselectable="true">
      <div role="row" className="grid grid-cols-7">
        {weekdays.map(day => <div role="columnheader" key={day} className="pb-2 text-center text-[10px] font-semibold text-slate-500">{day}</div>)}
      </div>
      {calendarCells(value).map((week, index) => <div role="row" className="grid grid-cols-7" key={index}>
        {week.map((day, column) => {
          if (!day) return <div role="gridcell" key={`empty-${column}`} />;
          const inRange = Boolean(selected.from && day >= selected.from && day <= rangeEnd);
          const endpoint = day === selected.from || day === rangeEnd;
          return <div role="gridcell" aria-selected={inRange} key={day}
            className={`${inRange ? 'bg-blue-50' : ''} ${day === selected.from ? 'rounded-l-lg' : ''} ${day === rangeEnd ? 'rounded-r-lg' : ''}`}>
            <button type="button" data-calendar-day={day} aria-label={dayLabel(day)} aria-current={day === today ? 'date' : undefined}
              ref={element => { if (element) dayRefs.current.set(day, element); else dayRefs.current.delete(day); }}
              tabIndex={activeDay === day ? 0 : -1}
              onPointerDown={event => startDrag(event, day)}
              onMouseEnter={() => { if (!drag.current && selectingEnd && draft.from) setPreview(orderedCalendarRange(draft.from, day)); }}
              onKeyDown={event => handleDayKey(event, day)}
              onClick={event => { if (event.detail === 0 || pointerType.current === 'touch') chooseDay(day); }}
              className={`relative flex min-h-10 w-full touch-manipulation select-none items-center justify-center rounded-lg text-xs font-semibold ${focusClass} ${endpoint && inRange ? 'bg-[#1F3864] text-white' : inRange ? 'text-blue-900' : 'text-slate-700 hover:bg-slate-100'} ${day === today && !inRange ? 'underline decoration-[#0078C1] underline-offset-4' : ''}`}>
              {Number(day.slice(8))}
            </button>
          </div>;
        })}
      </div>)}
    </div>
  </div>;

  return <div className="min-w-0 space-y-1">
    <label id={`${id}-label`} className="block text-xs font-bold text-slate-700">Delivery dates</label>
    <button type="button" ref={refs.setReference} {...getReferenceProps()} aria-labelledby={`${id}-label ${id}-value`}
      aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? `${id}-dialog` : undefined} onClick={() => onOpenChange(!open)}
      className={`flex min-h-10 w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs font-semibold ${focusClass} ${dateFrom || dateTo ? 'border-blue-300 bg-blue-50 text-blue-900' : 'border-slate-200 bg-white text-slate-700'}`}>
      <CalendarDays className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span id={`${id}-value`} className="min-w-0 flex-1 truncate">{formatCalendarRange(dateFrom, dateTo)}</span>
      <ChevronDown className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
    </button>
    {open && <FloatingPortal>
      <FloatingFocusManager context={context} modal={false} initialFocus={-1} returnFocus>
        <div ref={refs.setFloating} style={floatingStyles} {...getFloatingProps()} id={`${id}-dialog`} role="dialog"
          aria-labelledby={`${id}-title`} aria-describedby={`${id}-help`}
          className="z-50 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-2xl">
          <div className="flex items-center justify-between px-4 pt-3">
            <h2 id={`${id}-title`} className="text-sm font-bold text-slate-800">Select delivery dates</h2>
            <button type="button" aria-label="Close date picker" onClick={() => onOpenChange(false)} className={`flex min-h-10 min-w-10 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 ${focusClass}`}><X className="h-4 w-4" /></button>
          </div>
          <p id={`${id}-help`} className="px-4 text-xs text-slate-500">Click a start and end date, or drag across dates. Use arrow keys to move and Enter to select.</p>
          <div className="flex flex-wrap gap-2 px-4 py-3">
            {calendarPresets(today).map(preset => <button type="button" key={preset.label} onClick={() => {
              setDraft({ from: preset.from, to: preset.to }); setSelectingEnd(false); setPreview(null);
              setMonth(monthStart(preset.from)); setActiveDay(preset.from);
            }} className={`min-h-9 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-600 hover:border-blue-300 hover:bg-blue-50 ${focusClass}`}>{preset.label}</button>)}
          </div>
          <div className="flex items-center gap-2 border-y border-slate-100 px-4 py-2">
            <button type="button" aria-label="Previous month" onClick={() => navigateMonth(addCalendarMonths(month, -1))} className={`flex min-h-10 min-w-10 items-center justify-center rounded-lg hover:bg-slate-100 ${focusClass}`}><ChevronLeft className="h-4 w-4" /></button>
            <select aria-label="Calendar month" value={Number(month.slice(5, 7)) - 1} onChange={event => navigateMonth(`${month.slice(0, 4)}-${String(Number(event.target.value) + 1).padStart(2, '0')}-01`)} className={`min-h-10 min-w-0 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 ${focusClass}`}>
              {months.map((name, index) => <option key={name} value={index}>{name}</option>)}
            </select>
            <select aria-label="Calendar year" value={year} onChange={event => navigateMonth(`${event.target.value}-${month.slice(5, 7)}-01`)} className={`min-h-10 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 ${focusClass}`}>
              {years.map(value => <option key={value}>{value}</option>)}
            </select>
            <button type="button" aria-label="Next month" onClick={() => navigateMonth(addCalendarMonths(month, 1))} className={`ml-auto flex min-h-10 min-w-10 items-center justify-center rounded-lg hover:bg-slate-100 ${focusClass}`}><ChevronRight className="h-4 w-4" /></button>
          </div>
          <div ref={gridRef} onPointerMove={moveDrag} onPointerUp={event => finishDrag(event)} onPointerCancel={event => finishDrag(event, true)}
            onLostPointerCapture={event => { if (drag.current) finishDrag(event, true); }} onMouseLeave={() => { if (!drag.current) setPreview(null); }}
            className="grid select-none grid-cols-1 gap-6 px-4 pt-4 sm:grid-cols-2">
            {renderMonth(month)}
            {renderMonth(addCalendarMonths(month, 1), true)}
          </div>
          <div className="px-4 py-3 text-xs font-semibold text-slate-700" aria-live="polite" aria-atomic="true">
            {formatCalendarRange(draft.from, draft.to || draft.from)}
            {selectingEnd && <span className="mt-1 block font-normal text-slate-500">Select an end date, or apply for a single day.</span>}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-3">
            <button type="button" onClick={() => { onChange({ from: '', to: '' }); onOpenChange(false); }} className={`min-h-10 rounded-lg px-2 text-xs font-semibold text-red-600 ${focusClass}`}>Clear dates</button>
            <div className="flex gap-2">
              <button type="button" onClick={() => onOpenChange(false)} className={`min-h-10 rounded-lg border border-slate-200 px-4 text-xs font-semibold text-slate-600 hover:bg-slate-50 ${focusClass}`}>Cancel</button>
              <button type="button" onClick={() => { onChange(draft.from ? orderedCalendarRange(draft.from, draft.to || draft.from) : { from: '', to: '' }); onOpenChange(false); }} className={`min-h-10 rounded-lg bg-[#1F3864] px-4 text-xs font-bold text-white hover:bg-blue-900 ${focusClass}`}>Apply dates</button>
            </div>
          </div>
        </div>
      </FloatingFocusManager>
    </FloatingPortal>}
  </div>;
}
