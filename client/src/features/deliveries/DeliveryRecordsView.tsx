import { selectableStatuses, manilaToday, isPriorityLocked, PRIORITY_LOCKED_NOTE } from '@/utils/recordLifecycle';
import React, { useState, useEffect, useMemo, useRef } from 'react';
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
import { routeSlipModeForDates, routeSlipPeriod, routeSlipSelectionError, type RouteSlipPeriodMode, type RouteSlipPeriodSelection } from '@/utils/routeSlipPeriod';
import Pagination, { DEFAULT_PAGE_SIZE } from '@/components/Pagination';
import { computeAllOpsSummary } from '@/utils/allOpsExport';
import { DELIVERY_COLUMNS, AC_EXTRA_COLUMNS, RMA_EXTRA_COLUMNS, PDF_DELIVERY_COLUMNS, PDF_AC_COLUMNS, PDF_RMA_COLUMNS, fmtDate, fmtDatetime, fmtStatus, StatusHistoryCounts } from '@/utils/export';
import { DeliveryRecord, DeliveryCategory, UserRole, DeliveryStatus, OutputActionConfig, OutputActionTrigger, PriorityLevel } from '@/types';
import { ApiCompany, api, apiUrl, ApiError } from '@/api';
import { usePagedRecordsQuery, normalizeApiRecord } from '@/api/queries/useRecordsQuery';
import { sortDeliveryRows } from '@/utils/dateSort';
import { DELIVERY_STATUSES, AREA_HIERARCHY, getRegion, getSubregion } from '@/data';
import DeliveryRecordWorkspace from '@/features/deliveries/DeliveryRecordWorkspace';
import RecordCreateForm from '@/features/deliveries/RecordCreateForm';
import FilterPopover, { FilterCombobox } from '@/components/FilterPopover';
import { dateRangeState } from '@/utils/dateRange';
import DateRangePicker from '@/components/DateRangePicker';
import { DashboardFilterId, matchesDashboardFilter } from '@/utils/dashboardFilters';
import DashboardFilterChip from '@/components/DashboardFilterChip';

