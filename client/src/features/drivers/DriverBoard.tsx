import RecordStatus from '@/components/RecordStatus';
import { usePermissions } from '@/hooks/usePermissions';
import React, { useEffect, useId, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  LayoutGrid,
  List,
  Loader2,
  MapPin,
  RotateCcw,
  Search,
  Truck,
  UserCheck,
  UserX,
  X,
} from 'lucide-react';
import type { DeliveryRecord } from '@/types';
import { DRIVERS, DRIVER_COVERAGE, driverIdForName } from '@/data';
import { rankDriversByCoverage } from '@/utils/driverCoverage';
import { isDraftRecord, manilaToday } from '@/utils/recordLifecycle';
import { jobTypeLabel } from '@/utils/driverJobs';
import { usePagedRecordsQuery } from '@/api/queries/useRecordsQuery';
import { useDriverOverviewQuery, useClampRecordPage } from '@/api/queries/useOperationalViews';
import RecordPageControls from '@/components/RecordPageControls';
import { recordLabel } from '@/utils/recordLabel';
import { cardClass, focusRingBrandClass, tableHeaderRowClass, tableRowClass } from '@/utils/uiClasses';

type AssignmentFilter = 'all' | 'unassigned' | 'assigned';
type BoardViewMode = 'board' | 'list';
type SortOption = 'default' | 'oldest' | 'nearest' | 'furthest';

interface DriverSummaryRow {
  name: string;
  active: number;
  completed: number;
}

interface ServerOverviewData {
  drivers: DriverSummaryRow[];
  unassigned: number;
  dispatch_total?: number;
  areas: string[];
}

interface Props {
  records: DeliveryRecord[];
  onNavigate: (screen: string, item_id?: string) => void;
  onUpdateRecord: (id: string, updates: Partial<DeliveryRecord>) => Promise<void>;
  currentUserName: string;
  serverPaging?: boolean;
  availableAreas?: string[];
  onAreaChange?: (area: string) => void;
}

interface BoardContentProps extends Props {
  overview?: ServerOverviewData;
  totalMatching?: number;
  isLoading?: boolean;
  isUpdating?: boolean;
  queryError?: Error | null;
  onRetry?: () => void;
  page?: number;
  onPageChange?: (page: number) => void;
  assignmentFilter?: AssignmentFilter;
  onAssignmentFilterChange?: (next: AssignmentFilter) => void;
  driverFilter?: string;
  onDriverFilterChange?: (next: string) => void;
  categoryFilter?: string;
  onCategoryFilterChange?: (next: string) => void;
  priorityFilter?: string;
  onPriorityFilterChange?: (next: string) => void;
  searchQuery?: string;
  onSearchQueryChange?: (next: string) => void;
  sortOrder?: SortOption;
  onSortOrderChange?: (next: SortOption) => void;
}

const CATEGORY_SCREEN: Record<string, string> = {
  'Deliveries': 'deliveries',
  'RMA': 'rma',
  'Accounting Collection': 'accounting_collection',
  'Procurement Pick-up': 'procurement_pickup',
  'Sales Orders': 'sales_orders',
};

const MODULE_OPTIONS = [
  'All',
  'Deliveries',
  'RMA',
  'Accounting Collection',
  'Procurement Pick-up',
  'Sales Orders',
] as const;

const PRIORITY_OPTIONS = ['All', '3 - High', '2 - Moderate', '1 - Low'] as const;

// Same coverage rules as the Dispatch dropdown: exact Area first, then explicit Subregion.
function splitDriversByArea(recordArea: string): { matched: string[]; others: string[] } {
  const ranked = rankDriversByCoverage(DRIVERS, d => DRIVER_COVERAGE[d], recordArea);
  return { matched: [...ranked.area, ...ranked.subregion], others: ranked.other };
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).map(p => p[0]).join('').slice(0, 2).toUpperCase();
}

/** Matches server `transportRequestFilter()` (`driverId === null`) on real API records while
 * staying compatible with local test fixtures that only populate `driver`. */
function isUnassignedRecord(record: DeliveryRecord): boolean {
  if (record.driver_id !== undefined) return record.driver_id === null;
  return !record.driver?.trim();
}

function priorityBadgeMeta(priority?: string): { label: string; className: string } {
  if (priority === '3 - High') {
    return { label: 'High', className: 'bg-red-50 text-red-700 border-red-200' };
  }
  if (priority === '2 - Moderate') {
    return { label: 'Moderate', className: 'bg-amber-50 text-amber-800 border-amber-200' };
  }
  return { label: 'Low', className: 'bg-slate-50 text-slate-600 border-slate-200' };
}

