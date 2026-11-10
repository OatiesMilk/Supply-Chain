import type { ReactNode } from 'react';
import { Plus, Search } from 'lucide-react';
import type { StatusFilter } from './directoryFilters';

/** Building blocks shared by the Account Managers and Companies tabs. */
export const inputClass = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#0078C1] focus:outline-none focus:ring-2 focus:ring-[#0078C1]/20 disabled:bg-slate-50 aria-[invalid=true]:border-red-400';

export function DirectoryToolbar({ label, search, onSearch, status, onStatus, counts, addLabel, onAdd, canManage }: {
  label: string; search: string; onSearch: (value: string) => void; status: StatusFilter; onStatus: (value: StatusFilter) => void;
  counts: Record<StatusFilter, number>; addLabel: string; onAdd: () => void; canManage: boolean;
}) {
  const options: Array<[StatusFilter, string]> = [['active', 'Active'], ['inactive', 'Inactive'], ['all', 'All']];
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center">
        <label className="relative block w-full sm:max-w-xs">
          <span className="sr-only">Search {label}</span>
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input type="search" value={search} onChange={event => onSearch(event.target.value)} placeholder={`Search ${label}`}
            className={`${inputClass} pl-9`} />
        </label>
        <div role="group" aria-label="Filter by status" className="inline-flex w-fit rounded-lg border border-slate-200 bg-slate-50 p-0.5">
          {options.map(([value, text]) => (
            <button key={value} type="button" aria-pressed={status === value} onClick={() => onStatus(value)}
              className={`rounded-md px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0078C1] ${
                status === value ? 'bg-white text-[#0078C1] shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              {text} <span className="font-semibold text-slate-400">{counts[value]}</span>
            </button>
          ))}
        </div>
      </div>
      {canManage && (
        <button type="button" onClick={onAdd}
          className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg bg-[#1F3864] px-3.5 py-2 text-[11px] font-bold uppercase tracking-wider text-white transition-colors hover:bg-[#0078C1] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0078C1]">
          <Plus aria-hidden="true" className="h-4 w-4" /> {addLabel}
        </button>
      )}
    </div>
  );
}

export function StatusBadge({ active }: { active: boolean }) {
  return active
    ? <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">Active</span>
    : <span className="inline-flex rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">Inactive</span>;
}

export function Field({ id, label, hint, error, required, children }: {
  id: string; label: string; hint?: string; error?: string; required?: boolean; children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-xs font-bold text-slate-700">
        {label}{required && <span aria-hidden="true" className="text-red-600"> *</span>}
      </label>
      {children}
      {hint && !error && <p id={`${id}-hint`} className="text-[11px] text-slate-500">{hint}</p>}
      {error && <p id={`${id}-error`} className="text-[11px] font-semibold text-red-700">{error}</p>}
    </div>
  );
}
/** aria props tying an input to its Field hint or error. */
export const describedBy = (id: string, error?: string, hint?: string) => ({
  'aria-invalid': error ? true : undefined,
  'aria-describedby': error ? `${id}-error` : hint ? `${id}-hint` : undefined,
});

export function TableShell({ label, columns, empty, children }: { label: string; columns: string[]; empty: string | null; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="relative max-w-full overflow-x-auto" role="region" aria-label={label} tabIndex={0}>
        <table className="w-full min-w-[48rem] border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-widest text-slate-500">
              {columns.map(column => <th key={column} scope="col" className={`px-4 py-3 ${column === 'Actions' ? 'text-right' : ''}`}>{column}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {empty ? <tr><td colSpan={columns.length} className="px-4 py-10 text-center text-sm text-slate-500">{empty}</td></tr> : children}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function RowActions({ name, active, onEdit, onToggle }: { name: string; active: boolean; onEdit: () => void; onToggle: () => void }) {
  const base = 'rounded-md border px-2.5 py-1 text-[11px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0078C1]';
  return (
    <div className="flex justify-end gap-1.5">
      <button type="button" onClick={onEdit} aria-label={`Edit ${name}`} className={`${base} border-slate-300 bg-white text-slate-700 hover:bg-slate-50`}>Edit</button>
      <button type="button" onClick={onToggle} aria-label={`${active ? 'Deactivate' : 'Reactivate'} ${name}`}
        className={`${base} ${active ? 'border-red-200 bg-white text-red-700 hover:bg-red-50' : 'border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50'}`}>
        {active ? 'Deactivate' : 'Reactivate'}
      </button>
    </div>
  );
}

export const formatUpdated = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'Asia/Manila' });
};