interface DeliveryRecordsViewProps {
  category: DeliveryCategory;
  title?: string;
  subtitle?: string;
  records: DeliveryRecord[];
  companies: ApiCompany[];
  currentUserRole: UserRole;
  currentUserName: string;
  onCreateRecord: (data: Omit<DeliveryRecord, 'id' | 'created_by' | 'created_at' | 'modified_by' | 'modified_at' | 'email_notification_sent'>) => Promise<DeliveryRecord>;
  onUpdateRecord: (id: string, updates: Partial<DeliveryRecord>) => Promise<void>;
  onVerifyCollection: (id: string) => Promise<void>;
  outputActionConfigs: Record<OutputActionTrigger, OutputActionConfig>;
  onUpdateOutputActionConfig: (trigger: OutputActionTrigger, patch: Partial<OutputActionConfig>) => void;
  selectedRecordIdFromDashboard?: string | null;
  clearSelectedRecordId?: () => void;
  dashboardFilterId: DashboardFilterId | null;
  clearDashboardFilter: () => void;
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
    case 'Draft': return 'bg-slate-100 text-slate-700 border-slate-300';
    case 'In Transit': return 'bg-cyan-50 text-cyan-700 border-cyan-200';
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
  dashboardFilterId,
  clearDashboardFilter,
  onRefresh
}: DeliveryRecordsViewProps) {
  const showAccountManagerFilter = category !== 'RMA';
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [regionFilter, setRegionFilter] = useState<string>('All Regions');
  const [subregionFilter, setSubregionFilter] = useState<string>('All Subregions');
  const [areaFilter, setAreaFilter] = useState<string>('All Areas');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [routeSlipMode, setRouteSlipMode] = useState<RouteSlipPeriodMode>('day');
  const [dateSort, setDateSort] = useState<'default' | 'nearest' | 'oldest' | 'furthest'>('default');
  const [amFilter, setAmFilter] = useState('');
  const [driverFilter, setDriverFilter] = useState('');
  const [showDateRangePicker, setShowDateRangePicker] = useState(false);
  // Always enforce chronological date ranges across all categories and roles.
  const {
    error: dateRangeError,
    appliedDateFrom,
    appliedDateTo,
  } = dateRangeState(dateFrom, dateTo);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [creationBanner, setCreationBanner] = useState<{ recordId: string; referenceLabel: string; lines: string[] } | null>(null);


  // Bulk selection (Logistics only)
  const [selectedBulkIds, setSelectedBulkIds] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState<DeliveryStatus | ''>('');
  const [bulkApplying, setBulkApplying] = useState(false);
  const [bulkPriority, setBulkPriority] = useState<PriorityLevel | ''>('');
  const [bulkResult, setBulkResult] = useState<{ ok: boolean; message: string } | null>(null);

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

  const initializedCategoryRef = useRef<DeliveryCategory | null>(null);

  // Reset module state before applying an incoming record link so initialization
  // cannot clear the linked selection. Consuming the link must retain local state.
  useEffect(() => {
    if (initializedCategoryRef.current !== category) {
      initializedCategoryRef.current = category;
      setSelectedId(null);
      setShowForm(false);
      setRegionFilter('All Regions');
      setSubregionFilter('All Subregions');
      setAreaFilter('All Areas');
      setRouteSlipMode('day'); setDateFrom('');
      setDateTo('');
      setShowDateRangePicker(false);
      setDateSort('default');
      setAmFilter('');
      setDriverFilter('');
      setSelectedBulkIds(new Set());
      setBulkStatus('');
      setBulkPriority('');
      setBulkResult(null);
    }

    if (selectedRecordIdFromDashboard) {
      setSelectedId(selectedRecordIdFromDashboard);
      setShowForm(false);
      clearSelectedRecordId?.();
    }
  }, [category, selectedRecordIdFromDashboard, clearSelectedRecordId]);

  useEffect(() => {
    setSearchQuery('');
    setStatusFilter('All');
    setRegionFilter('All Regions');
    setSubregionFilter('All Subregions');
    setAreaFilter('All Areas');
    setRouteSlipMode('day'); setDateFrom('');
    setDateTo('');
    setDateSort('default');
    setAmFilter('');
    setDriverFilter('');

    if (category === 'Deliveries') {
      if (dashboardFilterId === 'sc-scheduled-today') {
        const today = manilaToday();
        setStatusFilter('Scheduled');
        setRouteSlipMode('day'); setDateFrom(today);
        setDateTo(today);
      } else if (dashboardFilterId === 'sc-on-hold' || dashboardFilterId === 'log-on-hold') {
        setStatusFilter('On-Hold');
      } else if (dashboardFilterId === 'sc-rescheduled' || dashboardFilterId === 'log-rescheduled') {
        setStatusFilter('Rescheduled');
      } else if (dashboardFilterId === 'log-assigned-today') {
        const today = manilaToday();
        setRouteSlipMode('day'); setDateFrom(today);
        setDateTo(today);
      } else if (dashboardFilterId === 'sc-completed-today' || dashboardFilterId === 'log-completed-today') {
        setStatusFilter('Delivered');
      }
    } else if (category === 'RMA' && dashboardFilterId === 'tass-rma-on-hold') {
      setStatusFilter('On-Hold');
    }
  }, [dashboardFilterId, category]);

  const [statusHistoryCounts, setStatusHistoryCounts] = useState<StatusHistoryCounts | undefined>(undefined);

  useEffect(() => {
    if (dateRangeError) {
      setStatusHistoryCounts(undefined);
      return;
    }
    let active = true;
    const params = new URLSearchParams();
    const CATEGORY_TO_DB: Record<string, string> = {
      'Deliveries': 'DELIVERY', 'RMA': 'RMA', 'Accounting Collection': 'ACCOUNTING_COLLECTION',
      'Procurement Pick-up': 'PROCUREMENT_PICKUP', 'Sales Orders': 'SALES_ORDERS',
    };
    if (category) params.set('category', CATEGORY_TO_DB[category] ?? category);
    if (appliedDateFrom) params.set('deliveryDateFrom', appliedDateFrom);
    if (appliedDateTo) params.set('deliveryDateTo', appliedDateTo);
    if (areaFilter !== 'All Areas') params.set('area', areaFilter);
    if (regionFilter !== 'All Regions') params.set('region', regionFilter);
    if (subregionFilter !== 'All Subregions') params.set('subregion', subregionFilter);
    if (driverFilter) params.set('driver', driverFilter);
    if (statusFilter !== 'All') params.set('status', statusFilter);

    fetch(`${apiUrl('/records/status-history-counts')}?${params}`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (active) setStatusHistoryCounts(data ?? undefined); })
      .catch(() => { if (active) setStatusHistoryCounts(undefined); });
    return () => { active = false; };
  }, [category, dateRangeError, appliedDateFrom, appliedDateTo, areaFilter, regionFilter, subregionFilter, driverFilter, statusFilter]);



  const canEdit =
    currentUserRole === 'Sales Coordinator' ||
    (currentUserRole === 'Logistics' && category !== 'RMA') ||
    (currentUserRole === 'TASS' && category === 'RMA');
  const canCreateRecord = canEdit && !(currentUserRole === 'Logistics' && category === 'Deliveries');
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
    if (dashboardFilterId && !matchesDashboardFilter(r, dashboardFilterId)) return false;
    if (regionFilter !== 'All Regions' && getRegion(r.area) !== regionFilter) return false;
    if (subregionFilter !== 'All Subregions' && getSubregion(r.area) !== subregionFilter) return false;
    if (areaFilter !== 'All Areas' && r.area !== areaFilter) return false;
    if (statusFilter !== 'All' && r.status !== statusFilter) return false;
    if (showAccountManagerFilter && amFilter && !r.account_manager.toLowerCase().includes(amFilter.toLowerCase())) return false;
    if (driverFilter && !r.driver.toLowerCase().includes(driverFilter.toLowerCase())) return false;
    if (appliedDateFrom && (!r.delivery_date || r.delivery_date < appliedDateFrom)) return false;
    if (appliedDateTo && (!r.delivery_date || r.delivery_date > appliedDateTo)) return false;
    const q = searchQuery.toLowerCase();
    if (!q) return true;
    return (
      r.id.toLowerCase().includes(q) ||
      r.company_name.toLowerCase().includes(q) ||
      r.reference.toLowerCase().includes(q) ||
      (r.legacy_sap_reference ?? '').toLowerCase().includes(q) ||
      (r.rma_type ?? '').toLowerCase().includes(q) ||
      (r.customer_contact_name ?? '').toLowerCase().includes(q) ||
      (r.customer_contact_email ?? '').toLowerCase().includes(q) ||
      (r.customer_contact_phone ?? '').toLowerCase().includes(q) ||
      r.driver.toLowerCase().includes(q) ||
      r.area.toLowerCase().includes(q) ||
      r.account_manager.toLowerCase().includes(q)
    );
  });

  const now = Date.now();
  const sortRows = <T extends { delivery_date?: string | null }>(rows: T[]) => sortDeliveryRows(rows, dateSort, now);
  const sortedFiltered = dateRangeError ? [] : sortRows(baseFiltered);

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  const effectiveStatusFilter = statusFilter !== 'All' ? statusFilter : undefined;
  const effectiveAmFilter = showAccountManagerFilter ? amFilter || undefined : undefined;
  const hasInvalidDateRange = Boolean(dateRangeError);
  const effectiveDateFrom = appliedDateFrom || undefined;
  const effectiveDateTo = appliedDateTo || undefined;
  const effectiveAreaFilter = areaFilter !== 'All Areas' ? areaFilter : undefined;

  const { data: pagedData, isLoading: pagedLoading } = usePagedRecordsQuery({
    category,
    dateSort,
    page: currentPage,
    limit: pageSize,
    status: effectiveStatusFilter,
    search: searchQuery || undefined,
    driver: driverFilter || undefined,
    area: effectiveAreaFilter,
    region: regionFilter !== 'All Regions' ? regionFilter : undefined,
    subregion: subregionFilter !== 'All Subregions' ? subregionFilter : undefined,
    account_manager: effectiveAmFilter,
    dateFrom: effectiveDateFrom,
    dateTo: effectiveDateTo,
    dashboard_filter: dashboardFilterId || undefined,
    paged: true,
  }, Boolean(category) && !hasInvalidDateRange);

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
    dashboardFilterId,
  ]);

  const displayTotalCount = hasInvalidDateRange ? 0 : pagedData ? pagedData.total : sortedFiltered.length;
  const displayTotalPages = hasInvalidDateRange ? 1 : pagedData
    ? Math.max(1, Math.ceil(pagedData.total / pageSize))
    : Math.max(1, Math.ceil(sortedFiltered.length / pageSize));
  const safeCurrentPage = Math.min(Math.max(1, currentPage), displayTotalPages);

  const paginatedRecords = useMemo(() => {
    const startIndex = (safeCurrentPage - 1) * pageSize;
    return sortedFiltered.slice(startIndex, startIndex + pageSize);
  }, [sortedFiltered, safeCurrentPage, pageSize]);

  // Apply the client-side sort to server-paged rows so the sort dropdown
  // works even when the API does not support an order-by parameter.
  const displayRecords = hasInvalidDateRange ? [] : pagedData ? pagedData.rows : paginatedRecords;

  const activeRecord = (pagedData?.rows ?? []).find(r => r.id === selectedId) || records.find(r => r.id === selectedId);

  // Delivered records keep their Priority, so a bulk Priority never applies to them (TSK-124).
  const allSelectedPriorityLocked = selectedBulkIds.size > 0 && [...selectedBulkIds].every(id => {
    const record = categoryRecords.find(r => r.id === id);
    return !!record && isPriorityLocked(record);
  });
  const effectiveBulkPriority: PriorityLevel | '' = allSelectedPriorityLocked ? '' : bulkPriority;

  const handleBulkUpdate = async () => {
    if (selectedBulkIds.size === 0 || bulkApplying ||
      !((canAssignDriver && bulkStatus) || (canEdit && effectiveBulkPriority))) return;
    setBulkApplying(true);
    setBulkResult(null);
    const failedIds = new Set<string>();
    let firstError = '';
    let savedCount = 0;
    let unchangedCount = 0;
    let lockedCount = 0;
    const ids = [...selectedBulkIds];
    try {
      for (const id of ids) {
        try {
          const record = categoryRecords.find(record => record.id === id);
          if (!record) throw new Error('The selected record is no longer available. Refresh and try again.');
          const updates: Partial<DeliveryRecord> = {};
          const remarks: string[] = [];
          if (canAssignDriver && bulkStatus && record.status !== bulkStatus) {
            if (!selectableStatuses(record, currentUserRole).includes(bulkStatus)) throw new Error("This status transition is not available for the selected record.");
            updates.status = bulkStatus;
            remarks.push(`Status set to ${bulkStatus}`);
          }
          const priorityLocked = canEdit && !!effectiveBulkPriority && isPriorityLocked(record);
          if (priorityLocked) lockedCount++;
          if (canEdit && effectiveBulkPriority && !priorityLocked && record.priority !== effectiveBulkPriority) {
            updates.priority = effectiveBulkPriority;
            remarks.push(`Priority set to ${effectiveBulkPriority}`);
          }
          if (remarks.length === 0) {
            if (!priorityLocked) unchangedCount++;
            continue;
          }
          updates.remarks = remarks.join('; ');
          await onUpdateRecord(id, updates);
          savedCount++;
        } catch (error) {
          failedIds.add(id);
          if (!firstError) firstError = error instanceof Error ? error.message : 'Please try again.';
        }
      }
      setSelectedBulkIds(failedIds);
      const messages: string[] = [];
      if (savedCount > 0) {
        const savedRecords = `${savedCount} record${savedCount === 1 ? '' : 's'}`;
        if (canAssignDriver && bulkStatus && canEdit && effectiveBulkPriority) {
          messages.push(`Status and priority changes applied to ${savedRecords}.`);
        } else if (canAssignDriver && bulkStatus) {
          messages.push(`Status updated for ${savedRecords}.`);
          if (canEdit) messages.push('Priority kept unchanged.');
        } else {
          messages.push(`Priority updated for ${savedRecords}.`);
          if (canAssignDriver) messages.push('Status kept unchanged.');
        }
      }
      if (unchangedCount > 0) {
        messages.push(`${unchangedCount} record${unchangedCount === 1 ? '' : 's'} already matched the selected values.`);
      }
      if (lockedCount > 0) {
        messages.push(`${lockedCount} Delivered record${lockedCount === 1 ? ' was' : 's were'} skipped — ${PRIORITY_LOCKED_NOTE.charAt(0).toLowerCase()}${PRIORITY_LOCKED_NOTE.slice(1)}`);
      }
      if (failedIds.size > 0) {
        messages.push(`${failedIds.size} record${failedIds.size === 1 ? '' : 's'} failed to update and ${failedIds.size === 1 ? 'remains' : 'remain'} selected for retry.`);
        if (firstError) messages.push(firstError);
      }
      setBulkResult({ ok: failedIds.size === 0, message: messages.join(' ') });
    } finally {
      setBulkApplying(false);
    }
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
    return ['Sales Coordinator', 'Logistics', 'TASS', 'Admin'].includes(currentUserRole);
  })();

  const isAC = category === 'Accounting Collection';
  const isRma = category === 'RMA';
  const baseExportColumns = isRma
    ? DELIVERY_COLUMNS.map(column => column.key === 'reference' ? { ...column, header: 'RMA Document Reference', key: 'rma_reference' } : column)
    : DELIVERY_COLUMNS;
  const exportColumns = isAC ? [...DELIVERY_COLUMNS, ...AC_EXTRA_COLUMNS] : isRma ? [...baseExportColumns, ...RMA_EXTRA_COLUMNS] : DELIVERY_COLUMNS;
  const pdfCols = isAC ? PDF_AC_COLUMNS : isRma ? PDF_RMA_COLUMNS : PDF_DELIVERY_COLUMNS;
  const exportRows = sortedFiltered.map(r => ({
    id: r.id,
    company_name: r.company_name,
    reference: r.reference,
    rma_reference: r.rma_reference ?? '',
    legacy_sap_reference: r.legacy_sap_reference ?? '',
    rma_type: r.rma_type ?? '',
    purchase_date_fmt: r.purchase_date ? fmtDate(r.purchase_date) : '',
    customer_contact_name: r.customer_contact_name ?? '',
    customer_contact_email: r.customer_contact_email ?? '',
    customer_contact_phone: r.customer_contact_phone ?? '',
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
    dateRange: appliedDateFrom || appliedDateTo
      ? `${appliedDateFrom || 'earliest'} to ${appliedDateTo || 'latest'}`
      : 'All dates',
    dateBasis: 'Delivery Date (Asia/Manila)',
    generatedByName: currentUserName,
    generatedByRole: currentUserRole
  };

  const exportSummary = computeAllOpsSummary(
    sortedFiltered,
    dateSort === 'default' ? 'nearest' : dateSort
  );

  const routeSlipSelection: RouteSlipPeriodSelection = { mode: routeSlipMode, dateFrom, dateTo };
  const changeRouteSlipSelection = (selection: RouteSlipPeriodSelection) => {
    setRouteSlipMode(selection.mode);
    setDateFrom(selection.dateFrom);
    setDateTo(selection.mode === 'day' ? selection.dateFrom : selection.mode === 'from' ? '' : selection.dateTo);
  };
  const routeSlipProps = driverFilter
    ? { records: sortedFiltered, ...routeSlipPeriod(routeSlipSelection), preparedBy: currentUserName }
    : undefined;

  const fetchRouteSlipRecords = async () => {
    const error = routeSlipSelectionError(routeSlipSelection);
    if (error) throw new Error(error);
    const raw = await api.getAllRecordsForExport({
      category,
      status: effectiveStatusFilter,
      search: searchQuery || undefined,
      driver: driverFilter || undefined,
      area: effectiveAreaFilter,
      region: regionFilter !== 'All Regions' ? regionFilter : undefined,
      subregion: subregionFilter !== 'All Subregions' ? subregionFilter : undefined,
      account_manager: effectiveAmFilter,
      ...routeSlipPeriod(routeSlipSelection),
      dashboard_filter: dashboardFilterId || undefined,
    });
    return sortRows(raw.map(normalizeApiRecord));
  };

  const fetchExportData = async () => {
    const rawAll = await api.getAllRecordsForExport({
      category,
      status: effectiveStatusFilter,
      search: searchQuery || undefined,
      driver: driverFilter || undefined,
      area: effectiveAreaFilter,
      region: regionFilter !== 'All Regions' ? regionFilter : undefined,
      subregion: subregionFilter !== 'All Subregions' ? subregionFilter : undefined,
      account_manager: effectiveAmFilter,
      dateFrom: effectiveDateFrom,
      dateTo: effectiveDateTo,
      dashboard_filter: dashboardFilterId || undefined,
    });
    const allRecords = rawAll.map(normalizeApiRecord);
    const sortedAll = sortRows(allRecords);

    const rows = sortedAll.map(r => ({
      id: r.id,
      company_name: r.company_name,
      reference: r.reference,
      rma_reference: r.rma_reference ?? '',
      legacy_sap_reference: r.legacy_sap_reference ?? '',
      rma_type: r.rma_type ?? '',
      purchase_date_fmt: r.purchase_date ? fmtDate(r.purchase_date) : '',
      customer_contact_name: r.customer_contact_name ?? '',
      customer_contact_email: r.customer_contact_email ?? '',
      customer_contact_phone: r.customer_contact_phone ?? '',
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

    const summary = computeAllOpsSummary(
      sortedAll,
      dateSort === 'default' ? 'nearest' : dateSort
    );

    const rsProps = driverFilter
      ? {
        records: sortedAll,
        ...routeSlipPeriod(routeSlipSelection),
        preparedBy: currentUserName,
      }
      : undefined;

    return { rows, summary, routeSlipProps: rsProps };
  };

  const isCreating = showForm && canCreateRecord;

  const activeFilterCount = [
    regionFilter !== 'All Regions', subregionFilter !== 'All Subregions', areaFilter !== 'All Areas',
    showAccountManagerFilter && !!amFilter, !!driverFilter, Boolean(dateFrom || dateTo), dateSort !== 'default',
    statusFilter !== 'All', !!searchQuery,
    !!dashboardFilterId,
  ].filter(Boolean).length;

  const clearAllFilters = () => {
    setSearchQuery(''); setStatusFilter('All'); setRegionFilter('All Regions');
    setSubregionFilter('All Subregions'); setAreaFilter('All Areas');
    setAmFilter(''); setDriverFilter(''); setRouteSlipMode('day'); setDateFrom(''); setDateTo(''); setDateSort('default');
    clearDashboardFilter();
  };


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
    <div className="space-y-3 print:space-y-2" id={`records-view-${category.toLowerCase().replace(/\s+/g, '-')}`}>
      <DashboardFilterChip
        filterId={dashboardFilterId}
        onClear={clearAllFilters}
      />
      {bulkResult && (
        <div role={bulkResult.ok ? 'status' : 'alert'} className={`rounded-lg border px-4 py-3 text-sm ${bulkResult.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
          {bulkResult.message}
        </div>
      )}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-3 print:hidden" id="records-toolbar">
        {/* View Actions */}
        <div className="flex items-center justify-end gap-2 flex-wrap">
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
              routeSlipPeriodFields={{ selection: routeSlipSelection, onChange: changeRouteSlipSelection }}
              statusHistoryCounts={statusHistoryCounts}
              totalCount={displayTotalCount}
              fetchExportData={fetchExportData}
            />
          )}
          {showExports && (
            <RouteSlipMenu
              driverFilter={driverFilter}
              selection={routeSlipSelection}
              onChange={changeRouteSlipSelection}
              fetchRecords={fetchRouteSlipRecords}
              preparedBy={currentUserName}
              filename={category.toLowerCase().replace(/\s+/g, '-')}
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
          {canCreateRecord && (
            <button
              onClick={() => { setShowForm(true); setSelectedId(null); }}
              className="bg-[#1F3864] hover:bg-blue-900 text-white text-[12px] font-bold px-3.5 py-2 rounded-lg flex items-center gap-1.5 transition-all shadow-xs cursor-pointer self-start"
            >
              <Plus className="w-4 h-4" /> New Record
            </button>
          )}
        </div>

        {/* One shared set of list filters, hidden while creating a record. */}
        {!isCreating && (
        <div className="grid grid-cols-1 min-[400px]:grid-cols-2 lg:grid-cols-4 gap-3 items-start text-xs" id="date-range-filters">
        <div className="min-w-0 min-[400px]:col-span-2">
          <DateRangePicker dateFrom={dateFrom} dateTo={dateTo} open={showDateRangePicker} onOpenChange={setShowDateRangePicker}
            onChange={range => { setRouteSlipMode(routeSlipModeForDates(range.from, range.to)); setDateFrom(range.from); setDateTo(range.to); }} />
        </div>
        <div className="space-y-1 min-w-0">
          <label htmlFor="recordStatusFilter" className="font-bold text-slate-700 block">Status</label>
          <select
            id="recordStatusFilter"
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="min-h-10 w-full text-xs font-semibold border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-[#0078C1] cursor-pointer"
          >
            <option value="All">All Statuses</option>
            {DELIVERY_STATUSES.map(status => <option key={status} value={status}>{status}</option>)}
          </select>
        </div>
        <div className="space-y-1 min-w-0">
          <label htmlFor="dateSort" className="font-bold text-slate-700 block">Sort</label>
          <select
            id="dateSort"
            value={dateSort}
            onChange={e => setDateSort(e.target.value as typeof dateSort)}
            className="min-h-10 w-full text-xs font-semibold border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-[#0078C1] cursor-pointer"
          >
            <option value="default">Date: Default</option>
            <option value="nearest">Nearest to Present</option>
            <option value="oldest">Oldest First</option>
            <option value="furthest">Furthest Future First</option>
          </select>
        </div>
        {activeFilterCount > 0 && (
          <div className="col-span-full flex justify-end">
            <button
              onClick={clearAllFilters}
              className="min-h-10 px-3 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-[11px] rounded-lg cursor-pointer flex items-center gap-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0078C1]"
            >
              <X className="w-3.5 h-3.5" /> Clear All Filters
            </button>
          </div>
        )}
        </div>
        )}
      </div>

      {/* Bulk action bar — Logistics: status / Sales Coordinator: priority */}
      {selectedBulkIds.size > 0 && (canAssignDriver || canEdit) && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-[#1F3864] text-white rounded-2xl shadow-2xl px-5 py-3.5 flex items-center gap-4 print:hidden" id="bulk-action-bar">
          <ListChecks className="w-4 h-4 text-blue-300 shrink-0" />
          <span className="text-sm font-bold text-white">{selectedBulkIds.size} selected</span>
          {canAssignDriver && (
            <div className="flex items-center gap-2" title="Complete deliveries individually with Time In, a saved JPG/PNG photo, Received By, and remarks.">
              <span className="text-xs text-white/60">Set status:</span>
              <select
                value={bulkStatus}
                onChange={e => setBulkStatus(e.target.value as DeliveryStatus | '')}
                disabled={bulkApplying}
                className="text-[11px] font-bold bg-white/10 border border-white/20 text-white rounded-lg px-2.5 py-1.5 focus:outline-none cursor-pointer"
              >
                <option value="" className="text-slate-900 bg-white">Keep unchanged</option>
                {DELIVERY_STATUSES.filter(s => s !== 'In Transit' && s !== 'Delivered' && s !== 'Draft' && !(category === 'Deliveries' && s === 'Rescheduled') && [...selectedBulkIds].every(id => { const record = categoryRecords.find(r => r.id === id); return record && (record.status === s || selectableStatuses(record, currentUserRole).includes(s)); })).map(s => (
                  <option key={s} value={s} className="text-slate-900 bg-white">{s}</option>
                ))}
              </select>
              {category === 'Deliveries' && <span className="text-[10px] text-white/60 max-w-48 leading-tight">Reschedule deliveries one at a time to set each new date.</span>}
            </div>
          )}
          {canEdit && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-white/60">Set priority:</span>
              <select
                id="bulk-priority-select"
                value={effectiveBulkPriority}
                onChange={e => setBulkPriority(e.target.value as PriorityLevel | '')}
                disabled={bulkApplying || allSelectedPriorityLocked}
                aria-describedby={allSelectedPriorityLocked ? 'bulk-priority-locked-hint' : undefined}
                className="text-[11px] font-bold bg-white/10 border border-white/20 text-white rounded-lg px-2.5 py-1.5 focus:outline-none cursor-pointer"
              >
                <option value="" className="text-slate-900 bg-white">Keep unchanged</option>
                {(['1 - Low', '2 - Moderate', '3 - High'] as const).map(p => (
                  <option key={p} value={p} className="text-slate-900 bg-white">{p}</option>
                ))}
              </select>
              {allSelectedPriorityLocked && <span id="bulk-priority-locked-hint" className="text-[10px] text-white/60 max-w-48 leading-tight">{PRIORITY_LOCKED_NOTE}</span>}
            </div>
          )}
          <button
            onClick={handleBulkUpdate}
            disabled={bulkApplying || !((canAssignDriver && bulkStatus) || (canEdit && effectiveBulkPriority))}
            className="px-4 py-1.5 bg-[#0078C1] hover:bg-blue-500 text-white text-[11px] font-bold rounded-lg transition-all cursor-pointer disabled:opacity-60 flex items-center gap-1.5"
          >
            {bulkApplying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Apply
          </button>
          <button
            onClick={() => setSelectedBulkIds(new Set())}
            disabled={bulkApplying}
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
            <p className="font-bold text-[11px] uppercase tracking-wider">Record Created</p>
            <p className="text-xs font-semibold">{creationBanner.referenceLabel} · <span className="font-mono">{creationBanner.recordId}</span></p>
            {creationBanner.lines.map((line, i) => (
              <span key={i} className="flex items-center gap-1.5 font-semibold text-xs">
                {outputLineIcon(line)} {line}
              </span>
            ))}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={() => { setSelectedId(creationBanner.recordId); setCreationBanner(null); }} className="text-emerald-800 hover:bg-emerald-100 px-2 py-1 rounded text-xs font-bold">View record</button>
            <button onClick={() => setCreationBanner(null)} className="text-emerald-700 hover:bg-emerald-100 p-1 rounded"><X className="w-4 h-4" /></button>
          </div>
        </div>
      )}

      {/* CREATE FORM */}
      {isCreating ? (
        <RecordCreateForm
          category={category}
          categoryLocked={true}
          companies={companies}
          onSubmit={onCreateRecord}
          onCancel={() => setShowForm(false)}
          outputActionConfigs={outputActionConfigs}
          onUpdateOutputActionConfig={onUpdateOutputActionConfig}
          onAfterSubmit={({ recordId, referenceLabel, lines }) =>
            setCreationBanner({ recordId, referenceLabel, lines })
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
                        aria-pressed={statusFilter === s}
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
                      aria-label={`Search ${category === 'Deliveries' ? 'delivery' : category} records`}
                      className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-xs focus:outline-hidden focus:ring-1 focus:ring-[#0078C1]" />
                  </div>
                    <FilterPopover open={showAdvancedFilters} onOpenChange={setShowAdvancedFilters}
                      count={activeFilterCount}
                      onClear={clearAllFilters}>
                      <fieldset className="space-y-2 min-w-0">
                        <legend className="text-xs font-bold text-slate-800 mb-2">Location</legend>
                        <label className="block text-xs font-semibold text-slate-600">Region
                          <select value={regionFilter}
                            onChange={e => { setRegionFilter(e.target.value); setSubregionFilter('All Subregions'); setAreaFilter('All Areas'); }}
                            className="mt-1 min-h-10 text-xs border border-slate-200 rounded-lg px-2.5 py-2 w-full bg-white focus:ring-2 focus:ring-[#0078C1]">
                            <option value="All Regions">All Regions</option>
                            {AREA_HIERARCHY.map(r => <option key={r.region} value={r.region}>{r.region}</option>)}
                          </select>
                        </label>
                        <div className="grid grid-cols-1 min-[400px]:grid-cols-2 gap-2">
                          <label className="block min-w-0 text-xs font-semibold text-slate-600">Subregion
                            <select value={subregionFilter}
                              onChange={e => { setSubregionFilter(e.target.value); setAreaFilter('All Areas'); }}
                              className="mt-1 min-h-10 text-xs border border-slate-200 rounded-lg px-2.5 py-2 w-full bg-white focus:ring-2 focus:ring-[#0078C1]">
                              <option value="All Subregions">All Subregions</option>
                              {(regionFilter === 'All Regions' ? AREA_HIERARCHY : AREA_HIERARCHY.filter(r => r.region === regionFilter))
                                .flatMap(r => r.subregions).map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
                            </select>
                          </label>
                          <label className="block min-w-0 text-xs font-semibold text-slate-600">Area
                            <select value={areaFilter} onChange={e => setAreaFilter(e.target.value)}
                              className="mt-1 min-h-10 text-xs border border-slate-200 rounded-lg px-2.5 py-2 w-full bg-white focus:ring-2 focus:ring-[#0078C1]">
                              {distinctAreasForFilter.map(a => <option key={a} value={a}>{a}</option>)}
                            </select>
                          </label>
                        </div>
                      </fieldset>
                      <fieldset className="min-w-0">
                        <legend className="text-xs font-bold text-slate-800 mb-2">Personnel</legend>
                        <div className="grid grid-cols-1 min-[400px]:grid-cols-2 gap-2">
                          {showAccountManagerFilter && <FilterCombobox label="Account Manager" placeholder="All Account Managers" value={amFilter} onChange={setAmFilter} options={amOptions} />}
                          <FilterCombobox label="Driver" placeholder="All Drivers" value={driverFilter} onChange={setDriverFilter} options={driverOptions} />
                        </div>
                      </fieldset>
                    </FilterPopover>

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
                  {displayRecords.length === 0 ? (
                    <tr><td colSpan={10} className="px-4 py-3.5 text-center text-gray-400">
                      {pagedLoading ? 'Loading records…' : 'No matching records found.'}
                    </td></tr>
                  ) : displayRecords.map(rec => {
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
                          <div className="font-semibold text-sm text-slate-900 truncate" title={rec.company_name}>{rec.company_name}</div>
                          {category === 'RMA' && <div className="text-[10px] text-slate-500 mt-0.5 truncate" title={rec.rma_reference ?? ''}>RMA document ref: {rec.rma_reference || 'Not assigned'}</div>}
                          {category === 'RMA' && rec.legacy_sap_reference && <div className="text-[10px] text-slate-400 truncate" title={rec.legacy_sap_reference}>Legacy SAP ref: {rec.legacy_sap_reference}</div>}
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
                totalPages={displayTotalPages}
                totalItems={displayTotalCount}
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