function formatShortDate(isoDate?: string): string {
  if (!isoDate) return 'No date';
  const parsed = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return isoDate;
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

type AssignmentState = {
  pending: boolean;
  error: string;
  feedback?: { message: string; type: 'success' | 'error' };
};
const idleAssignment: AssignmentState = { pending: false, error: '' };

function DriverAssignControl({
  record,
  assignment,
  canAssign,
  onAssign,
  onNavigate,
  compact = false,
}: {
  record: DeliveryRecord;
  assignment: AssignmentState;
  canAssign: boolean;
  onAssign: (record: DeliveryRecord, driver: string) => Promise<void>;
  onNavigate: (screen: string, id?: string) => void;
  compact?: boolean;
}) {
  const controlId = useId();
  const unassigned = isUnassignedRecord(record);
  const { matched, others } = useMemo(
    () => (record.area ? splitDriversByArea(record.area) : { matched: [], others: DRIVERS }),
    [record.area],
  );

  if (record.category === 'RMA') {
    return (
      <div className="flex items-center justify-between gap-2">
        <span className={`truncate text-xs font-medium ${unassigned ? 'text-amber-800' : 'text-slate-700'}`}>
          {unassigned ? (record.driver ? `${record.driver} (unlinked)` : 'Unassigned') : record.driver}
        </span>
        <button
          type="button"
          onClick={() => onNavigate('rma', record.id)}
          className={`inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-brand-navy transition-colors hover:border-brand-blue/40 hover:bg-brand-sky/60 cursor-pointer ${focusRingBrandClass}`}
        >
          Manage RMA
          <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
    );
  }

  if (!canAssign) {
    return (
      <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${unassigned ? 'text-amber-800' : 'text-slate-700'}`}>
        {unassigned ? <UserX className="h-3.5 w-3.5 text-amber-600" aria-hidden="true" /> : <UserCheck className="h-3.5 w-3.5 text-brand-blue" aria-hidden="true" />}
        <span className="truncate">{unassigned ? 'Unassigned' : record.driver}</span>
      </span>
    );
  }

  const selectValue = unassigned ? '' : record.driver;

  return (
    <div className="min-w-0">
      <div className="relative flex items-center gap-1.5">
        <label htmlFor={controlId} className="sr-only">
          Assign driver for {record.reference || recordLabel(record)}
        </label>
        <select
          id={controlId}
          value={selectValue}
          disabled={assignment.pending}
          aria-describedby={assignment.error ? `${controlId}-error` : undefined}
          onChange={e => { void onAssign(record, e.target.value); }}
          className={`${compact ? 'h-8 text-xs' : 'h-9 text-xs'} w-full min-w-0 rounded-lg border px-2.5 pr-7 font-medium transition-colors cursor-pointer disabled:cursor-wait disabled:opacity-60 focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/20 ${
            unassigned
              ? 'border-amber-300 bg-amber-50/70 text-amber-950 hover:border-amber-400'
              : 'border-slate-200 bg-slate-50/60 text-slate-800 hover:border-slate-300 hover:bg-white'
          }`}
        >
          <option value="">{unassigned ? 'Assign driver…' : '— Unassign driver —'}</option>
          {!unassigned && record.driver && !DRIVERS.includes(record.driver) && (
            <option value={record.driver}>{record.driver}</option>
          )}
          {matched.length > 0 && (
            <optgroup label={`✓ Covers ${record.area}`}>
              {matched.map(d => <option key={d} value={d}>{d}</option>)}
            </optgroup>
          )}
          {others.length > 0 && (
            <optgroup label={matched.length > 0 ? 'Other drivers' : 'All drivers'}>
              {others.map(d => <option key={d} value={d}>{d}</option>)}
            </optgroup>
          )}
        </select>
        {assignment.pending && (
          <Loader2 aria-hidden="true" className="h-3.5 w-3.5 shrink-0 animate-spin text-brand-blue" />
        )}
      </div>
      {unassigned && record.driver && (
        <p className="mt-1 text-[11px] text-amber-800">
          Legacy name “{record.driver}” — select an active driver profile.
        </p>
      )}
      {assignment.error && (
        <p id={`${controlId}-error`} role="alert" className="mt-1.5 text-xs text-red-700">
          {assignment.error}
        </p>
      )}
      {assignment.feedback && (
        <p role="status" className={`mt-1.5 flex items-center gap-1 text-xs font-medium ${assignment.feedback.type === 'success' ? 'text-emerald-700' : 'text-red-700'}`}>
          {assignment.feedback.type === 'success' && <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
          <span>{assignment.feedback.message}</span>
        </p>
      )}
    </div>
  );
}

const DispatchCard: React.FC<{
  record: DeliveryRecord;
  today: string;
  onNavigate: (screen: string, id?: string) => void;
  onAssign: (record: DeliveryRecord, driver: string) => Promise<void>;
  assignment: AssignmentState;
}> = function DispatchCard({ record, today, onNavigate, onAssign, assignment }) {
  const canAssign = usePermissions().canRecord(record.category, 'ASSIGN');
  const priority = priorityBadgeMeta(record.priority);
  const unassigned = isUnassignedRecord(record);
  const isOverdue = Boolean(record.delivery_date && record.delivery_date < today);
  const isToday = record.delivery_date === today;
  const displayRef = record.reference || recordLabel(record);

  return (
    <article
      aria-label={`${displayRef}: ${record.company_name}`}
      aria-busy={assignment.pending}
      className={`group flex min-w-0 flex-col justify-between rounded-xl border bg-white p-3.5 shadow-2xs transition-all hover:shadow-sm ${
        unassigned ? 'border-amber-200/90 hover:border-amber-300' : 'border-slate-200/90 hover:border-slate-300'
      }`}
    >
      <div className="space-y-2.5">
        {/* Top row: reference + status */}
        <div className="flex items-start justify-between gap-2">
          <button
            type="button"
            onClick={() => onNavigate(CATEGORY_SCREEN[record.category] ?? 'deliveries', record.id)}
            className={`min-w-0 truncate rounded-sm text-left text-xs font-semibold tabular-nums text-brand-navy hover:text-brand-blue hover:underline cursor-pointer ${focusRingBrandClass}`}
            title={`Open ${displayRef}`}
          >
            {displayRef}
          </button>
          <div className="flex shrink-0 items-center gap-1.5">
            {record.priority === '3 - High' && (
              <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${priority.className}`}>
                High
              </span>
            )}
            <RecordStatus record={record} compact />
          </div>
        </div>

        {/* Company title */}
        <button
          type="button"
          onClick={() => onNavigate(CATEGORY_SCREEN[record.category] ?? 'deliveries', record.id)}
          className={`block w-full min-w-0 rounded-sm text-left cursor-pointer ${focusRingBrandClass}`}
        >
          <span className="line-clamp-2 text-sm font-semibold leading-snug text-slate-900 group-hover:text-brand-navy">
            {record.company_name}
          </span>
        </button>

        {/* Compact metadata chips */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-slate-600">
          <span
            className={`inline-flex items-center gap-1 tabular-nums ${
              isOverdue ? 'font-semibold text-red-700' : isToday ? 'font-semibold text-brand-navy' : 'text-slate-600'
            }`}
            title={record.delivery_date || 'No date scheduled'}
          >
            <Calendar className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden="true" />
            <time dateTime={record.delivery_date}>
              {formatShortDate(record.delivery_date)}
              {isOverdue ? ' (Past due)' : isToday ? ' (Today)' : ''}
            </time>
          </span>
          <span className="inline-flex min-w-0 items-center gap-1 text-slate-600" title={record.area || 'Area not set'}>
            <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
            <span className="truncate">{record.area || 'No area'}</span>
          </span>
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">
            {jobTypeLabel(record.category)}
          </span>
          {record.priority && record.priority !== '3 - High' && (
            <span className={`rounded-full border px-1.5 py-0.2 text-[11px] font-medium ${priority.className}`}>
              {priority.label}
            </span>
          )}
        </div>
      </div>

      {/* Inline 1-click assignment footer */}
      <div className="mt-3 border-t border-slate-100 pt-2.5">
        <DriverAssignControl
          record={record}
          assignment={assignment}
          canAssign={canAssign}
          onAssign={onAssign}
          onNavigate={onNavigate}
        />
      </div>
    </article>
  );
};

