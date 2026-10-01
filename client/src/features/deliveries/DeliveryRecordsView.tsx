import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Plus,
  Search,
  X,
  Check,
  FileDown,
  Mail,
  Send,
  Bell,
  CheckCircle2,
  Loader2,
  ListChecks,
  Shuffle,
  AlertTriangle as SamplerAlert,
  FileBarChart2
} from 'lucide-react';
import ExportMenu from '@/components/ExportMenu';
import DriverReportModal from '@/features/drivers/DriverReportModal';
import RouteSlipMenu from '@/components/RouteSlipMenu';
import AccountManagerCombobox from '@/components/AccountManagerCombobox';
import Pagination from '@/components/Pagination';
import { computeAllOpsSummary } from '@/utils/allOpsExport';
import { DELIVERY_COLUMNS, AC_EXTRA_COLUMNS, PDF_DELIVERY_COLUMNS, PDF_AC_COLUMNS, fmtDate, fmtDatetime, fmtStatus, StatusHistoryCounts } from '@/utils/export';
import { DeliveryRecord, DeliveryCategory, UserRole, DeliveryStatus, OutputActionConfig, OutputActionTrigger, PriorityLevel } from '@/types';
import { ApiCompany, api, apiUrl, ApiError } from '@/api';
import { DELIVERY_STATUSES, AREA_HIERARCHY, getRegion, getSubregion } from '@/data';
import { MapPin, SlidersHorizontal } from 'lucide-react';
import DeliveryRecordWorkspace from '@/features/deliveries/DeliveryRecordWorkspace';
import RecordCreateForm from '@/features/deliveries/RecordCreateForm';

interface DeliveryRecordsViewProps {
  category: DeliveryCategory;
  title: string;
  subtitle: string;
  records: DeliveryRecord[];
  companies: ApiCompany[];
  currentUserRole: UserRole;
  currentUserName: string;
  onCreateRecord: (data: Omit<DeliveryRecord, 'id' | 'created_by' | 'created_at' | 'modified_by' | 'modified_at' | 'email_notification_sent'>) => Promise<void>;
  onUpdateRecord: (id: string, updates: Partial<DeliveryRecord>) => Promise<void>;
  onVerifyCollection: (id: string) => Promise<void>;
  outputActionConfigs: Record<OutputActionTrigger, OutputActionConfig>;
  onUpdateOutputActionConfig: (trigger: OutputActionTrigger, patch: Partial<OutputActionConfig>) => void;
  selectedRecordIdFromDashboard?: string | null;
  clearSelectedRecordId?: () => void;
  onRefresh?: () => void;
}

// Small icon per output-action log message, purely cosmetic
const outputLineIcon = (message: string) => {
  if (message.startsWith('Notified Account Manager')) return <Mail className="w-3 h-3 shrink-0" />;
  if (message.startsWith('Exported')) return <FileDown className="w-3 h-3 shrink-0" />;
  if (message.startsWith('Notified')) return <Bell className="w-3 h-3 shrink-0" />;
  return <Send className="w-3 h-3 shrink-0" />;
};

const statusColor = (status: DeliveryStatus) => {
  switch (status) {
    case 'Delivered': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'On-Hold': return 'bg-red-50 text-red-700 border-red-200';
    case 'Rescheduled': return 'bg-purple-50 text-purple-700 border-purple-200';
    case 'Pending': return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'Scheduled':
    default: return 'bg-blue-50 text-blue-700 border-blue-200';
  }
};


