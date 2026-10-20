import React, { useEffect, useId, useState } from 'react';
import { Truck, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import { DeliveryRecord } from '@/types';
import { DRIVERS, DRIVER_COVERAGE, driverIdForName } from '@/data';
import { rankDriversByCoverage } from '@/utils/driverCoverage';
import { isDraftRecord } from '@/utils/recordLifecycle';

// Same coverage rules as the Dispatch dropdown: exact Area first, then explicit Subregion.
function splitDriversByArea(recordArea: string): { matched: string[]; others: string[] } {
  const ranked = rankDriversByCoverage(DRIVERS, d => DRIVER_COVERAGE[d], recordArea);
  return { matched: [...ranked.area, ...ranked.subregion], others: ranked.other };
}

interface Props {
  records: DeliveryRecord[];
  onNavigate: (screen: string, item_id?: string) => void;
  onUpdateRecord: (id: string, updates: Partial<DeliveryRecord>) => Promise<void>;
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
  'In Transit': 'bg-cyan-100 text-cyan-700 border-cyan-200',
  Delivered:   'bg-emerald-100 text-emerald-700 border-emerald-200',
  Scheduled:   'bg-blue-100 text-blue-700 border-blue-200',
  Pending:     'bg-amber-100 text-amber-700 border-amber-200',
  'On-Hold':   'bg-red-100 text-red-700 border-red-200',
  Rescheduled: 'bg-purple-100 text-purple-700 border-purple-200'
};

function initials(name: string) {
  return name.split(/\s+/).map(p => p[0]).join('').slice(0, 2).toUpperCase();
}

type AssignmentState = { editing: boolean; pending: boolean; error: string; feedback?: { message: string; type: 'success' | 'error' }; };
const idleAssignment: AssignmentState = { editing: false, pending: false, error: '' };
const focusStyle = 'touch-manipulation focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700';

function useDriverColumnCount() {
  const readCount = () => typeof window === 'undefined' ? 1
    : window.matchMedia('(min-width: 1536px)').matches ? 3
    : window.matchMedia('(min-width: 1280px)').matches ? 2 : 1;
  const [count, setCount] = useState(readCount);
  useEffect(() => {
    const queries = [window.matchMedia('(min-width: 1280px)'), window.matchMedia('(min-width: 1536px)')];
    const update = () => setCount(readCount());
    queries.forEach(query => query.addEventListener('change', update));
    update();
    return () => queries.forEach(query => query.removeEventListener('change', update));
  }, []);
  return count;
}

interface CardProps {
  record: DeliveryRecord;
  onNavigate: (screen: string, id?: string) => void;
  onAssign: (id: string, driver: string) => Promise<void>;
  assignment: AssignmentState;
  onEdit: (id: string, editing: boolean) => void;
}

const RecordCard: React.FC<CardProps> = function RecordCard({ record, onNavigate, onAssign, assignment, onEdit }) {
  const id = useId();

  return (
    <article aria-label={`${record.reference}: ${record.company_name}`} aria-busy={assignment.pending} className="min-w-0 bg-white border border-slate-200 rounded-xl shadow-sm p-4 space-y-3">
      <div className="space-y-3">
        <button
          type="button"
          onClick={() => onNavigate(CATEGORY_SCREEN[record.category] ?? 'deliveries', record.id)}
          className={`min-h-11 w-full text-left min-w-0 rounded cursor-pointer ${focusStyle}`}
        >
          <span className="block font-semibold text-sm text-slate-900 break-words [overflow-wrap:anywhere]">{record.company_name}</span>
          <span className="mt-1 block font-mono text-xs text-slate-600 break-words [overflow-wrap:anywhere]">{record.reference || record.id}</span>
        </button>
        <div className="flex flex-wrap gap-2">
          <span className={`text-xs font-semibold border px-2.5 py-1 rounded-full ${record.priority === '3 - High' ? 'bg-red-50 text-red-800 border-red-200' : record.priority === '2 - Moderate' ? 'bg-amber-50 text-amber-800 border-amber-200' : 'bg-slate-50 text-slate-700 border-slate-200'}`}>Priority: {record.priority}</span>
          <span className={`text-xs font-semibold border px-2.5 py-1 rounded-full ${STATUS_COLOR[record.status] ?? 'bg-slate-100 text-slate-600 border-slate-200'}`}>
            {record.status}
          </span>
        </div>
      </div>
      <dl className="text-sm space-y-1.5">
        <div className="flex flex-wrap gap-x-2"><dt className="text-slate-500">Scheduled</dt><dd className="text-slate-800"><time dateTime={record.delivery_date}>{record.delivery_date || 'Not set'}</time></dd></div>
        <div className="flex gap-2"><dt className="shrink-0 text-slate-500">Area</dt><dd className="min-w-0 text-slate-800 break-words [overflow-wrap:anywhere]">{record.area || 'Not set'}</dd></div>
        <div className="flex gap-2"><dt className="shrink-0 text-slate-500">Module</dt><dd className="text-slate-800">{record.category}</dd></div>
      </dl>
      <div className="border-t border-slate-100 pt-3">
        {assignment.editing ? (
          <div>
          <label htmlFor={`${id}-driver`} className="mb-1 block text-sm font-medium text-slate-700">Assign driver</label>
          <select
            id={`${id}-driver`}
            autoFocus
            value={record.driver}
            disabled={assignment.pending}
            aria-describedby={assignment.error ? `${id}-error` : undefined}
            onChange={e => { void onAssign(record.id, e.target.value); }}
            className={`min-h-11 w-full min-w-0 text-base border border-slate-300 rounded-lg px-3 bg-white disabled:opacity-60 ${focusStyle}`}
          >
            <option value="">-- Unassigned --</option>
            {record.driver && !DRIVERS.includes(record.driver) && <option value={record.driver}>{record.driver}</option>}
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
          <div className="mt-1 flex items-center justify-between gap-2">
            <p role="status" className="text-xs text-slate-600">{assignment.pending ? 'Saving assignment…' : 'Changes save immediately.'}</p>
            <button type="button" disabled={assignment.pending} onClick={() => onEdit(record.id, false)} className={`min-h-11 rounded-lg px-3 text-sm font-semibold text-slate-600 disabled:opacity-50 ${focusStyle}`}>Close</button>
          </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <span className={`min-w-0 break-words text-sm [overflow-wrap:anywhere] ${record.driver ? 'text-slate-700' : 'text-amber-800'}`}>
              {record.driver || 'Unassigned'}
            </span>
            <button
              type="button"
              aria-label={`Reassign ${record.reference || record.id}`}
              onClick={() => onEdit(record.id, true)}
              className={`min-h-11 shrink-0 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-blue-700 hover:bg-blue-50 ${focusStyle}`}
            >
              Reassign
            </button>
          </div>
        )}
        {assignment.error && <p id={`${id}-error`} role="alert" className="mt-2 text-sm text-red-700">{assignment.error}</p>}
        {assignment.feedback && <p role="alert" className={`mt-2 text-xs ${assignment.feedback.type === 'success' ? 'text-emerald-700' : 'text-red-700'}`}>{assignment.feedback.message}</p>}
      </div>
    </article>
  );
}

export default function DriverBoard({ records, onNavigate, onUpdateRecord, currentUserName }: Props) {
  const id = useId();
  const driverColumnCount = useDriverColumnCount();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [areaFilter, setAreaFilter] = useState<string>('All');
  // Preserve save state by record identity when refreshed records move groups.
  const [assignments, setAssignments] = useState<Record<string, AssignmentState>>({});

  // Active (non-Delivered) records only for the board
  const activeRecords = records.filter(r => r.status !== 'Delivered' && !isDraftRecord(r));

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

  const onEdit = (recordId: string, editing: boolean) => setAssignments(previous => ({
    ...previous, [recordId]: { ...(previous[recordId] ?? idleAssignment), editing, error: '' },
  }));
  const handleAssign = async (recordId: string, driver: string) => {
    if (assignments[recordId]?.pending) return;
    setAssignments(previous => ({ ...previous, [recordId]: { editing: true, pending: true, error: '' } }));
    try {
      // Save the stable Driver profile id; the server copies the display name.
      const driverId = driver ? driverIdForName(driver) : null;
      await onUpdateRecord(recordId, {
        ...(driver && !driverId ? { driver } : { driver_id: driverId }),
        remarks: driver ? `Driver assigned: ${driver}` : 'Driver unassigned',
        modified_by: `${currentUserName} (Logistics)`,
        modified_at: new Date().toISOString()
      });
      setAssignments(previous => ({ ...previous, [recordId]: { ...idleAssignment, feedback: { message: driver ? 'Driver assigned successfully.' : 'Driver unassigned successfully.', type: 'success' } } }));
      setTimeout(() => setAssignments(prev => ({ ...prev, [recordId]: { ...(prev[recordId] ?? idleAssignment), feedback: undefined } })), 3000);
    } catch (error) {
      const message = error instanceof Error && error.message.trim() ? error.message : 'Could not save the assignment.';
      setAssignments(previous => ({ ...previous, [recordId]: { editing: true, pending: false, error: `${message} Choose a driver to try again.` } }));
    }
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

  const panels = columns.map((col, index) => (
    <section aria-label={`${col.label} assignments`} key={col.key} className={`min-w-0 rounded-xl border border-slate-200 overflow-hidden shadow-sm border-t-4 ${col.accent}`}>
      {/* Column header */}
      <button type="button" aria-expanded={!collapsed[col.key]} aria-controls={`${id}-group-${index}`} onClick={() => toggleCol(col.key)} className={`min-h-14 w-full px-4 py-3 ${col.headerBg} flex items-center justify-between gap-2 text-left touch-manipulation focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-blue-700`}>
        <span className="flex min-w-0 items-center gap-2">
          {col.key === '__unassigned__'
            ? <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
            : (
              <span aria-hidden="true" className="w-7 h-7 shrink-0 rounded-full bg-[#1F3864] text-white text-xs font-semibold flex items-center justify-center">
                {initials(col.label)}
              </span>
            )
          }
          <span className="min-w-0 text-sm font-semibold text-slate-800 break-words [overflow-wrap:anywhere]">{col.label}</span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <span className="bg-white text-slate-700 text-xs tabular-nums border border-slate-200 px-2 py-0.5 rounded-full">
            <span className="sr-only">Active runs: </span>
            {col.items.length}
          </span>
            {collapsed[col.key] ? <ChevronDown aria-hidden="true" className="w-4 h-4" /> : <ChevronUp aria-hidden="true" className="w-4 h-4" />}
        </span>
      </button>

      {/* Cards */}
        <div id={`${id}-group-${index}`} hidden={!!collapsed[col.key]} className="p-3 space-y-3 bg-slate-50 min-h-[120px]">
          {col.items.length === 0 ? (
            <div className="flex items-center justify-center h-20">
              <div className="text-center">
                <Truck className="w-5 h-5 text-slate-300 mx-auto mb-1" />
                <p className="text-sm text-slate-500">No active records</p>
              </div>
            </div>
          ) : (
            col.items.map(r => (
              <RecordCard
                key={r.id}
                record={r}
                onNavigate={onNavigate}
                onAssign={handleAssign}
                assignment={assignments[r.id] ?? idleAssignment}
                onEdit={onEdit}
              />
            ))
          )}
        </div>
    </section>
  ));

  return (
    <div className="min-w-0 space-y-4" id="driver-board-view">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">
          Active records grouped by driver — {unassigned.length} unassigned, {filteredRecords.length} shown
          {areaFilter !== 'All' ? ` (${activeRecords.length} total)` : ''}
        </p>
        {unassigned.length > 0 && (
          <div className="flex items-center gap-1.5 text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg text-[11px] font-bold">
            <AlertTriangle className="w-3.5 h-3.5" />
            {unassigned.length} need driver
          </div>
        )}
      </div>

      {/* Area filter chips */}
      <fieldset><legend className="mb-2 text-sm font-medium text-slate-700">Filter by area</legend><div className="flex flex-wrap gap-2">
        {allAreas.map(area => (
          <button
            key={area}
            type="button"
            aria-pressed={areaFilter === area}
            onClick={() => setAreaFilter(area)}
            className={`min-h-11 max-w-full break-words [overflow-wrap:anywhere] px-3 py-2 rounded-lg text-sm font-semibold border cursor-pointer ${focusStyle} ${
              areaFilter === area
                ? 'bg-[#1F3864] text-white border-[#1F3864]'
                : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
            }`}
          >
            {area}
          </button>
        ))}
      </div></fieldset>

      <div>
        <div className="grid min-w-0 items-start gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {panels[0]}
          <div className="grid min-w-0 items-start gap-4 xl:col-span-2 xl:grid-cols-2 2xl:col-span-3 2xl:grid-cols-3">
            {Array.from({ length: driverColumnCount }, (_, lane) => (
              <div key={lane} className="min-w-0 space-y-4">
                {panels.slice(1).filter((_, index) => index % driverColumnCount === lane)}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