export default function DriverBoard(props: Props) {
  return props.serverPaging ? <PagedDriverBoard {...props} /> : <DriverBoardContent {...props} />;
}

function PagedDriverBoard(props: Props) {
  const [page, setPage] = useState(1);
  const [assignmentFilter, setAssignmentFilter] = useState<AssignmentFilter>('all');
  const [driverFilter, setDriverFilter] = useState('');
  const [area, setArea] = useState('All');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [priorityFilter, setPriorityFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sortOrder, setSortOrder] = useState<SortOption>('default');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery.trim()), 200);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const query = usePagedRecordsQuery({
    view: 'dispatch',
    assignment: assignmentFilter === 'all' ? undefined : assignmentFilter,
    driver_exact: driverFilter || undefined,
    area: area === 'All' ? undefined : area,
    category: categoryFilter === 'All' ? undefined : categoryFilter,
    priority: priorityFilter === 'All' ? undefined : priorityFilter,
    search: debouncedSearch || undefined,
    dateSort: sortOrder === 'default' ? undefined : sortOrder,
    page,
    limit: 25,
  });

  // Always fetch true server-wide unassigned & driver workload counts (area-scoped when an area is chosen).
  const overview = useDriverOverviewQuery('', true, area === 'All' ? '' : area);
  useClampRecordPage(page, query.data?.total, setPage);

  return (
    <DriverBoardContent
      {...props}
      records={query.data?.rows ?? []}
      availableAreas={overview.data?.areas}
      overview={overview.data}
      totalMatching={query.data?.total}
      isLoading={query.isPending}
      isUpdating={query.isFetching && query.isPlaceholderData}
      queryError={query.error ?? overview.error}
      onRetry={() => { void query.refetch(); void overview.refetch(); }}
      page={page}
      onPageChange={setPage}
      assignmentFilter={assignmentFilter}
      onAssignmentFilterChange={next => {
        setAssignmentFilter(next);
        if (next === 'unassigned') setDriverFilter('');
        setPage(1);
      }}
      driverFilter={driverFilter}
      onDriverFilterChange={next => {
        setDriverFilter(next);
        if (next) setAssignmentFilter('all');
        setPage(1);
      }}
      onAreaChange={value => { setArea(value); setPage(1); }}
      categoryFilter={categoryFilter}
      onCategoryFilterChange={value => { setCategoryFilter(value); setPage(1); }}
      priorityFilter={priorityFilter}
      onPriorityFilterChange={value => { setPriorityFilter(value); setPage(1); }}
      searchQuery={searchQuery}
      onSearchQueryChange={value => { setSearchQuery(value); setPage(1); }}
      sortOrder={sortOrder}
      onSortOrderChange={value => { setSortOrder(value); setPage(1); }}
    />
  );
}