export default function DeliveryRecordsView({
  category,
  title,
  subtitle,
  records,
  companies,
  currentUserRole,
  currentUserName,
  onCreateRecord,
  onUpdateRecord,
  onVerifyCollection,
  outputActionConfigs,
  onUpdateOutputActionConfig,
  selectedRecordIdFromDashboard,
  clearSelectedRecordId,
  onRefresh
}: DeliveryRecordsViewProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [regionFilter, setRegionFilter] = useState<string>('All Regions');
  const [subregionFilter, setSubregionFilter] = useState<string>('All Subregions');
  const [areaFilter, setAreaFilter] = useState<string>('All Areas');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [dateSort, setDateSort] = useState<'default' | 'nearest' | 'oldest' | 'furthest'>('default');
  const [amFilter, setAmFilter] = useState('');
  const [driverFilter, setDriverFilter] = useState('');
  const dateFromRef = useRef<HTMLInputElement>(null);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const advFilterBtnRef = useRef<HTMLButtonElement>(null);
  const advFilterPanelRef = useRef<HTMLDivElement>(null);
  const [popoverAlign, setPopoverAlign] = useState<'right' | 'left'>('right');
  const [popoverMaxWidth, setPopoverMaxWidth] = useState<number>(420);
  const [creationBanner, setCreationBanner] = useState<{ recordId: string; lines: string[] } | null>(null);


  // Bulk selection (Logistics only)
  const [selectedBulkIds, setSelectedBulkIds] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState<string>('Delivered');
  const [bulkApplying, setBulkApplying] = useState(false);
  const [bulkPriority, setBulkPriority] = useState<PriorityLevel | ''>('');
  const [priorityResult, setPriorityResult] = useState<{ ok: boolean; message: string } | null>(null);

  // Monthly Driver Report modal
  const [showDriverReportModal, setShowDriverReportModal] = useState(false);

  // Generate Sample (Admin only)
  const [showSampler, setShowSampler] = useState(false);
  const [samplerCount, setSamplerCount] = useState(5);
  const [samplerGenerating, setSamplerGenerating] = useState(false);
  const [samplerResult, setSamplerResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const CATEGORY_MODULE: Record<string, string> = {
    'Deliveries': 'deliveries',
    'RMA': 'rma',
    'Accounting Collection': 'accounting_collection',
    'Procurement Pick-up': 'procurement_pickup',
    'Sales Orders': 'sales_orders',
  };

  const handleGenerateSample = async () => {
    const module = CATEGORY_MODULE[category];
    if (!module) return;
    setSamplerGenerating(true);
    setSamplerResult(null);
    try {
      const result = await api.dataSampler.generate({ module, count: samplerCount });
      setSamplerResult({ ok: true, msg: `${result.created} record${result.created !== 1 ? 's' : ''} generated.` });
      onRefresh?.();
    } catch (err) {
      setSamplerResult({ ok: false, msg: err instanceof ApiError ? err.message : 'Generation failed.' });
    } finally {
      setSamplerGenerating(false);
    }
  };

  // TASS filter state (applied when currentUserRole === 'TASS')
  const [tassDateFrom, setTassDateFrom] = useState('');
  const [tassDateTo, setTassDateTo] = useState('');
  const [tassStatusFilter, setTassStatusFilter] = useState('');
  const [tassAccountManager, setTassAccountManager] = useState('');



  // Deep-link support: jump straight to a flagged record (e.g. from the Dashboard's
  // Needs Attention panel or the Logistics dispatch board's unassigned-records list).
  useEffect(() => {
    if (selectedRecordIdFromDashboard) {
      setSelectedId(selectedRecordIdFromDashboard);
      setShowForm(false);
      clearSelectedRecordId?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRecordIdFromDashboard]);

  // Reset category-scoped UI state when switching module tabs. The same
  // component instance is reused, so bulk selections would otherwise carry
  // over and keep the action bar visible for records from the previous module.
  useEffect(() => {
    setSelectedId(null);
    setShowForm(false);
    setRegionFilter('All Regions');
    setSubregionFilter('All Subregions');
    setAreaFilter('All Areas');
    setDateFrom('');
    setDateTo('');
    setDateSort('default');
    setAmFilter('');
    setDriverFilter('');
    setSelectedBulkIds(new Set());
    setBulkPriority('');
    setPriorityResult(null);
  }, [category]);

  const [statusHistoryCounts, setStatusHistoryCounts] = useState<StatusHistoryCounts | undefined>(undefined);

  useEffect(() => {
    const params = new URLSearchParams();
    const CATEGORY_TO_DB: Record<string, string> = {
      'Deliveries': 'DELIVERY', 'RMA': 'RMA', 'Accounting Collection': 'ACCOUNTING_COLLECTION',
      'Procurement Pick-up': 'PROCUREMENT_PICKUP', 'Sales Orders': 'SALES_ORDERS',
    };
    if (category) params.set('category', CATEGORY_TO_DB[category] ?? category);
    if (dateFrom) params.set('dateFrom', dateFrom);
    if (dateTo) params.set('dateTo', dateTo);
    if (areaFilter !== 'All Areas') params.set('area', areaFilter);
    if (driverFilter) params.set('driver', driverFilter);
    if (statusFilter !== 'All') params.set('status', statusFilter);

    fetch(`${apiUrl('/records/status-history-counts')}?${params}`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(data => setStatusHistoryCounts(data ?? undefined))
      .catch(() => setStatusHistoryCounts(undefined));
  }, [category, dateFrom, dateTo, areaFilter, driverFilter, statusFilter]);



  const canEdit =
    currentUserRole === 'Sales Coordinator' ||
    (currentUserRole === 'Logistics' && category !== 'RMA');
  // Driver assignment is Logistics-only (SoD enforcement)
  const canAssignDriver = currentUserRole === 'Logistics' && category !== 'RMA';

  // ── Record list filtering ──────────────────────────────────────────────────
  const categoryRecords = records.filter(r => r.category === category);

  const amOptions = useMemo(
    () => [...new Set(categoryRecords.map(r => r.account_manager).filter(Boolean))].sort(),
    [categoryRecords]
  );

  const driverOptions = useMemo(
    () => [...new Set(categoryRecords.map(r => r.driver).filter(Boolean))].sort(),
    [categoryRecords]
  );

  // Areas visible in the specific-area dropdown, scoped by current region+subregion selection
  const areasInScope = (() => {
    const regions = regionFilter === 'All Regions' ? AREA_HIERARCHY : AREA_HIERARCHY.filter(r => r.region === regionFilter);
    const subs = subregionFilter === 'All Subregions'
      ? regions.flatMap(r => r.subregions)
      : regions.flatMap(r => r.subregions.filter(s => s.name === subregionFilter));
    return new Set(subs.flatMap(s => s.areas));
  })();

  const distinctAreasForFilter = [
    'All Areas',
    ...Array.from(new Set(categoryRecords.filter(r => areasInScope.has(r.area)).map(r => r.area).filter(Boolean))).sort(),
  ];

  const baseFiltered = categoryRecords.filter(r => {
    if (regionFilter !== 'All Regions' && getRegion(r.area) !== regionFilter) return false;
    if (subregionFilter !== 'All Subregions' && getSubregion(r.area) !== subregionFilter) return false;
    if (areaFilter !== 'All Areas' && r.area !== areaFilter) return false;
    if (statusFilter !== 'All' && r.status !== statusFilter) return false;
    if (amFilter && !r.account_manager.toLowerCase().includes(amFilter.toLowerCase())) return false;
    if (driverFilter && r.driver.toLowerCase() !== driverFilter.toLowerCase()) return false;
    if (dateFrom && r.delivery_date) {
      const rd = new Date(r.delivery_date);
      const df = new Date(dateFrom);
      if (rd < df) return false;
    }
    if (dateTo && r.delivery_date) {
      const rd = new Date(r.delivery_date);
      const dt = new Date(dateTo);
      if (rd > dt) return false;
    }
    const q = searchQuery.toLowerCase();
    if (!q) return true;
    return (
      r.id.toLowerCase().includes(q) ||
      r.company_name.toLowerCase().includes(q) ||
      r.reference.toLowerCase().includes(q) ||
      r.driver.toLowerCase().includes(q) ||
      r.area.toLowerCase().includes(q) ||
      r.account_manager.toLowerCase().includes(q)
    );
  });

  // TASS-specific extra filters (client-side, no extra API call)
  const filtered = currentUserRole === 'TASS'
    ? baseFiltered.filter(r => {
      if (tassDateFrom && r.delivery_date) {
        const rd = new Date(r.delivery_date);
        const df = new Date(tassDateFrom);
        if (rd < df) return false;
      }
      if (tassDateTo && r.delivery_date) {
        const rd = new Date(r.delivery_date);
        const dt = new Date(tassDateTo);
        if (rd > dt) return false;
      }
      if (tassAccountManager && !r.account_manager.toLowerCase().includes(tassAccountManager.toLowerCase())) return false;
      if (tassStatusFilter) {
        if (tassStatusFilter === 'Collection Verified') return r.collection_verified === true;
        if (tassStatusFilter === 'Accomplished') return r.status === 'Delivered';
        return r.status === tassStatusFilter;
      }
      return true;
    })
    : baseFiltered;

  const now = Date.now();
  const activeDateSort = (dateFrom || dateTo) ? 'default' : dateSort;
  const sortedFiltered = activeDateSort === 'default' ? filtered : [...filtered].sort((a, b) => {
    const da = a.delivery_date ? new Date(a.delivery_date + 'T12:00:00').getTime() : null;
    const db = b.delivery_date ? new Date(b.delivery_date + 'T12:00:00').getTime() : null;
    if (!da && !db) return 0;
    if (!da) return 1;
    if (!db) return -1;
    if (activeDateSort === 'nearest') return Math.abs(da - now) - Math.abs(db - now);
    if (activeDateSort === 'oldest') return da - db;
    if (activeDateSort === 'furthest') return db - da;
    return 0;
  });

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Automatically reset to page 1 whenever any filter or search query changes
  useEffect(() => {
    setCurrentPage(1);
  }, [
    category,
    searchQuery,
    statusFilter,
    regionFilter,
    subregionFilter,
    areaFilter,
    dateFrom,
    dateTo,
    dateSort,
    amFilter,
    driverFilter,
    tassDateFrom,
    tassDateTo,
    tassStatusFilter,
    tassAccountManager,
  ]);

  const totalPages = Math.max(1, Math.ceil(sortedFiltered.length / pageSize));
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);

  const paginatedRecords = useMemo(() => {
    const startIndex = (safeCurrentPage - 1) * pageSize;
    return sortedFiltered.slice(startIndex, startIndex + pageSize);
  }, [sortedFiltered, safeCurrentPage, pageSize]);

  const activeRecord = records.find(r => r.id === selectedId);

  const handleBulkPriorityUpdate = async () => {
    if (!bulkPriority || selectedBulkIds.size === 0 || bulkApplying) return;
    setBulkApplying(true);
    setPriorityResult(null);
    const failedIds = new Set<string>();
    let firstError = '';
    const ids = [...selectedBulkIds];
    try {
      for (const id of ids) {
        try {
          await onUpdateRecord(id, { priority: bulkPriority, remarks: `Priority set to ${bulkPriority}` });
        } catch (error) {
          failedIds.add(id);
          if (!firstError) firstError = error instanceof Error ? error.message : 'Please try again.';
        }
      }
      setSelectedBulkIds(failedIds);
      const savedCount = ids.length - failedIds.size;
      setPriorityResult(failedIds.size > 0
        ? { ok: false, message: `${savedCount} saved; priority update failed for ${[...failedIds].join(', ')}. ${firstError}` }
        : { ok: true, message: `Priority saved as ${bulkPriority} for ${savedCount} record${savedCount === 1 ? '' : 's'}.` });
    } finally {
      setBulkApplying(false);
    }
  };

  const handleBulkStatusUpdate = async () => {
    if (selectedBulkIds.size === 0 || bulkApplying) return;
    setBulkApplying(true);
    for (const id of [...selectedBulkIds]) {
      await (onUpdateRecord(id, { status: bulkStatus as any }) as unknown as Promise<void>);
    }
    setSelectedBulkIds(new Set());
    setBulkApplying(false);
  };

  const toggleBulkId = (id: string) => {
    setSelectedBulkIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAllBulk = () => {
    if (selectedBulkIds.size === sortedFiltered.length) {
      setSelectedBulkIds(new Set());
    } else {
      setSelectedBulkIds(new Set(sortedFiltered.map(r => r.id)));
    }
  };



  // ── CSV / PDF Export (TASS + Accounting Collection only) ──────────────────
  // ── Export: role+category gating per spec ──────────────────────────────
  const showExports = (() => {
    if (category === 'Accounting Collection') return currentUserRole === 'TASS' || currentUserRole === 'Admin';
    // Deliveries, RMA, Procurement Pick-up, Sales Orders
    return ['Sales Coordinator', 'Logistics', 'Admin'].includes(currentUserRole);
  })();

  const isAC = category === 'Accounting Collection';
  const exportColumns = isAC ? [...DELIVERY_COLUMNS, ...AC_EXTRA_COLUMNS] : DELIVERY_COLUMNS;
  const pdfCols = isAC ? PDF_AC_COLUMNS : PDF_DELIVERY_COLUMNS;
  const exportRows = sortedFiltered.map(r => ({
    id: r.id,
    company_name: r.company_name,
    reference: r.reference,
    category: r.category,
    priority: r.priority,
    area: r.area,
    delivery_date_fmt: fmtDate(r.delivery_date),
    driver: r.driver || '',
    driver_assistants: r.driver_assistants?.join(', ') || '',
    account_manager: r.account_manager,
    vehicle: r.vehicle,
    item_type: r.item_type,
    status_fmt: fmtStatus(r.status),
    remarks: r.remarks || '',
    created_by: r.created_by,
    created_at_fmt: fmtDatetime(r.created_at),
    ...(isAC ? {
      collection_verified_fmt: r.collection_verified ? 'Verified' : 'Pending',
      collection_verified_by: r.collection_verified_by || '',
      collection_verified_at_fmt: r.collection_verified_at ? fmtDatetime(r.collection_verified_at) : ''
    } : {})
  }));

  const exportMeta = {
    reportName: `${category} Records Export`,
    generatedByName: currentUserName,
    generatedByRole: currentUserRole
  };

  const exportSummary = computeAllOpsSummary(
    sortedFiltered,
    activeDateSort === 'default' ? 'nearest' : activeDateSort
  );

  const routeSlipProps = driverFilter
    ? {
      records: sortedFiltered,
      driverName: driverFilter,
      date: dateFrom || new Date().toISOString().split('T')[0],
      preparedBy: currentUserName,
    }
    : undefined;

  const showTassFilters = currentUserRole === 'TASS';

  const hasAdvancedFilters = regionFilter !== 'All Regions' || subregionFilter !== 'All Subregions' || areaFilter !== 'All Areas' || !!amFilter || !!driverFilter || false;

  // Count individual active advanced filters for the badge
  const activeFilterCount = [
    regionFilter !== 'All Regions',
    subregionFilter !== 'All Subregions',
    areaFilter !== 'All Areas',
    !!amFilter,
    !!driverFilter,
    !!dateFrom,
    !!dateTo,
    dateSort !== 'default',
  ].filter(Boolean).length;

  // Dynamic popover alignment & width to adapt to zoom levels and viewport boundaries
  const updatePopoverPosition = useCallback(() => {
    if (!advFilterBtnRef.current) return;
    const btnRect = advFilterBtnRef.current.getBoundingClientRect();
    const sidebarEl = document.getElementById('sidebar-panel');
    const sidebarRight = sidebarEl ? Math.max(0, sidebarEl.getBoundingClientRect().right) : 0;
    const viewportWidth = window.innerWidth;

    // Minimum left margin so popover never overlaps or touches the side navigation bar
    const minAllowedLeft = Math.max(16, sidebarRight + 16);
    const availableTotalWidth = Math.max(280, viewportWidth - minAllowedLeft - 16);
    let targetWidth = Math.min(420, availableTotalWidth);

    // If anchored to button's right edge, calculate where its left edge would be
    const rightAlignedLeftEdge = btnRect.right - targetWidth;

    if (rightAlignedLeftEdge < minAllowedLeft) {
      // Not enough room to open leftwards (towards sidebar) — anchor left and open rightwards
      const rightAvailable = Math.max(280, viewportWidth - btnRect.left - 16);
      targetWidth = Math.min(targetWidth, rightAvailable);
      setPopoverAlign('left');
    } else {
      // Plenty of room on the left of the button — anchor right
      setPopoverAlign('right');
    }
    setPopoverMaxWidth(targetWidth);
  }, []);

  // Update position on open, resize, or zoom change
  useEffect(() => {
    if (!showAdvancedFilters) return;
    updatePopoverPosition();
    window.addEventListener('resize', updatePopoverPosition);
    return () => window.removeEventListener('resize', updatePopoverPosition);
  }, [showAdvancedFilters, updatePopoverPosition]);

  // Close advanced filter popover when clicking outside
  useEffect(() => {
    if (!showAdvancedFilters) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        advFilterPanelRef.current &&
        !advFilterPanelRef.current.contains(e.target as Node) &&
        advFilterBtnRef.current &&
        !advFilterBtnRef.current.contains(e.target as Node)
      ) {
        setShowAdvancedFilters(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showAdvancedFilters]);

  const showCheckbox = canAssignDriver || canEdit;
  const showCollectionCol = currentUserRole === 'TASS' && category === 'Accounting Collection';

  // Percentage widths (not px) so the table fills the full available width —
  // like the Directory tables — while keeping each column's ratio fixed
  // regardless of viewport size. Three mutually exclusive layouts depending
  // on which optional columns render (checkbox: Sales Coordinator/Logistics
  // only; Collection: TASS+Accounting Collection only; neither: Admin).
  // Date widened further / Status narrowed by the same amount, so Driver's
  // start shifts right (more gap from Delivery Date) without shrinking
  // Driver's own width — Status (a short pill badge) absorbs the change
  // instead, since it tolerates a narrower column better than Driver names do.
  const colMinWidth = { id: '110px', company: '200px', area: '130px', date: '180px', driver: '130px', status: '130px' };
  const colPct = showCheckbox
    ? { id: 12, company: 24, area: 13, date: 22, driver: 12, status: 13 }
    : showCollectionCol
      ? { id: 11, company: 23, area: 12, date: 22, driver: 12, status: 12 }
      : { id: 13, company: 26, area: 13, date: 22, driver: 13, status: 13 };

  return (
    <div className="space-y-6 print:space-y-2" id={`records-view-${category.toLowerCase().replace(/\s+/g, '-')}`}>
      {priorityResult && (
        <div role={priorityResult.ok ? 'status' : 'alert'} className={`rounded-lg border px-4 py-3 text-sm ${priorityResult.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
          {priorityResult.message}
        </div>
      )}
      {/* View Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 pb-4 print:hidden">
        <div>
          <h2 className="text-xl font-bold text-gray-900">{title}</h2>
          <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {showExports && (
            <ExportMenu
              rows={exportRows}
              columns={exportColumns}
              pdfColumns={pdfCols}
              sheetName={`${category} Records`}
              filename={category.toLowerCase().replace(/\s+/g, '-')}
              pdfTitle={`${category} records`}
              meta={exportMeta}
              summary={exportSummary}
              routeSlipProps={routeSlipProps}
              statusHistoryCounts={statusHistoryCounts}
            />
          )}
          {showExports && (
            <RouteSlipMenu
              records={sortedFiltered}
              driverFilter={driverFilter}
              dateFrom={dateFrom}
              preparedBy={currentUserName}
              filename={category.toLowerCase().replace(/\s+/g, '-')}
              onFocusDateFilter={() => dateFromRef.current?.focus()}
            />
          )}
          {/* Monthly Driver Report — Logistics / Admin, Deliveries only */}
          {(currentUserRole === 'Logistics' || currentUserRole === 'Admin') && category === 'Deliveries' && (
            <button
              onClick={() => setShowDriverReportModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-blue-50 border border-slate-200 hover:border-blue-300 text-slate-600 hover:text-blue-700 text-[11px] font-bold rounded-lg transition-all cursor-pointer"
            >
              <FileBarChart2 className="w-3.5 h-3.5 text-blue-500" />
              Monthly Driver Report
            </button>
          )}
          {showDriverReportModal && (
            <DriverReportModal
              records={records}
              onClose={() => setShowDriverReportModal(false)}
              generatedByName={currentUserName}
              generatedByRole={currentUserRole}
            />
          )}
          {/* Generate Sample — Admin only */}
          {currentUserRole === 'Admin' && (
            <div className="relative">
              <button
                onClick={() => { setShowSampler(p => !p); setSamplerResult(null); }}
                className="flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-violet-50 border border-slate-200 hover:border-violet-200 text-slate-600 hover:text-violet-700 text-[11px] font-bold rounded-lg transition-all cursor-pointer"
              >
                <Shuffle className="w-3.5 h-3.5 text-violet-500" /> Generate Sample
              </button>
              {showSampler && (
                <div className="absolute right-0 top-full mt-1 z-30 bg-white border border-slate-200 rounded-xl shadow-xl w-72 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-black text-slate-800">Generate Sample Records</p>
                    <button onClick={() => setShowSampler(false)} className="p-0.5 hover:bg-slate-100 rounded cursor-pointer"><X className="w-3.5 h-3.5 text-slate-400" /></button>
                  </div>
                  <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-start gap-2">
                    <SamplerAlert className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                    <p className="text-[10px] text-amber-700">Creates real records in the live database with randomized data.</p>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-600 block mb-1">
                      Count: <span className="text-violet-700 font-black">{samplerCount}</span>
                    </label>
                    <input
                      type="range" min={1} max={50} value={samplerCount}
                      onChange={e => setSamplerCount(Number(e.target.value))}
                      className="w-full accent-violet-600 cursor-pointer"
                    />
                    <div className="flex justify-between text-[9px] text-slate-400 font-bold mt-0.5">
                      <span>1</span><span>25</span><span>50</span>
                    </div>
                  </div>
                  {samplerResult && (
                    <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-[11px] font-bold ${samplerResult.ok ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
                      {samplerResult.ok ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> : <SamplerAlert className="w-3.5 h-3.5 shrink-0" />}
                      {samplerResult.msg}
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleGenerateSample}
                      disabled={samplerGenerating}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-violet-700 hover:bg-violet-600 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {samplerGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Shuffle className="w-3.5 h-3.5" />}
                      {samplerGenerating ? 'Generating…' : `Generate ${samplerCount}`}
                    </button>
                    <button onClick={() => setShowSampler(false)} className="px-3 py-2 border border-slate-200 text-slate-600 text-xs font-bold rounded-lg hover:bg-slate-50 cursor-pointer">Cancel</button>
                  </div>
                </div>
              )}
            </div>
          )}
          {canEdit && (
            <button
              onClick={() => { setShowForm(true); setSelectedId(null); }}
              className="bg-[#1F3864] hover:bg-blue-900 text-white text-[12px] font-bold px-3.5 py-2 rounded-lg flex items-center gap-1.5 transition-all shadow-xs cursor-pointer self-start"
            >
              <Plus className="w-4 h-4" /> New Record
            </button>
          )}
        </div>
      </div>

      {/* TASS filter controls */}
      {showTassFilters && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-wrap gap-3 items-end text-xs print:hidden" id="tass-filters">
          <div className="space-y-1">
            <label className="font-bold text-slate-700 block">Delivery Date From</label>
            <input type="date" value={tassDateFrom} onChange={e => setTassDateFrom(e.target.value)}
              className="px-3 py-2 border border-slate-300 rounded-lg text-xs" />
          </div>
          <div className="space-y-1">
            <label className="font-bold text-slate-700 block">Delivery Date To</label>
            <input type="date" value={tassDateTo} onChange={e => setTassDateTo(e.target.value)}
              className="px-3 py-2 border border-slate-300 rounded-lg text-xs" />
          </div>
          <div className="space-y-1">
            <label className="font-bold text-slate-700 block">Status</label>
            <select value={tassStatusFilter} onChange={e => setTassStatusFilter(e.target.value)}
              className="px-3 py-2 border border-slate-300 rounded-lg bg-white text-xs w-44">
              <option value="">All Statuses</option>
              <option value="Accomplished">Accomplished</option>
              <option value="Collection Verified">Collection Verified</option>
              <option value="Pending">Pending</option>
              <option value="Scheduled">Scheduled</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="font-bold text-slate-700 block">Account Manager</label>
            <AccountManagerCombobox
              value={tassAccountManager}
              onChange={setTassAccountManager}
              options={amOptions}
              placeholder="Filter by AM..."
              inputClassName="px-3 py-2 border border-slate-300 rounded-lg text-xs w-40"
            />
          </div>
          {(tassDateFrom || tassDateTo || tassStatusFilter || tassAccountManager) && (
            <button
              onClick={() => { setTassDateFrom(''); setTassDateTo(''); setTassStatusFilter(''); setTassAccountManager(''); }}
              className="px-3 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-[11px] uppercase rounded-lg cursor-pointer"
            >
              Clear Filters
            </button>
          )}
        </div>
      )}

      {/* Bulk action bar — Logistics: status / Sales Coordinator: priority */}
      {selectedBulkIds.size > 0 && (canAssignDriver || canEdit) && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-[#1F3864] text-white rounded-2xl shadow-2xl px-5 py-3.5 flex items-center gap-4 print:hidden" id="bulk-action-bar">
          <ListChecks className="w-4 h-4 text-blue-300 shrink-0" />
          <span className="text-sm font-bold text-white">{selectedBulkIds.size} selected</span>
          {canAssignDriver && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-white/60">Set status:</span>
              <select
                value={bulkStatus}
                onChange={e => setBulkStatus(e.target.value)}
                className="text-[11px] font-bold bg-white/10 border border-white/20 text-white rounded-lg px-2.5 py-1.5 focus:outline-none cursor-pointer"
              >
                {(['Pending', 'Scheduled', 'Delivered', 'On-Hold', 'Rescheduled'] as const).map(s => (
                  <option key={s} value={s} className="text-slate-900 bg-white">{s}</option>
                ))}
              </select>
              <button
                onClick={handleBulkStatusUpdate}
                disabled={bulkApplying}
                className="px-4 py-1.5 bg-[#0078C1] hover:bg-blue-500 text-white text-[11px] font-bold rounded-lg transition-all cursor-pointer disabled:opacity-60 flex items-center gap-1.5"
              >
                {bulkApplying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                Apply
              </button>
            </div>
          )}
          {canEdit && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-white/60">Set priority:</span>
              <select
                id="bulk-priority-select"
                value={bulkPriority}
                onChange={e => setBulkPriority(e.target.value as PriorityLevel | '')}
                disabled={bulkApplying}
                className="text-[11px] font-bold bg-white/10 border border-white/20 text-white rounded-lg px-2.5 py-1.5 focus:outline-none cursor-pointer"
              >
                <option value="" disabled className="text-slate-400 bg-white">— pick —</option>
                {(['1 - Low', '2 - Moderate', '3 - High'] as const).map(p => (
                  <option key={p} value={p} className="text-slate-900 bg-white">{p}</option>
                ))}
              </select>
              <button
                onClick={handleBulkPriorityUpdate}
                disabled={!bulkPriority || bulkApplying}
                className="px-4 py-1.5 bg-[#0078C1] hover:bg-blue-500 text-white text-[11px] font-bold rounded-lg transition-all cursor-pointer disabled:opacity-60 flex items-center gap-1.5"
              >
                {bulkApplying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Apply
              </button>
            </div>
          )}
          <button
            onClick={() => setSelectedBulkIds(new Set())}
            className="text-white/50 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Record Created output-action confirmation */}
      {creationBanner && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg p-3 flex items-start justify-between gap-3 print:hidden" id="record-created-banner">
          <div className="space-y-1">
            <p className="font-bold text-[11px] uppercase tracking-wider">Record Created — Output Actions Fired</p>
            {creationBanner.lines.map((line, i) => (
              <span key={i} className="flex items-center gap-1.5 font-semibold text-xs">
                {outputLineIcon(line)} {line}
              </span>
            ))}
          </div>
          <button onClick={() => setCreationBanner(null)} className="text-emerald-700 hover:bg-emerald-100 p-1 rounded shrink-0"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* CREATE FORM */}
      {showForm && canEdit ? (
        <RecordCreateForm
          category={category}
          categoryLocked={true}
          companies={companies}
          onSubmit={onCreateRecord}
          onCancel={() => setShowForm(false)}
          outputActionConfigs={outputActionConfigs}
          onUpdateOutputActionConfig={onUpdateOutputActionConfig}
          onAfterSubmit={({ referenceLabel, lines }) =>
            setCreationBanner({ recordId: referenceLabel, lines })
          }
        />
      ) : selectedId && activeRecord ? (
        /* ── Full-page Entity Workspace ─────────────────────────────────────── */
        <DeliveryRecordWorkspace
          record={activeRecord}
          allRecordIds={sortedFiltered.map(r => r.id)}
          allRecords={records}
          currentUserRole={currentUserRole}
          currentUserName={currentUserName}
          companies={companies}
          onBack={() => setSelectedId(null)}
          onNavigateToRecord={id => setSelectedId(id)}
          onUpdateRecord={onUpdateRecord}
          outputActionConfigs={outputActionConfigs}
          forceReadOnly={category === 'RMA' && currentUserRole === 'Logistics'}
        />
      ) : (
        <div className="grid grid-cols-1 gap-6 items-start">
          {/* List — full width, no drawer */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm lg:col-span-3">
            <div className="p-4 border-b border-slate-200 space-y-0 print:hidden">
              {/* ── Primary toolbar bar ── */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                {/* LEFT: category label + status chips */}
                <div className="flex items-center gap-0 min-w-0 flex-wrap">
                  <span className="text-xs font-black text-slate-800 uppercase tracking-wider mr-3 shrink-0">{category}</span>
                  <div className="flex items-center gap-1.5 border-l border-slate-200 pl-3 flex-wrap">
                    {['All', ...DELIVERY_STATUSES].map(s => (
                      <button
                        key={s}
                        onClick={() => setStatusFilter(s)}
                        className={`px-3 py-1 rounded-lg text-[11px] font-semibold border transition-all cursor-pointer ${statusFilter === s
                          ? 'bg-[#1F3864] text-white border-[#1F3864]'
                          : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
                          }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>

                {/* RIGHT: search + filter toggle + record count */}
                <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end shrink-0">
                  <div className="relative flex-1 sm:w-56 sm:flex-initial">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search records..."
                      className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-xs focus:outline-hidden focus:ring-1 focus:ring-[#0078C1]" />
                  </div>
                  <div className="relative">
                    <button
                      ref={advFilterBtnRef}
                      onClick={() => {
                        setShowAdvancedFilters(v => {
                          const next = !v;
                          if (next) {
                            requestAnimationFrame(updatePopoverPosition);
                          }
                          return next;
                        });
                      }}
                      className={`relative flex items-center gap-1.5 px-2.5 py-2 rounded-lg border transition-all cursor-pointer ${showAdvancedFilters ? 'bg-blue-50 border-blue-300 text-blue-700' : hasAdvancedFilters ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-400'}`}
                      title="Toggle advanced filters"
                    >
                      <SlidersHorizontal className="w-4 h-4" />
                      {activeFilterCount > 0 && (
                        <span className="flex items-center justify-center min-w-[18px] h-[18px] px-1 bg-blue-600 text-white text-[10px] font-black rounded-full leading-none">
                          {activeFilterCount}
                        </span>
                      )}
                    </button>

                    {/* ── Advanced Filters Popover ── */}
                    {showAdvancedFilters && (
                      <div
                        ref={advFilterPanelRef}
                        className={`absolute ${popoverAlign === 'left' ? 'left-0' : 'right-0'} top-full mt-2 z-40 bg-white border border-slate-200 rounded-xl shadow-2xl p-4 space-y-4`}
                        style={{
                          width: `${popoverMaxWidth}px`,
                          maxWidth: 'calc(100vw - 2rem)',
                          maxHeight: 'calc(100vh - 180px)',
                          overflowY: 'auto',
                        }}
                      >
                        {/* Popover header */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <SlidersHorizontal className="w-4 h-4 text-slate-500" />
                            <span className="text-xs font-black text-slate-800 uppercase tracking-wider">Advanced Filters</span>
                            {activeFilterCount > 0 && (
                              <span className="flex items-center justify-center min-w-[18px] h-[18px] px-1 bg-blue-600 text-white text-[10px] font-black rounded-full leading-none">
                                {activeFilterCount}
                              </span>
                            )}
                          </div>
                          <button onClick={() => setShowAdvancedFilters(false)} className="p-1 hover:bg-slate-100 rounded-lg cursor-pointer transition-colors">
                            <X className="w-4 h-4 text-slate-400" />
                          </button>
                        </div>

                        {/* Geo filters */}
                        <div className="space-y-2">
                          <div className="flex items-center gap-1.5">
                            <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Location</span>
                          </div>
                          <div className="grid grid-cols-1 gap-2">
                            <select
                              value={regionFilter}
                              onChange={e => { setRegionFilter(e.target.value); setSubregionFilter('All Subregions'); setAreaFilter('All Areas'); }}
                              className="text-[11px] font-semibold border border-slate-200 rounded-lg px-2.5 py-2 w-full bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-[#0078C1] cursor-pointer"
                            >
                              <option value="All Regions">All Regions</option>
                              {AREA_HIERARCHY.map(r => <option key={r.region} value={r.region}>{r.region}</option>)}
                            </select>
                            <div className="grid grid-cols-2 gap-2">
                              <select
                                value={subregionFilter}
                                onChange={e => { setSubregionFilter(e.target.value); setAreaFilter('All Areas'); }}
                                className="text-[11px] font-semibold border border-slate-200 rounded-lg px-2.5 py-2 w-full bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-[#0078C1] cursor-pointer"
                              >
                                <option value="All Subregions">All Subregions</option>
                                {(regionFilter === 'All Regions' ? AREA_HIERARCHY : AREA_HIERARCHY.filter(r => r.region === regionFilter))
                                  .flatMap(r => r.subregions)
                                  .map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
                              </select>
                              <select
                                value={areaFilter}
                                onChange={e => setAreaFilter(e.target.value)}
                                className="text-[11px] font-semibold border border-slate-200 rounded-lg px-2.5 py-2 w-full bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-[#0078C1] cursor-pointer"
                              >
                                {distinctAreasForFilter.map(a => <option key={a} value={a}>{a}</option>)}
                              </select>
                            </div>
                          </div>
                        </div>

                        {/* AM + Driver */}
                        <div className="space-y-2">
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Personnel</span>
                          <div className="grid grid-cols-2 gap-2">
                            <AccountManagerCombobox
                              value={amFilter}
                              onChange={setAmFilter}
                              options={amOptions}
                              placeholder="Account Manager"
                              inputClassName="text-[11px] font-semibold border border-slate-200 rounded-lg px-2.5 py-2 w-full bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-[#0078C1] placeholder:text-slate-400"
                            />
                            <AccountManagerCombobox
                              value={driverFilter}
                              onChange={setDriverFilter}
                              options={driverOptions}
                              placeholder="Driver"
                              inputClassName="text-[11px] font-semibold border border-slate-200 rounded-lg px-2.5 py-2 w-full bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-[#0078C1] placeholder:text-slate-400"
                            />
                          </div>
                        </div>

                        {/* Date range + sort */}
                        <div className="space-y-2">
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Date Range</span>
                          <div className="flex items-center gap-2">
                            <input
                              ref={dateFromRef}
                              type="date"
                              value={dateFrom}
                              onChange={e => setDateFrom(e.target.value)}
                              title="Date from"
                              className="text-[11px] font-semibold border border-slate-200 rounded-lg px-2.5 py-2 bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-[#0078C1] cursor-pointer flex-1 min-w-0"
                            />
                            <span className="text-[11px] text-slate-400 font-semibold shrink-0">—</span>
                            <input
                              type="date"
                              value={dateTo}
                              onChange={e => setDateTo(e.target.value)}
                              title="Date to"
                              className="text-[11px] font-semibold border border-slate-200 rounded-lg px-2.5 py-2 bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-[#0078C1] cursor-pointer flex-1 min-w-0"
                            />
                            {(dateFrom || dateTo) && (
                              <button
                                onClick={() => { setDateFrom(''); setDateTo(''); }}
                                title="Clear date filter"
                                className="text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                          <select
                            value={dateSort}
                            onChange={e => setDateSort(e.target.value as typeof dateSort)}
                            disabled={!!(dateFrom || dateTo)}
                            title={(dateFrom || dateTo) ? 'Sort order is N/A while a date range filter is active' : undefined}
                            className={`text-[11px] font-semibold border rounded-lg px-2.5 py-2 w-full focus:outline-none focus:ring-1 focus:ring-[#0078C1] ${(dateFrom || dateTo) ? 'border-slate-100 bg-slate-50 text-slate-400 cursor-not-allowed' : 'border-slate-200 bg-white text-slate-700 cursor-pointer'}`}
                          >
                            {(dateFrom || dateTo) && <option value={dateSort}>Sort: N/A</option>}
                            <option value="default">Date: Default</option>
                            <option value="nearest">Nearest to Present</option>
                            <option value="oldest">Oldest First</option>
                            <option value="furthest">Furthest Future First</option>
                          </select>
                        </div>

                        {/* Footer: Clear all + Apply/Close */}
                        <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                          {hasAdvancedFilters ? (
                            <button
                              onClick={() => { setRegionFilter('All Regions'); setSubregionFilter('All Subregions'); setAreaFilter('All Areas'); setAmFilter(''); setDriverFilter(''); setDateFrom(''); setDateTo(''); setDateSort('default'); }}
                              className="px-3 py-1.5 text-red-600 hover:bg-red-50 font-bold text-[10px] uppercase cursor-pointer rounded-lg transition-colors"
                            >
                              Clear All Filters
                            </button>
                          ) : (
                            <span className="text-[10px] text-slate-400">No filters active</span>
                          )}
                          <button
                            onClick={() => setShowAdvancedFilters(false)}
                            className="px-4 py-1.5 bg-[#1F3864] hover:bg-blue-900 text-white text-[11px] font-bold rounded-lg transition-colors cursor-pointer"
                          >
                            Done
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                  <span className="text-[11px] font-bold text-slate-400 tabular-nums shrink-0">{sortedFiltered.length}</span>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] table-fixed text-left border-collapse text-sm">
                <colgroup>
                  {showCheckbox && <col style={{ width: '4%', minWidth: '40px' }} />}
                  <col style={{ width: `${colPct.id}%`, minWidth: colMinWidth.id }} />
                  <col style={{ width: `${colPct.company}%`, minWidth: colMinWidth.company }} />
                  <col style={{ width: `${colPct.area}%`, minWidth: colMinWidth.area }} />
                  <col style={{ width: `${colPct.date}%`, minWidth: colMinWidth.date }} />
                  <col style={{ width: `${colPct.driver}%`, minWidth: colMinWidth.driver }} />
                  <col style={{ width: `${colPct.status}%`, minWidth: colMinWidth.status }} />
                  {showCollectionCol && <col style={{ width: '8%', minWidth: '90px' }} />}
                </colgroup>
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-200 text-xs font-black text-slate-500 uppercase tracking-wider">
                    {showCheckbox && (
                      <th className="px-4 py-3" style={{ minWidth: '40px' }}>
                        <input
                          type="checkbox"
                          className="rounded cursor-pointer"
                          checked={sortedFiltered.length > 0 && selectedBulkIds.size === sortedFiltered.length}
                          onChange={toggleAllBulk}
                        />
                      </th>
                    )}
                    <th className="px-4 py-3" style={{ minWidth: colMinWidth.id }}>Record ID</th>
                    <th className="px-4 py-3" style={{ minWidth: colMinWidth.company }}>Company</th>
                    <th className="px-4 py-3" style={{ minWidth: colMinWidth.area }}>Area</th>
                    <th className="px-4 py-3 text-center" style={{ minWidth: colMinWidth.date }}>Delivery Date</th>
                    <th className="px-4 py-3" style={{ minWidth: colMinWidth.driver }}>Driver</th>
                    <th className="px-4 py-3 text-center" style={{ minWidth: colMinWidth.status }}>Status</th>
                    {currentUserRole === 'TASS' && category === 'Accounting Collection' && (
                      <th className="px-4 py-3 text-center" style={{ minWidth: '90px' }}>Collection</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedRecords.length === 0 ? (
                    <tr><td colSpan={10} className="px-4 py-3.5 text-center text-gray-400">No matching records found.</td></tr>
                  ) : paginatedRecords.map(rec => {
                    const isSelected = selectedId === rec.id;
                    return (
                      <tr key={rec.id} onClick={() => { setSelectedId(rec.id); setShowForm(false); }}
                        className={`hover:bg-slate-50 cursor-pointer transition-all ${isSelected ? 'bg-blue-50/80 font-medium border-l-4 border-l-[#0078C1]' : ''}`}>
                        {showCheckbox && (
                          <td className="px-4 py-3.5">
                            <input
                              type="checkbox"
                              className="rounded cursor-pointer"
                              checked={selectedBulkIds.has(rec.id)}
                              onClick={e => e.stopPropagation()}
                              onChange={() => toggleBulkId(rec.id)}
                            />
                          </td>
                        )}
                        <td className="px-4 py-3.5 font-bold text-slate-400 truncate">{rec.id}</td>
                        <td className="px-4 py-3.5">
                          <div className="font-medium text-sm text-slate-900 truncate" title={rec.company_name}>{rec.company_name}</div>
                          <div className="text-xs text-gray-400 mt-0.5 truncate" title={rec.area}>{rec.area}</div>
                        </td>
                        <td className="px-4 py-3.5 truncate text-slate-600" title={rec.area}>{rec.area}</td>
                        <td className="px-4 py-3.5 text-center text-slate-600 tabular-nums">{rec.delivery_date}</td>
                        <td className="px-4 py-3.5 truncate text-slate-600" title={rec.driver}>{rec.driver || <span className="text-xs text-slate-400 italic">Unassigned</span>}</td>
                        <td className="px-4 py-3.5 text-center">
                          <span className={`px-2.5 py-0.5 rounded-full border text-[10.5px] font-semibold inline-block ${statusColor(rec.status)}`}>{rec.status}</span>
                        </td>
                        {currentUserRole === 'TASS' && category === 'Accounting Collection' && (
                          <td className="px-4 py-3.5 text-center">
                            {rec.collection_verified
                              ? <span className="text-emerald-600 font-bold text-[10px] flex items-center justify-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Verified</span>
                              : <span className="text-slate-300 text-[10px] italic">—</span>
                            }
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="border-t border-slate-200 print:hidden">
              <Pagination
                currentPage={safeCurrentPage}
                totalPages={totalPages}
                totalItems={sortedFiltered.length}
                pageSize={pageSize}
                onPageChange={setCurrentPage}
                onPageSizeChange={(newSize) => {
                  setPageSize(newSize);
                  setCurrentPage(1);
                }}
                pageSizeOptions={[10, 25, 50, 100]}
              />
            </div>
          </div >
        </div >
      )
      }

      {/* Print-only header for PDF export */}
      <div className="hidden print:block mb-4">
        <h1 className="text-lg font-bold">Accounting Collection Records — {new Date().toLocaleDateString()}</h1>
      </div>
    </div >
  );
}
