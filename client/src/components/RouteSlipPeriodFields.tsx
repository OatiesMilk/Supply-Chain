import { useId } from 'react';
import { routeSlipPeriod, routeSlipPeriodLabel, routeSlipSelectionError, type RouteSlipPeriodSelection } from '../utils/routeSlipPeriod';

export interface RouteSlipPeriodFieldsProps {
  selection: RouteSlipPeriodSelection;
  onChange: (selection: RouteSlipPeriodSelection) => void;
}

export default function RouteSlipPeriodFields({ selection, onChange }: RouteSlipPeriodFieldsProps) {
  const id = useId();
  const error = routeSlipSelectionError(selection);
  const inputClass = 'min-h-10 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700';
  return (
    <fieldset className="space-y-2 border-b border-slate-200 pb-3 mb-3 min-w-0">
      <legend className="text-xs font-bold text-slate-700 mb-2">Route slip period</legend>
      <label htmlFor={`${id}-mode`} className="block text-[11px] font-semibold text-slate-600">Export period</label>
      <select id={`${id}-mode`} value={selection.mode} className={inputClass} onChange={event => {
        const mode = event.target.value as RouteSlipPeriodSelection['mode'];
        onChange({ ...selection, mode, dateTo: mode === 'day' ? selection.dateFrom : mode === 'from' ? '' : selection.dateTo });
      }}>
        <option value="day">Single day</option>
        <option value="from">From date onward</option>
        <option value="range">From–To range</option>
      </select>
      <div className={selection.mode === 'range' ? 'grid grid-cols-2 gap-2' : ''}>
        <div className="min-w-0">
          <label htmlFor={`${id}-from`} className="block text-[11px] font-semibold text-slate-600 mb-1">{selection.mode === 'day' ? 'Day' : 'From'}</label>
          <input id={`${id}-from`} type="date" value={selection.dateFrom} className={inputClass} aria-describedby={`${id}-summary`} aria-invalid={Boolean(error)} onChange={event => onChange({ ...selection, dateFrom: event.target.value, dateTo: selection.mode === 'day' ? event.target.value : selection.dateTo })} />
        </div>
        {selection.mode === 'range' && <div className="min-w-0">
          <label htmlFor={`${id}-to`} className="block text-[11px] font-semibold text-slate-600 mb-1">To</label>
          <input id={`${id}-to`} type="date" value={selection.dateTo} className={inputClass} aria-describedby={`${id}-summary`} aria-invalid={Boolean(error)} onChange={event => onChange({ ...selection, dateTo: event.target.value })} />
        </div>}
      </div>
      <p id={`${id}-summary`} className={`text-[11px] ${error ? 'text-red-700' : 'text-slate-600'}`} role={error ? 'status' : undefined}>
        {error ?? `${routeSlipPeriodLabel(routeSlipPeriod(selection))} · Delivery Date (Asia/Manila), whole days`}
      </p>
      <p className="text-[10px] text-slate-500">Uses the table’s dates and active filters. Includes every matching page; undated records are excluded.</p>
    </fieldset>
  );
}