function DriverBoardContent({
  records,
  onNavigate,
  onUpdateRecord,
  currentUserName,
  serverPaging = false,
  availableAreas,
  onAreaChange,
  overview,
  totalMatching,
  isLoading = false,
  isUpdating = false,
  queryError = null,
  onRetry,
  page = 1,
  onPageChange,
  assignmentFilter: controlledAssignment,
  onAssignmentFilterChange,
  driverFilter: controlledDriver,
  onDriverFilterChange,
  categoryFilter: controlledCategory,
  onCategoryFilterChange,
  priorityFilter: controlledPriority,
  onPriorityFilterChange,
  searchQuery: controlledSearch,
  onSearchQueryChange,
  sortOrder: controlledSort,
  onSortOrderChange,
}: BoardContentProps) {
  const id = useId();
  const access = usePermissions();
  const today = manilaToday();

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [viewMode, setViewMode] = useState<BoardViewMode>('board');
  const [localAssignment, setLocalAssignment] = useState<AssignmentFilter>('all');
  const [localDriver, setLocalDriver] = useState('');
  const [areaFilter, setAreaFilter] = useState('All');
  const [localCategory, setLocalCategory] = useState('All');
  const [localPriority, setLocalPriority] = useState('All');
  const [localSearch, setLocalSearch] = useState('');
  const [localSort, setLocalSort] = useState<SortOption>('default');
  // Preserve save state by record identity when refreshed records move groups.
  const [assignments, setAssignments] = useState<Record<string, AssignmentState>>({});

  const assignmentFilter = controlledAssignment ?? localAssignment;
  const driverFilter = controlledDriver ?? localDriver;
  const categoryFilter = controlledCategory ?? localCategory;
  const priorityFilter = controlledPriority ?? localPriority;
  const searchQuery = controlledSearch ?? localSearch;
  const sortOrder = controlledSort ?? localSort;

  const setAssignmentFilter = (next: AssignmentFilter) => {
    if (onAssignmentFilterChange) onAssignmentFilterChange(next);
    else {
      setLocalAssignment(next);
      if (next === 'unassigned') setLocalDriver('');
    }
  };
  const setDriverFilter = (next: string) => {
    if (onDriverFilterChange) onDriverFilterChange(next);
    else {
      setLocalDriver(next);
      if (next) setLocalAssignment('all');
    }
  };
  const setArea = (next: string) => {
    setAreaFilter(next);
    onAreaChange?.(next);
  };
  const setCategory = (next: string) => {
    if (onCategoryFilterChange) onCategoryFilterChange(next);
    else setLocalCategory(next);
  };
  const setPriority = (next: string) => {
    if (onPriorityFilterChange) onPriorityFilterChange(next);
    else setLocalPriority(next);
  };
  const setSearch = (next: string) => {
    if (onSearchQueryChange) onSearchQueryChange(next);
    else setLocalSearch(next);
  };
  const setSort = (next: SortOption) => {
    if (onSortOrderChange) onSortOrderChange(next);
    else setLocalSort(next);
  };

  // Active (non-Delivered, non-draft, dispatch-eligible) records
  const activeRecords = useMemo(
    () =>
      records.filter(
        r =>
          !['Delivered', 'Transport Complete'].includes(r.status) &&
          !isDraftRecord(r) &&
          (r.category !== 'RMA' || (r.rma_movement === 'LOGISTICS_TRANSPORT' && r.rma_transport_status !== 'COMPLETED')),
      ),
    [records],
  );

  const allAreas = useMemo(
    () => ['All', ...(availableAreas ?? Array.from(new Set(activeRecords.map(r => r.area).filter(Boolean))).sort())],
    [availableAreas, activeRecords],
  );

  // When not using serverPaging, apply filters locally so unit tests & local mode stay 100% responsive.
  const filteredRecords = useMemo(() => {
    if (serverPaging) return activeRecords;
    const term = searchQuery.trim().toLocaleLowerCase();
    const list = activeRecords.filter(r => {
      if (areaFilter !== 'All' && r.area !== areaFilter) return false;
      if (categoryFilter !== 'All' && r.category !== categoryFilter) return false;
      if (priorityFilter !== 'All' && r.priority !== priorityFilter) return false;
      if (assignmentFilter === 'unassigned' && !isUnassignedRecord(r)) return false;
      if (assignmentFilter === 'assigned' && isUnassignedRecord(r)) return false;
      if (driverFilter && r.driver !== driverFilter) return false;
      if (term) {
        const hay = `${r.reference} ${r.record_no ?? ''} ${r.company_name} ${r.area} ${r.driver} ${r.category}`.toLocaleLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
    if (sortOrder === 'oldest') return [...list].sort((a, b) => (a.delivery_date || '9999').localeCompare(b.delivery_date || '9999'));
    if (sortOrder === 'furthest') return [...list].sort((a, b) => (b.delivery_date || '').localeCompare(a.delivery_date || ''));
    return list;
  }, [serverPaging, activeRecords, areaFilter, categoryFilter, priorityFilter, assignmentFilter, driverFilter, searchQuery, sortOrder]);

  // Group current visible records by assignment
  const unassignedOnPage = useMemo(() => filteredRecords.filter(isUnassignedRecord), [filteredRecords]);
  const byDriverOnPage = useMemo(() => {
    const grouped: Record<string, DeliveryRecord[]> = {};
    for (const r of filteredRecords) {
      if (isUnassignedRecord(r)) continue;
      const key = r.driver || 'Assigned';
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(r);
    }
    return grouped;
  }, [filteredRecords]);

  // Authoritative server-wide counts when paged (falls back to local active records when not paged).
  const driverWorkload = useMemo<DriverSummaryRow[]>(() => {
    if (serverPaging && overview) {
      return overview.drivers.filter(d => d.active > 0);
    }
    const counts = new Map<string, number>();
    for (const r of activeRecords) {
      if (isUnassignedRecord(r)) continue;
      counts.set(r.driver, (counts.get(r.driver) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([name, active]) => ({ name, active, completed: 0 }))
      .sort((a, b) => b.active - a.active || a.name.localeCompare(b.name));
  }, [serverPaging, overview, activeRecords]);

  const driverTotalByName = useMemo(
    () => new Map(driverWorkload.map(d => [d.name, d.active])),
    [driverWorkload],
  );

  const totalUnassigned = serverPaging && overview !== undefined
    ? overview.unassigned
    : unassignedOnPage.length;
  const totalAssigned = serverPaging && overview !== undefined
    ? overview.drivers.reduce((sum, d) => sum + d.active, 0)
    : activeRecords.filter(r => !isUnassignedRecord(r)).length;
  const totalActive = serverPaging && overview !== undefined
    ? (overview.dispatch_total ?? (totalUnassigned + totalAssigned))
    : activeRecords.length;

  const hasActiveFilters = Boolean(
    assignmentFilter !== 'all' ||
    driverFilter ||
    areaFilter !== 'All' ||
    categoryFilter !== 'All' ||
    priorityFilter !== 'All' ||
    searchQuery.trim() ||
    sortOrder !== 'default',
  );

  const resetFilters = () => {
    setAssignmentFilter('all');
    setDriverFilter('');
    setArea('All');
    setCategory('All');
    setPriority('All');
    setSearch('');
    setSort('default');
  };

  const handleAssign = async (record: DeliveryRecord, driver: string) => {
    if (!access.canRecord(record.category, 'ASSIGN') || assignments[record.id]?.pending) return;
    setAssignments(previous => ({ ...previous, [record.id]: { pending: true, error: '' } }));
    try {
      // Save the stable Driver profile id; the server copies the display name.
      const driverId = driver ? driverIdForName(driver) : null;
      await onUpdateRecord(record.id, {
        expected_edit_version: record.edit_version,
        ...(driver && !driverId ? { driver } : { driver_id: driverId }),
        remarks: driver ? `Driver assigned: ${driver}` : 'Driver unassigned',
        modified_by: `${currentUserName} (Logistics)`,
      });
      setAssignments(previous => ({
        ...previous,
        [record.id]: {
          pending: false,
          error: '',
          feedback: { message: driver ? `Assigned to ${driver}.` : 'Driver unassigned.', type: 'success' },
        },
      }));
      setTimeout(() => {
        setAssignments(prev => ({ ...prev, [record.id]: { ...(prev[record.id] ?? idleAssignment), feedback: undefined } }));
      }, 3000);
    } catch (error) {
      const message = error instanceof Error && error.message.trim() ? error.message : 'Could not save the assignment.';
      setAssignments(previous => ({
        ...previous,
        [record.id]: { pending: false, error: message },
      }));
    }
  };

  const toggleGroup = (key: string) => setCollapsed(prev => ({ ...prev, [key]: !prev[key] }));

  // Build ordered board groups
  const groups = useMemo(() => {
    const result: Array<{
      key: string;
      label: string;
      items: DeliveryRecord[];
      totalForGroup: number;
      isUnassigned: boolean;
    }> = [];

    if (unassignedOnPage.length > 0 || (assignmentFilter === 'unassigned' && !isLoading)) {
      result.push({
        key: '__unassigned__',
        label: 'Needs driver',
        items: unassignedOnPage,
        totalForGroup: totalUnassigned,
        isUnassigned: true,
      });
    }

    const driverEntries = Object.entries(byDriverOnPage).sort(
      ([aName, aItems], [bName, bItems]) =>
        (driverTotalByName.get(bName) ?? bItems.length) - (driverTotalByName.get(aName) ?? aItems.length) ||
        aName.localeCompare(bName),
    );

    for (const [driverName, items] of driverEntries) {
      result.push({
        key: driverName,
        label: driverName,
        items,
        totalForGroup: driverTotalByName.get(driverName) ?? items.length,
        isUnassigned: false,
      });
    }

    return result;
  }, [unassignedOnPage, byDriverOnPage, assignmentFilter, isLoading, totalUnassigned, driverTotalByName]);

  return (
    <div className="min-w-0 space-y-4" id="driver-board-view">
      {/* KPI Triage Strip — clickable cards backed by authoritative full-scope counts */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <button
          type="button"
          onClick={() => setAssignmentFilter(assignmentFilter === 'unassigned' ? 'all' : 'unassigned')}
          aria-pressed={assignmentFilter === 'unassigned'}
          className={`group relative flex flex-col justify-between overflow-hidden rounded-xl border bg-white p-4 text-left shadow-xs transition-all cursor-pointer ${focusRingBrandClass} ${
            assignmentFilter === 'unassigned'
              ? 'border-amber-400 ring-2 ring-amber-400/30'
              : totalUnassigned > 0
                ? 'border-amber-200/90 hover:border-amber-300 hover:shadow-sm'
                : 'border-slate-200/90 hover:border-slate-300'
          }`}
        >
          <span aria-hidden="true" className={`pointer-events-none absolute inset-x-0 top-0 h-[3px] ${totalUnassigned > 0 ? 'bg-amber-400' : 'bg-slate-200'}`} />
          <div className="flex items-start justify-between gap-2">
            <span className="text-xs font-semibold text-slate-600">Needs driver</span>
            <span className={`flex h-8 w-8 items-center justify-center rounded-lg ring-1 ring-inset ${totalUnassigned > 0 ? 'bg-amber-50 text-amber-700 ring-amber-200/80' : 'bg-slate-50 text-slate-500 ring-slate-200/80'}`}>
              <UserX className="h-4 w-4" aria-hidden="true" />
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight tabular-nums text-slate-900">{totalUnassigned}</span>
            <span className={`text-xs font-medium ${totalUnassigned > 0 ? 'text-amber-800' : 'text-slate-500'}`}>
              {totalUnassigned === 0 ? 'All assigned' : `${totalUnassigned} need driver`}
            </span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setAssignmentFilter(assignmentFilter === 'assigned' ? 'all' : 'assigned')}
          aria-pressed={assignmentFilter === 'assigned'}
          className={`group relative flex flex-col justify-between overflow-hidden rounded-xl border bg-white p-4 text-left shadow-xs transition-all cursor-pointer ${focusRingBrandClass} ${
            assignmentFilter === 'assigned'
              ? 'border-brand-blue ring-2 ring-brand-blue/25'
              : 'border-slate-200/90 hover:border-slate-300 hover:shadow-sm'
          }`}
        >
          <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-[3px] bg-brand-blue" />
          <div className="flex items-start justify-between gap-2">
            <span className="text-xs font-semibold text-slate-600">Assigned active</span>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-sky text-brand-navy ring-1 ring-inset ring-brand-blue/20">
              <UserCheck className="h-4 w-4" aria-hidden="true" />
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight tabular-nums text-slate-900">{totalAssigned}</span>
            <span className="text-xs text-slate-500 tabular-nums">
              across {driverWorkload.length} {driverWorkload.length === 1 ? 'driver' : 'drivers'}
            </span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => { setAssignmentFilter('all'); setDriverFilter(''); }}
          aria-pressed={assignmentFilter === 'all' && !driverFilter}
          className={`group relative flex flex-col justify-between overflow-hidden rounded-xl border bg-white p-4 text-left shadow-xs transition-all cursor-pointer ${focusRingBrandClass} ${
            assignmentFilter === 'all' && !driverFilter
              ? 'border-brand-navy ring-2 ring-brand-navy/20'
              : 'border-slate-200/90 hover:border-slate-300 hover:shadow-sm'
          }`}
        >
          <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-[3px] bg-brand-navy" />
          <div className="flex items-start justify-between gap-2">
            <span className="text-xs font-semibold text-slate-600">All active runs</span>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-50 text-slate-600 ring-1 ring-inset ring-slate-200/80">
              <Truck className="h-4 w-4" aria-hidden="true" />
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight tabular-nums text-slate-900">{totalActive}</span>
            <span className="text-xs text-slate-500">
              {areaFilter !== 'All' ? `in ${areaFilter}` : 'across all areas'}
            </span>
          </div>
        </button>
      </div>

      {/* Unified Dispatch Toolbar */}
      <div className={`${cardClass} divide-y divide-slate-100`}>
        <div className="flex flex-wrap items-center gap-2.5 p-3.5">
          {/* Search */}
          <div className="relative flex-1 min-w-[14rem]">
            <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <label htmlFor={`${id}-search`} className="sr-only">Search dispatch board</label>
            <input
              id={`${id}-search`}
              type="search"
              value={searchQuery}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search reference, company, area, or driver…"
              className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-8 text-xs text-slate-800 placeholder:text-slate-400 transition-colors focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/20"
            />
            {searchQuery && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 cursor-pointer"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            )}
          </div>

          {/* Area select */}
          <div className="flex items-center gap-1.5">
            <label htmlFor={`${id}-area`} className="sr-only">Filter by area</label>
            <select
              id={`${id}-area`}
              aria-label="Filter by area"
              value={areaFilter}
              onChange={e => setArea(e.target.value)}
              className="h-9 max-w-[12rem] rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 cursor-pointer focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/20"
            >
              {allAreas.map(area => (
                <option key={area} value={area}>{area === 'All' ? 'All areas' : area}</option>
              ))}
            </select>
          </div>

          {/* Module select */}
          <div>
            <label htmlFor={`${id}-module`} className="sr-only">Filter by module</label>
            <select
              id={`${id}-module`}
              aria-label="Filter by module"
              value={categoryFilter}
              onChange={e => setCategory(e.target.value)}
              className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 cursor-pointer focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/20"
            >
              {MODULE_OPTIONS.map(mod => (
                <option key={mod} value={mod}>{mod === 'All' ? 'All modules' : jobTypeLabel(mod)}</option>
              ))}
            </select>
          </div>

          {/* Priority select */}
          <div>
            <label htmlFor={`${id}-priority`} className="sr-only">Filter by priority</label>
            <select
              id={`${id}-priority`}
              aria-label="Filter by priority"
              value={priorityFilter}
              onChange={e => setPriority(e.target.value)}
              className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 cursor-pointer focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/20"
            >
              {PRIORITY_OPTIONS.map(p => (
                <option key={p} value={p}>{p === 'All' ? 'All priorities' : p}</option>
              ))}
            </select>
          </div>

          {/* Sort select */}
          <div>
            <label htmlFor={`${id}-sort`} className="sr-only">Sort order</label>
            <select
              id={`${id}-sort`}
              aria-label="Sort order"
              value={sortOrder}
              onChange={e => setSort(e.target.value as SortOption)}
              className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 cursor-pointer focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/20"
            >
              <option value="default">Newest first</option>
              <option value="oldest">Earliest date first</option>
              <option value="nearest">Nearest date</option>
              <option value="furthest">Furthest date</option>
            </select>
          </div>

          {/* Board / List segmented toggle */}
          <div role="group" aria-label="Layout mode" className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
            <button
              type="button"
              aria-pressed={viewMode === 'board'}
              onClick={() => setViewMode('board')}
              className={`inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold transition-colors cursor-pointer ${
                viewMode === 'board' ? 'bg-white text-brand-navy shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <LayoutGrid className="h-3.5 w-3.5" aria-hidden="true" />
              Board
            </button>
            <button
              type="button"
              aria-pressed={viewMode === 'list'}
              onClick={() => setViewMode('list')}
              className={`inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold transition-colors cursor-pointer ${
                viewMode === 'list' ? 'bg-white text-brand-navy shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <List className="h-3.5 w-3.5" aria-hidden="true" />
              List
            </button>
          </div>
        </div>

        {/* Driver workload quick-filter pills */}
        <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50/50 px-3.5 py-2.5">
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by driver">
            <button
              type="button"
              aria-pressed={assignmentFilter === 'all' && !driverFilter}
              onClick={() => { setAssignmentFilter('all'); setDriverFilter(''); }}
              className={`inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors cursor-pointer ${focusRingBrandClass} ${
                assignmentFilter === 'all' && !driverFilter
                  ? 'border-brand-navy bg-brand-navy text-white'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
              }`}
            >
              All
              <span className="tabular-nums opacity-80">{totalActive}</span>
            </button>

            <button
              type="button"
              aria-pressed={assignmentFilter === 'unassigned'}
              onClick={() => setAssignmentFilter(assignmentFilter === 'unassigned' ? 'all' : 'unassigned')}
              className={`inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold transition-colors cursor-pointer ${focusRingBrandClass} ${
                assignmentFilter === 'unassigned'
                  ? 'border-amber-600 bg-amber-600 text-white'
                  : totalUnassigned > 0
                    ? 'border-amber-200 bg-amber-50 text-amber-800 hover:border-amber-300'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
              }`}
            >
              <AlertTriangle className="h-3 w-3" aria-hidden="true" />
              Needs driver
              <span className="tabular-nums">{totalUnassigned}</span>
            </button>

            {driverWorkload.map(d => {
              const active = driverFilter === d.name;
              return (
                <button
                  key={d.name}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setDriverFilter(active ? '' : d.name)}
                  className={`inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors cursor-pointer ${focusRingBrandClass} ${
                    active
                      ? 'border-brand-blue bg-brand-blue text-white'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <span className="max-w-[9rem] truncate">{d.name}</span>
                  <span className={`tabular-nums ${active ? 'text-white/90' : 'text-slate-500'}`}>{d.active}</span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-3 text-xs text-slate-500">
            {isUpdating && (
              <span role="status" className="inline-flex items-center gap-1 text-brand-blue">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                Updating…
              </span>
            )}
            <span className="tabular-nums">
              {totalUnassigned} unassigned, {filteredRecords.length} shown
              {serverPaging && totalMatching !== undefined && totalMatching > filteredRecords.length
                ? ` of ${totalMatching}`
                : ''}
            </span>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={resetFilters}
                className="inline-flex items-center gap-1 font-semibold text-brand-navy hover:text-brand-blue cursor-pointer"
              >
                <RotateCcw className="h-3 w-3" aria-hidden="true" />
                Reset
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Error banner */}
      {queryError && (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <span>Could not load dispatch records.</span>
          {onRetry && (
            <button type="button" onClick={onRetry} className="font-semibold underline hover:text-red-950 cursor-pointer">
              Retry
            </button>
          )}
        </div>
      )}

      {/* Main Content */}
      <div className={isUpdating ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
        {isLoading ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3" aria-busy="true" aria-label="Loading dispatch board">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={`board-skeleton-${index}`} className="h-44 rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs">
                <div className="flex justify-between">
                  <div className="h-4 w-24 rounded bg-slate-100 motion-safe:animate-pulse" />
                  <div className="h-5 w-20 rounded-full bg-slate-100 motion-safe:animate-pulse" />
                </div>
                <div className="mt-3 h-4 w-3/4 rounded bg-slate-100 motion-safe:animate-pulse" />
                <div className="mt-2 h-3 w-1/2 rounded bg-slate-100 motion-safe:animate-pulse" />
                <div className="mt-8 h-9 w-full rounded-lg bg-slate-100 motion-safe:animate-pulse" />
              </div>
            ))}
          </div>
        ) : filteredRecords.length === 0 ? (
          <div className={`${cardClass} flex flex-col items-center justify-center px-6 py-14 text-center`}>
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-400">
              <Truck className="h-5 w-5" aria-hidden="true" />
            </div>
            <p className="text-sm font-semibold text-slate-900">
              {assignmentFilter === 'unassigned'
                ? 'No unassigned runs match'
                : hasActiveFilters
                  ? 'No active runs match these filters'
                  : 'No active dispatch runs'}
            </p>
            <p className="mt-1 max-w-sm text-xs text-slate-500">
              {hasActiveFilters
                ? 'Try clearing one or more filters to view all active records.'
                : 'Submitted records awaiting transport will appear here.'}
            </p>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={resetFilters}
                className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                Clear all filters
              </button>
            )}
          </div>
        ) : viewMode === 'list' ? (
          /* High-density Dispatch Table View */
          <div className={`${cardClass} overflow-hidden`}>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className={tableHeaderRowClass}>
                    <th className="px-4 py-3 font-medium">Record</th>
                    <th className="px-4 py-3 font-medium">Company &amp; Module</th>
                    <th className="px-4 py-3 font-medium">Area</th>
                    <th className="px-4 py-3 font-medium">Scheduled</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium min-w-[14rem]">Driver Assignment</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredRecords.map(record => {
                    const canAssign = access.canRecord(record.category, 'ASSIGN');
                    const displayRef = record.reference || recordLabel(record);
                    const priority = priorityBadgeMeta(record.priority);
                    const isOverdue = Boolean(record.delivery_date && record.delivery_date < today);
                    return (
                      <tr key={record.id} className={tableRowClass}>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => onNavigate(CATEGORY_SCREEN[record.category] ?? 'deliveries', record.id)}
                            className={`font-semibold text-brand-navy hover:text-brand-blue hover:underline tabular-nums cursor-pointer ${focusRingBrandClass}`}
                          >
                            {displayRef}
                          </button>
                          {record.priority === '3 - High' && (
                            <span className={`ml-2 inline-block rounded-full border px-1.5 py-0.2 text-[10px] font-semibold ${priority.className}`}>
                              High
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 max-w-[18rem]">
                          <button
                            type="button"
                            onClick={() => onNavigate(CATEGORY_SCREEN[record.category] ?? 'deliveries', record.id)}
                            className="block max-w-full truncate text-left font-semibold text-slate-900 hover:text-brand-navy cursor-pointer"
                            title={record.company_name}
                          >
                            {record.company_name}
                          </button>
                          <span className="mt-0.5 inline-block text-[11px] text-slate-500">{jobTypeLabel(record.category)}</span>
                        </td>
                        <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{record.area || 'Not set'}</td>
                        <td className={`px-4 py-3 whitespace-nowrap tabular-nums ${isOverdue ? 'font-semibold text-red-700' : 'text-slate-700'}`}>
                          {formatShortDate(record.delivery_date)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <RecordStatus record={record} compact />
                        </td>
                        <td className="px-4 py-3">
                          <DriverAssignControl
                            record={record}
                            assignment={assignments[record.id] ?? idleAssignment}
                            canAssign={canAssign}
                            onAssign={handleAssign}
                            onNavigate={onNavigate}
                            compact
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          /* Clean Collapsible Grouped Board View with Aligned Responsive Card Grids */
          <div className="space-y-4">
            {groups.map((group, index) => {
              const isCollapsed = !!collapsed[group.key];
              const showFilterShortcut =
                group.isUnassigned &&
                assignmentFilter === 'all' &&
                group.totalForGroup > group.items.length;

              return (
                <section
                  key={group.key}
                  aria-label={`${group.label} assignments`}
                  className={`overflow-hidden rounded-xl border bg-white shadow-xs ${
                    group.isUnassigned ? 'border-amber-200/90 border-t-2 border-t-amber-400' : 'border-slate-200/90'
                  }`}
                >
                  <div className={`flex flex-wrap items-center justify-between gap-2 px-4 py-3 ${group.isUnassigned ? 'bg-amber-50/60' : 'bg-slate-50/70'} border-b border-slate-100`}>
                    <button
                      type="button"
                      aria-expanded={!isCollapsed}
                      aria-controls={`${id}-group-${index}`}
                      onClick={() => toggleGroup(group.key)}
                      className={`flex min-w-0 flex-1 items-center gap-2.5 text-left cursor-pointer ${focusRingBrandClass}`}
                    >
                      {group.isUnassigned ? (
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
                          <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                        </span>
                      ) : (
                        <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-navy text-xs font-semibold text-white">
                          {initials(group.label)}
                        </span>
                      )}
                      <span className="min-w-0 truncate text-sm font-semibold text-slate-900">{group.label}</span>
                      <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-semibold tabular-nums ${
                        group.isUnassigned
                          ? 'border-amber-200 bg-white text-amber-800'
                          : 'border-slate-200 bg-white text-slate-700'
                      }`}>
                        <span className="sr-only">Active runs: </span>
                        {serverPaging && group.totalForGroup > group.items.length
                          ? `${group.items.length} on page · ${group.totalForGroup} total`
                          : group.totalForGroup}
                      </span>
                      <span className="ml-auto shrink-0 text-slate-400">
                        {isCollapsed ? <ChevronDown className="h-4 w-4" aria-hidden="true" /> : <ChevronUp className="h-4 w-4" aria-hidden="true" />}
                      </span>
                    </button>

                    {showFilterShortcut && (
                      <button
                        type="button"
                        onClick={() => setAssignmentFilter('unassigned')}
                        className="shrink-0 rounded-lg border border-amber-300 bg-white px-2.5 py-1 text-xs font-semibold text-amber-900 transition-colors hover:bg-amber-100/70 cursor-pointer"
                      >
                        View all {group.totalForGroup} unassigned →
                      </button>
                    )}
                  </div>

                  <div id={`${id}-group-${index}`} hidden={isCollapsed} className="bg-slate-50/40 p-3.5">
                    {group.items.length === 0 ? (
                      <p className="py-6 text-center text-xs text-slate-500">No active records in this group.</p>
                    ) : (
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
                        {group.items.map(r => (
                          <DispatchCard
                            key={r.id}
                            record={r}
                            today={today}
                            onNavigate={onNavigate}
                            onAssign={handleAssign}
                            assignment={assignments[r.id] ?? idleAssignment}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>

      {/* Bottom Pagination */}
      {serverPaging && onPageChange && (
        <RecordPageControls
          page={page}
          total={totalMatching ?? 0}
          onPageChange={onPageChange}
          error={queryError}
          retry={onRetry}
        />
      )}
    </div>
  );
}
