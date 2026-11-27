import RecordStatus from '@/components/RecordStatus';
import { usePermissions } from '@/hooks/usePermissions';
import { isViewOnlyCategory } from '@/utils/moduleAccessRules';
import { permissionCategory } from '@/utils/permissions';
import { rmaWorkflowExportFields } from '@/utils/rmaTransport';
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
  FileBarChart2,
  FileStack,
  FileSpreadsheet
} from 'lucide-react';
import ExportMenu from '@/components/ExportMenu';
import DriverReportModal from '@/features/drivers/DriverReportModal';
import RouteSlipMenu from '@/components/RouteSlipMenu';
import DailyHandoffControl from './DailyHandoffControl';
import { routeSlipModeForDates, routeSlipPeriod, routeSlipSelectionError, type RouteSlipPeriodMode, type RouteSlipPeriodSelection } from '@/utils/routeSlipPeriod';
import Pagination, { DEFAULT_PAGE_SIZE } from '@/components/Pagination';
import { computeAllOpsSummary } from '@/utils/allOpsExport';
import { DELIVERY_COLUMNS, AC_EXTRA_COLUMNS, RMA_EXTRA_COLUMNS, PDF_DELIVERY_COLUMNS, PDF_AC_COLUMNS, PDF_RMA_COLUMNS, fmtDate, fmtDatetime, fmtStatus, StatusHistoryCounts } from '@/utils/export';
import { DeliveryRecord, DeliveryCategory, UserRole, DeliveryStatus, OutputActionConfig, OutputActionTrigger, PriorityLevel } from '@/types';
import { ApiCompany, api, apiUrl, ApiError } from '@/api';
import BulkRmaSlipsDialog from './BulkRmaSlipsDialog';
import TassDailyRouteSlipDialog from './TassDailyRouteSlipDialog';
import DispatchToLogisticsDialog from './DispatchToLogisticsDialog';
import { formatRmaMovementBadge, formatRmaTableItemPreview, RMA_MOVEMENT_FILTER_OPTIONS, rmaTableItemTooltip } from '@/utils/rmaTableDisplay';
import { MAX_BULK_SLIP_RECORDS } from '@/utils/rmaClientSlipPdf';
import { usePagedRecordsQuery, useSelectedRecordQuery, normalizeApiRecord } from '@/api/queries/useRecordsQuery';
import { useRecordFilterOptionsQuery } from '@/api/queries/useOperationalViews';
import { sortDeliveryRows } from '@/utils/dateSort';
import { DELIVERY_STATUSES, AREA_HIERARCHY, getRegion, getSubregion } from '@/data';
import DeliveryRecordWorkspace from '@/features/deliveries/DeliveryRecordWorkspace';
import TassAdditionRequestActions from '@/features/masterDataRequests/TassAdditionRequestActions';
import RecordCreateForm from '@/features/deliveries/RecordCreateForm';
import FilterPopover, { FilterCombobox } from '@/components/FilterPopover';
import { dateRangeState } from '@/utils/dateRange';
import DateRangePicker from '@/components/DateRangePicker';
import { DashboardFilterId, matchesDashboardFilter } from '@/utils/dashboardFilters';
import DashboardFilterChip from '@/components/DashboardFilterChip';
import { DATA_SAMPLER_ENABLED } from '@/utils/developmentTools';
import { recordLabel } from '../../utils/recordLabel';
import { INTERNAL_TRANSFER_LABEL, RMA_CATEGORIES, canonicalRmaCategory, formatRmaCategoryOption, formatRmaContacts, isReturnToCustomerCategory, rmaCategoryPrefix } from '@/utils/rma';
import { formatRmaItemsSummary } from '@/utils/rmaItems';
import type { DeliveryRecord as RmaExportSource } from '@/types';
import {
  btnPrimaryClass,
  btnSecondaryClass,
  cardClass,
  filterChipClass,
  tableHeaderRowClass,
  tableLeadButtonClass,
  tableRowClass,
} from '@/utils/uiClasses';
import { EmptyState, TableSkeleton } from '@/components/UiPrimitives';

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
  /** Addition request opened from a notification or ?request= link (Feature 4b, RMA only). */
  selectedAdditionRequestId?: string | null;
  clearSelectedAdditionRequestId?: () => void;
}

// Small icon per output-action log message, purely cosmetic
const outputLineIcon = (message: string) => {
  if (message.startsWith('Notified Account Manager')) return <Mail className="w-3 h-3 shrink-0" />;
  if (message.startsWith('Exported')) return <FileDown className="w-3 h-3 shrink-0" />;
  if (message.startsWith('Notified')) return <Bell className="w-3 h-3 shrink-0" />;
  return <Send className="w-3 h-3 shrink-0" />;
};




/** RMA form columns for internal CSV/Excel exports (never used by client-facing PDF columns). */
function rmaFormExportFields(r: RmaExportSource) {
  if (r.category !== 'RMA') return {};
  return {
    case_number: r.case_number ?? '',
    service_slip_no: isReturnToCustomerCategory(r.rma_type) ? r.service_slip_no ?? '' : '',
    structured_items_fmt: formatRmaItemsSummary(r),
    client_remarks: r.client_remarks ?? '',
    rma_contacts_fmt: formatRmaContacts(r),
    internal_logistics_remarks: r.internal_logistics_remarks ?? '',
  };
}
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
  onRefresh,
  selectedAdditionRequestId = null,
  clearSelectedAdditionRequestId,
}: DeliveryRecordsViewProps) {
  const access = usePermissions();
  // RMA shows Account Manager / Created By / Movement Method inline; other categories keep Account Manager in the filter popover.
  const amFilterInPopover = category !== 'RMA';
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
  // RMA-only filters: classification, slip category and movement method.
  const [rmaScope, setRmaScope] = useState<'all' | 'rma' | 'internal_transfer'>('all');
  const [rmaTypeFilter, setRmaTypeFilter] = useState('');
  const [rmaMovementFilter, setRmaMovementFilter] = useState('');
  const [createdByFilter, setCreatedByFilter] = useState('');
  const [showDateRangePicker, setShowDateRangePicker] = useState(false);
  // Always enforce chronological date ranges across all categories and roles.
  const {
    error: dateRangeError,
    appliedDateFrom,
    appliedDateTo,
  } = dateRangeState(dateFrom, dateTo);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [creationBanner, setCreationBanner] = useState<{ recordId: string; recordNo: string; referenceLabel: string; lines: string[] } | null>(null);


  // Bulk selection (Logistics only)
  const [selectedBulkIds, setSelectedBulkIds] = useState<Set<string>>(new Set());
  const bulkSnapshots = useRef(new Map<string, DeliveryRecord>());
  const [bulkStatus, setBulkStatus] = useState<DeliveryStatus | ''>('');
  const [bulkApplying, setBulkApplying] = useState(false);
  const [bulkPriority, setBulkPriority] = useState<PriorityLevel | ''>('');
  const [bulkResult, setBulkResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [bulkSlipsOpen, setBulkSlipsOpen] = useState(false);
  // Feature 5b: Daily Route Slip (DRR) and Dispatch to Logistics dialogs, opened from the toolbar or the bulk bar.
  const [routeSlipDialog, setRouteSlipDialog] = useState<{ open: boolean; scope?: 'selected' | 'filtered' }>({ open: false });
  const [dispatchDialog, setDispatchDialog] = useState<{ open: boolean; scope?: 'selected' | 'filtered' }>({ open: false });

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
    if (!DATA_SAMPLER_ENABLED) return;
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
      setCreatedByFilter('');
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
    setCreatedByFilter('');

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
    if (amFilter) params.set('account_manager', amFilter);
    if (category === 'RMA' && createdByFilter) params.set('created_by', createdByFilter);
    if (statusFilter !== 'All') params.set('status', statusFilter);
    if (category === 'RMA' && rmaScope !== 'all') params.set('rma_scope', rmaScope);
    if (category === 'RMA' && rmaTypeFilter) params.set('rma_type', rmaTypeFilter);
    if (category === 'RMA' && rmaMovementFilter) params.set('rma_movement', rmaMovementFilter);

    api.getStatusHistoryCounts(params)
      .then(data => { if (active) setStatusHistoryCounts(data ?? undefined); })
      .catch(() => { if (active) setStatusHistoryCounts(undefined); });
    return () => { active = false; };
  }, [category, dateRangeError, appliedDateFrom, appliedDateTo, areaFilter, regionFilter, subregionFilter, driverFilter, statusFilter, rmaScope, rmaTypeFilter, rmaMovementFilter, amFilter, createdByFilter]);



  const roleCanEdit =
    currentUserRole === 'Sales Coordinator' ||
    (currentUserRole === 'Logistics' && category !== 'RMA') ||
    (currentUserRole === 'TASS' && category === 'RMA');
  const canEdit = roleCanEdit && access.canRecord(category, 'UPDATE');
  const canCreateRecord = roleCanEdit && access.canRecord(category, 'CREATE') && !(currentUserRole === 'Logistics' && category === 'Deliveries');
  // Driver assignment is Logistics-only (SoD enforcement)
  const canAssignDriver = currentUserRole === 'Logistics' && category !== 'RMA' && access.canRecord(category, 'STATUS');

  // ── Record list filtering ──────────────────────────────────────────────────
  const categoryRecords = records.filter(r => r.category === category);

  const filterOptions = useRecordFilterOptionsQuery(category);
  const amOptions = filterOptions.isError ? [] : filterOptions.data?.accountManagers
    ?? [...new Set(categoryRecords.map(r => r.account_manager).filter(Boolean))].sort();
  const driverOptions = filterOptions.isError ? [] : filterOptions.data?.drivers
    ?? [...new Set(categoryRecords.map(r => r.driver).filter(Boolean))].sort();
  const creatorOptions = filterOptions.isError ? [] : filterOptions.data?.creators
    ?? [...new Set(categoryRecords.map(r => r.created_by).filter(Boolean))].sort();

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
    ...(filterOptions.isError ? [] : filterOptions.data?.areas ?? [...new Set(categoryRecords.map(r => r.area).filter(Boolean))]).filter(area => areasInScope.has(area)).sort(),
  ];

  const baseFiltered = categoryRecords.filter(r => {
    if (dashboardFilterId && !matchesDashboardFilter(r, dashboardFilterId)) return false;
    if (regionFilter !== 'All Regions' && getRegion(r.area) !== regionFilter) return false;
    if (subregionFilter !== 'All Subregions' && getSubregion(r.area) !== subregionFilter) return false;
    if (areaFilter !== 'All Areas' && r.area !== areaFilter) return false;
    if (statusFilter !== 'All' && r.status !== statusFilter) return false;
    if (amFilter && !r.account_manager.toLowerCase().includes(amFilter.toLowerCase())) return false;
    if (category === 'RMA' && createdByFilter && !(r.created_by ?? '').toLowerCase().includes(createdByFilter.toLowerCase())) return false;
    if (driverFilter && !r.driver.toLowerCase().includes(driverFilter.toLowerCase())) return false;
    if (category === 'RMA' && rmaScope !== 'all' && Boolean(r.is_internal_transfer) !== (rmaScope === 'internal_transfer')) return false;
    if (category === 'RMA' && rmaTypeFilter && canonicalRmaCategory(r.rma_type) !== rmaTypeFilter) return false;
    if (category === 'RMA' && rmaMovementFilter && r.rma_movement !== rmaMovementFilter) return false;
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
      (r.case_number ?? '').toLowerCase().includes(q) ||
      (r.service_slip_no ?? '').toLowerCase().includes(q) ||
      (r.rma_contacts ?? []).some(c => [c.name, c.phone, c.email].some(value => (value ?? '').toLowerCase().includes(q))) ||
      (r.line_items ?? []).some(li => [li.sku, li.serial_number, li.new_serial_number, li.defective_serial_number, li.sales_order_no]
        .some(value => (value ?? '').toLowerCase().includes(q))) ||
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
  const effectiveAmFilter = amFilter || undefined;
  const hasInvalidDateRange = Boolean(dateRangeError);
  const effectiveDateFrom = appliedDateFrom || undefined;
  const effectiveDateTo = appliedDateTo || undefined;
  const effectiveAreaFilter = areaFilter !== 'All Areas' ? areaFilter : undefined;
  const rmaListFilters = category === 'RMA' ? {
    rma_scope: rmaScope !== 'all' ? rmaScope : undefined,
    rma_type: rmaTypeFilter || undefined,
    rma_movement: rmaMovementFilter || undefined,
    created_by: createdByFilter || undefined,
  } : {};

  const { data: pagedData, isLoading: pagedLoading, isError: pagedError, refetch: retryPage } = usePagedRecordsQuery({
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
    ...rmaListFilters,
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
    rmaScope,
    rmaTypeFilter,
    rmaMovementFilter,
    createdByFilter,
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

  // Server pages are already sorted; only fixture fallback rows are sliced locally.
  const displayRecords = hasInvalidDateRange || pagedError ? [] : pagedData ? pagedData.rows : paginatedRecords;

  const selectedRecord = useSelectedRecordQuery(selectedId,
    displayRecords.find(r => r.id === selectedId) ?? categoryRecords.find(r => r.id === selectedId));
  const activeRecord = selectedRecord.isError ? undefined : selectedRecord.data;

  // Bulk edits retain the version the user selected, including across polling.
  // Changing the page or filters starts a new selection.
  useEffect(() => {
    bulkSnapshots.current.clear();
    setSelectedBulkIds(new Set());
    setBulkResult(null);
  }, [category, currentPage, pageSize, searchQuery, statusFilter, regionFilter, subregionFilter,
    areaFilter, dateFrom, dateTo, dateSort, amFilter, driverFilter, dashboardFilterId, rmaScope, rmaTypeFilter, rmaMovementFilter, createdByFilter]);

  // Delivered records keep their Priority, so a bulk Priority never applies to them (TSK-124).
  const allSelectedPriorityLocked = selectedBulkIds.size > 0 && [...selectedBulkIds].every(id => {
    const record = bulkSnapshots.current.get(id);
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
    const snapshots = new Map(bulkSnapshots.current);
    try {
      for (const id of ids) {
        try {
          const record = snapshots.get(id);
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
          if (!updates.status || updates.priority !== undefined) updates.expected_edit_version = record.edit_version;
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
      if (next.has(id)) { next.delete(id); bulkSnapshots.current.delete(id); }
      else {
        const record = displayRecords.find(row => row.id === id);
        if (record) { next.add(id); bulkSnapshots.current.set(id, record); }
      }
      return next;
    });
  };

  const toggleAllBulk = () => {
    if (displayRecords.every(record => selectedBulkIds.has(record.id))) {
      bulkSnapshots.current.clear();
      setSelectedBulkIds(new Set());
    } else {
      bulkSnapshots.current = new Map(displayRecords.map(record => [record.id, record]));
      setSelectedBulkIds(new Set(displayRecords.map(record => record.id)));
    }
  };



  // ── Export: role+category gating per spec ──────────────────────────────
  // TASS has no Accounting Collection module (moduleAccessRules), so only Admin exports collections.
  const showExports = (() => {
    if (category === 'Accounting Collection') return currentUserRole === 'Admin';
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
    id: recordLabel(r),
    company_name: r.company_name,
    reference: r.reference,
    rma_reference: r.rma_reference ?? '',
    legacy_sap_reference: r.legacy_sap_reference ?? '',
    rma_type: r.rma_type ?? '',
    rma_classification: r.is_internal_transfer ? INTERNAL_TRANSFER_LABEL : 'RMA',
    ...rmaWorkflowExportFields(r),
    purchase_date_fmt: r.purchase_date ? fmtDate(r.purchase_date) : '',
    customer_contact_name: r.customer_contact_name ?? '',
    customer_contact_email: r.customer_contact_email ?? '',
    customer_contact_phone: r.customer_contact_phone ?? '',
    ...rmaFormExportFields(r),
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
      ...rmaListFilters,
    });
    return sortRows(raw.map(normalizeApiRecord));
  };

  // Bulk slip extraction (RMA). Selected rows are reloaded so each slip uses the
  // current authorized record; the filtered scope stops one past the cap.
  const loadSelectedSlipRecords = async () => {
    const ids = [...selectedBulkIds];
    const loaded: DeliveryRecord[] = [];
    for (let index = 0; index < ids.length; index += 4) {
      loaded.push(...(await Promise.all(ids.slice(index, index + 4).map(async id => normalizeApiRecord(await api.getRecord(id))))));
    }
    return loaded;
  };
  const loadFilteredSlipRecords = async (from: string, to: string, cap: number = MAX_BULK_SLIP_RECORDS) => {
    const rows: DeliveryRecord[] = [];
    let cursor: string | undefined;
    do {
      const page = await api.getPagedRecords({
        category, status: effectiveStatusFilter, search: searchQuery || undefined, driver: driverFilter || undefined, area: effectiveAreaFilter,
        region: regionFilter !== 'All Regions' ? regionFilter : undefined, subregion: subregionFilter !== 'All Subregions' ? subregionFilter : undefined,
        account_manager: effectiveAmFilter, dateFrom: from || undefined, dateTo: to || undefined, dashboard_filter: dashboardFilterId || undefined,
        ...rmaListFilters, limit: 100, cursor,
      });
      rows.push(...page.rows.map(normalizeApiRecord));
      cursor = page.hasMore ? page.nextCursor || undefined : undefined;
    } while (cursor && rows.length <= cap);
    return sortRows(rows);
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
      ...rmaListFilters,
    });
    const allRecords = rawAll.map(normalizeApiRecord);
    const sortedAll = sortRows(allRecords);

    const rows = sortedAll.map(r => ({
      id: recordLabel(r),
      company_name: r.company_name,
      reference: r.reference,
      rma_reference: r.rma_reference ?? '',
      legacy_sap_reference: r.legacy_sap_reference ?? '',
      rma_type: r.rma_type ?? '',
      rma_classification: r.is_internal_transfer ? INTERNAL_TRANSFER_LABEL : 'RMA',
    ...rmaWorkflowExportFields(r),
      purchase_date_fmt: r.purchase_date ? fmtDate(r.purchase_date) : '',
      customer_contact_name: r.customer_contact_name ?? '',
      customer_contact_email: r.customer_contact_email ?? '',
      customer_contact_phone: r.customer_contact_phone ?? '',
      ...rmaFormExportFields(r),
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
    !!amFilter, !!driverFilter, Boolean(dateFrom || dateTo), dateSort !== 'default',
    statusFilter !== 'All', !!searchQuery,
    !!dashboardFilterId,
    category === 'RMA' && rmaScope !== 'all', category === 'RMA' && !!rmaTypeFilter, category === 'RMA' && !!rmaMovementFilter,
    category === 'RMA' && !!createdByFilter,
  ].filter(Boolean).length;

  const clearAllFilters = () => {
    setSearchQuery(''); setStatusFilter('All'); setRegionFilter('All Regions');
    setSubregionFilter('All Subregions'); setAreaFilter('All Areas');
    setAmFilter(''); setDriverFilter(''); setRouteSlipMode('day'); setDateFrom(''); setDateTo(''); setDateSort('default');
    setRmaScope('all'); setRmaTypeFilter(''); setRmaMovementFilter(''); setCreatedByFilter('');
    clearDashboardFilter();
  };


  // Write-capable roles keep their bulk status/priority controls. RMA readers
  // with export access (TASS, Logistics, Admin) may also select rows, but only
  // to extract client slips; view-only roles never see the write controls.
  const canBulkWrite = canAssignDriver || canEdit;
  const canBulkExtractSlips = isRma && showExports;
  // TASS owns the daily handoff; Logistics and Admin can export but never dispatch.
  const canDispatchToLogistics = canBulkExtractSlips && currentUserRole === 'TASS' && access.canRecord('RMA', 'WRITE');
  // TASS sees its end-of-day outputs grouped as one "Daily handoff" control (Dispatch primary, slips + DRR in its menu).
  // Logistics/Admin keep the separate export buttons. The generic Route Slip menu is hidden for TASS on RMA so the
  // DRR is the only RMA route slip TASS can produce (product decision for #352).
  const showDailyHandoff = canBulkExtractSlips && currentUserRole === 'TASS';
  const showGenericRouteSlipMenu = showExports && !(isRma && currentUserRole === 'TASS');
  const showCheckbox = canBulkWrite || canBulkExtractSlips;

  // Percentage widths (not px) so the table fills the full available width —
  // like the Directory tables — while keeping each column's ratio fixed
  // regardless of viewport size. Two layouts depending on whether the
  // optional checkbox column renders.
  // Date widened further / Status narrowed by the same amount, so Driver's
  // start shifts right (more gap from Delivery Date) without shrinking
  // Driver's own width — Status (a short pill badge) absorbs the change
  // instead, since it tolerates a narrower column better than Driver names do.
  const colMinWidth = { id: '110px', company: '200px', area: '130px', date: '180px', driver: '130px', status: '130px' };
  const colPct = showCheckbox
    ? { id: 12, company: 24, area: 13, date: 22, driver: 12, status: 13 }
    : { id: 13, company: 26, area: 13, date: 22, driver: 13, status: 13 };

  // RMA-only table exposing the Daily Route Slip columns; other categories keep the 6-column grid below.
  const RMA_MOVEMENT_TONE = { route: 'border-sky-200 bg-sky-50 text-sky-800', supplier: 'border-violet-200 bg-violet-50 text-violet-800', internal: 'border-amber-200 bg-amber-50 text-amber-900', none: 'border-slate-200 bg-slate-50 text-slate-600' } as const;
  const renderRmaTable = () => (
    <div className="overflow-x-auto" id="rma-records-table">
      <table className="w-full min-w-[1180px] table-fixed text-left border-collapse text-sm">
        <colgroup>
          {showCheckbox && <col style={{ width: '40px' }} />}
          <col style={{ width: '130px' }} />
          <col style={{ width: '110px' }} />
          <col style={{ width: '180px' }} />
          <col style={{ width: '150px' }} />
          <col style={{ width: '140px' }} />
          <col style={{ width: '130px' }} />
          <col style={{ width: '220px' }} />
          <col style={{ width: '110px' }} />
          <col style={{ width: '130px' }} />
          <col style={{ width: '120px' }} />
        </colgroup>
        <thead>
          <tr className={tableHeaderRowClass}>
            {showCheckbox && (
              <th className="px-3 py-3">
                <input type="checkbox" className="rounded cursor-pointer" aria-label="Select all records on this page"
                  checked={displayRecords.length > 0 && displayRecords.every(record => selectedBulkIds.has(record.id))} onChange={toggleAllBulk} />
              </th>
            )}
            <th className="px-3 py-3">Reference</th>
            <th className="px-3 py-3">Delivery Date</th>
            <th className="px-3 py-3">Company</th>
            <th className="px-3 py-3">Category</th>
            <th className="px-3 py-3">Movement Method</th>
            <th className="px-3 py-3">Account Manager</th>
            <th className="px-3 py-3">Item Description</th>
            <th className="px-3 py-3">Area</th>
            <th className="px-3 py-3">Created By</th>
            <th className="px-3 py-3 text-center">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {displayRecords.length === 0 ? (
            pagedLoading ? (
              <TableSkeleton columns={10 + (showCheckbox ? 1 : 0)} rows={6} />
            ) : (
              <tr><td colSpan={11}>
                <EmptyState compact title="No matching records found" description="Adjust your search, date range, or status filters to see records." />
              </td></tr>
            )
          ) : displayRecords.map(rec => {
            const isSelected = selectedId === rec.id;
            const label = recordLabel(rec);
            const movement = formatRmaMovementBadge(rec.rma_movement);
            const prefix = rmaCategoryPrefix(rec.rma_type);
            const itemPreview = formatRmaTableItemPreview(rec);
            const serviceSlip = rec.service_slip_no && isReturnToCustomerCategory(rec.rma_type) ? rec.service_slip_no : '';
            return (
              <tr key={rec.id} onClick={() => { setSelectedId(rec.id); setShowForm(false); }}
                className={`${tableRowClass} cursor-pointer align-top ${isSelected ? 'bg-brand-sky/60 font-medium border-l-4 border-l-brand-blue' : ''}`}>
                {showCheckbox && (
                  <td className="px-3 py-3">
                    <input type="checkbox" className="rounded cursor-pointer" aria-label={`Select ${label}`} checked={selectedBulkIds.has(rec.id)}
                      onClick={e => e.stopPropagation()} onChange={() => toggleBulkId(rec.id)} />
                  </td>
                )}
                <td className="px-3 py-3 min-w-0">
                  <button type="button" onClick={e => { e.stopPropagation(); setSelectedId(rec.id); setShowForm(false); }} aria-label={label}
                    title={`Open ${category} record ${label}`} className={`${tableLeadButtonClass} text-xs max-w-full truncate block`}>
                    {rec.rma_reference || label}
                  </button>
                  {rec.rma_reference && rec.record_no && rec.record_no !== rec.rma_reference && <div className="text-[11px] text-slate-500 truncate">{rec.record_no}</div>}
                  {(rec.case_number || serviceSlip) && (
                    <div className="text-[11px] text-slate-500 truncate" title={[rec.case_number ? `Case# ${rec.case_number}` : '', serviceSlip].filter(Boolean).join(' · ')}>
                      {[rec.case_number ? `Case# ${rec.case_number}` : '', serviceSlip].filter(Boolean).join(' · ')}
                    </div>
                  )}
                </td>
                <td className="px-3 py-3 text-slate-600 tabular-nums">{rec.delivery_date || '—'}</td>
                <td className="px-3 py-3 min-w-0">
                  <div className="font-semibold text-sm text-slate-900 truncate" title={rec.company_name}>{rec.company_name}</div>
                  {rec.legacy_sap_reference && <div className="text-xs text-slate-500 truncate" title={rec.legacy_sap_reference}>Legacy SAP ref: {rec.legacy_sap_reference}</div>}
                </td>
                <td className="px-3 py-3 min-w-0">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {prefix && <span className="shrink-0 rounded border border-slate-200 bg-slate-50 px-1 py-px text-[10px] font-bold text-slate-700">{prefix}</span>}
                    <span className="text-xs text-slate-700 truncate" title={rec.rma_type ?? ''}>{rec.rma_type || '—'}</span>
                  </div>
                  {rec.is_internal_transfer && <span className="mt-1 inline-block rounded-full border border-indigo-200 bg-indigo-50 px-1.5 py-px text-[10px] font-semibold text-indigo-700">Internal Transfer</span>}
                </td>
                <td className="px-3 py-3 min-w-0">
                  <span title={movement.fullLabel} className={`inline-flex max-w-full truncate rounded-full border px-2 py-0.5 text-[11px] font-semibold ${RMA_MOVEMENT_TONE[movement.tone]}`}>{movement.label}</span>
                  {rec.driver && <div className="mt-0.5 text-[11px] text-slate-500 truncate" title={rec.driver}>{rec.driver}</div>}
                </td>
                <td className="px-3 py-3 truncate text-slate-600 text-xs" title={rec.account_manager}>{rec.account_manager || '—'}</td>
                <td className="px-3 py-3 min-w-0 text-xs text-slate-600">
                  <div className="line-clamp-2 break-words" title={rmaTableItemTooltip(rec) || itemPreview}>{itemPreview || '—'}</div>
                </td>
                <td className="px-3 py-3 truncate text-slate-600 text-xs" title={rec.area}>{rec.area || '—'}</td>
                <td className="px-3 py-3 truncate text-slate-600 text-xs" title={rec.created_by}>{rec.created_by || '—'}</td>
                <td className="px-3 py-3 text-center"><RecordStatus record={rec} compact /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

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
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden" id="records-toolbar">
        <div className="flex items-center gap-2.5 min-w-0">
          {!isCreating && (
            <p className="text-xs text-slate-500 tabular-nums">
              Showing <span className="font-semibold text-slate-800">{displayRecords.length}</span> of{' '}
              <span className="font-semibold text-slate-800">{displayTotalCount}</span>{' '}
              {displayTotalCount === 1 ? 'record' : 'records'}
            </p>
          )}
          {currentUserRole === 'Admin' && isViewOnlyCategory('ADMIN', permissionCategory(category) ?? 'ACCOUNTING_COLLECTION') && (
            <span className="rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-xs font-medium text-slate-600" data-view-only>View only</span>
          )}
        </div>
        {/* View Actions */}
        <div className="flex items-center justify-end gap-2 flex-wrap">
          {category === 'RMA' && (
            <TassAdditionRequestActions variant="rma" selectedAdditionRequestId={selectedAdditionRequestId}
              clearSelectedAdditionRequestId={clearSelectedAdditionRequestId} />
          )}
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
          {canBulkExtractSlips && !showDailyHandoff && (
            <button
              type="button"
              id="toolbar-extract-slips"
              onClick={() => setBulkSlipsOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:border-slate-300 hover:bg-slate-50 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue"
            >
              <FileStack className="h-3.5 w-3.5" aria-hidden="true" /> Extract Slips (PDF)
            </button>
          )}
          {canBulkExtractSlips && !showDailyHandoff && (
            <button
              type="button"
              id="toolbar-tass-daily-route-slip"
              onClick={() => setRouteSlipDialog({ open: true })}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:border-slate-300 hover:bg-slate-50 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" aria-hidden="true" /> Daily Route Slip (DRR)
            </button>
          )}
          {showDailyHandoff && (
            <DailyHandoffControl
              variant="toolbar"
              canDispatch={canDispatchToLogistics}
              onDispatch={() => setDispatchDialog({ open: true })}
              onExtractSlips={() => setBulkSlipsOpen(true)}
              onDailyRouteSlip={() => setRouteSlipDialog({ open: true })}
            />
          )}
          {showGenericRouteSlipMenu && (
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
              type="button"
              onClick={() => setShowDriverReportModal(true)}
              className={btnSecondaryClass}
            >
              <FileBarChart2 className="w-3.5 h-3.5 text-brand-blue" />
              Monthly Driver Report
            </button>
          )}
          {showDriverReportModal && (
            <DriverReportModal
              records={records}
              serverPaging
              onClose={() => setShowDriverReportModal(false)}
              generatedByName={currentUserName}
              generatedByRole={currentUserRole}
            />
          )}
          {/* Generate Sample — Admin only */}
          {DATA_SAMPLER_ENABLED && currentUserRole === 'Admin' && access.canResource('dataSampler', 'WRITE') && (
            <div className="relative">
              <button
                type="button"
                onClick={() => { setShowSampler(p => !p); setSamplerResult(null); }}
                className={btnSecondaryClass}
              >
                <Shuffle className="w-3.5 h-3.5 text-violet-600" /> Generate Sample
              </button>
              {showSampler && (
                <div className="absolute right-0 top-full mt-1.5 z-30 bg-white border border-slate-200/90 rounded-xl shadow-xl w-72 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-slate-900">Generate sample records</p>
                    <button type="button" onClick={() => setShowSampler(false)} className="p-1 hover:bg-slate-100 rounded-lg cursor-pointer"><X className="w-3.5 h-3.5 text-slate-400" /></button>
                  </div>
                  <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-start gap-2">
                    <SamplerAlert className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-800">Creates real records in the live database with randomized data.</p>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-700 block mb-1">
                      Count: <span className="text-violet-700 font-semibold tabular-nums">{samplerCount}</span>
                    </label>
                    <input
                      type="range" min={1} max={50} value={samplerCount}
                      onChange={e => setSamplerCount(Number(e.target.value))}
                      className="w-full accent-violet-600 cursor-pointer"
                    />
                    <div className="flex justify-between text-xs text-slate-400 font-medium tabular-nums mt-0.5">
                      <span>1</span><span>25</span><span>50</span>
                    </div>
                  </div>
                  {samplerResult && (
                    <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium ${samplerResult.ok ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
                      {samplerResult.ok ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> : <SamplerAlert className="w-3.5 h-3.5 shrink-0" />}
                      {samplerResult.msg}
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleGenerateSample}
                      disabled={samplerGenerating}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-violet-700 hover:bg-violet-600 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {samplerGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Shuffle className="w-3.5 h-3.5" />}
                      {samplerGenerating ? 'Generating…' : `Generate ${samplerCount}`}
                    </button>
                    <button type="button" onClick={() => setShowSampler(false)} className={btnSecondaryClass}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
          )}
          {canCreateRecord && (
            <button
              type="button"
              onClick={() => { setShowForm(true); setSelectedId(null); }}
              className={btnPrimaryClass}
            >
              <Plus className="w-4 h-4" /> New Record
            </button>
          )}
        </div>
      </div>

      {/* Bulk action bar — Logistics: status / Sales Coordinator: priority / RMA: slip extraction */}
      {selectedBulkIds.size > 0 && showCheckbox && (
        <div
          role="region"
          aria-label="Bulk actions"
          className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 max-w-[calc(100vw-2rem)] bg-brand-navy text-white rounded-2xl shadow-2xl px-4 py-3 flex flex-wrap items-center justify-center gap-3 print:hidden"
          id="bulk-action-bar"
        >
          <ListChecks className="w-4 h-4 text-blue-300 shrink-0" aria-hidden="true" />
          <span className="text-sm font-bold text-white">{selectedBulkIds.size} selected</span>
          {canAssignDriver && (
            <div className="flex flex-wrap items-center gap-2" title="Complete deliveries individually with Time In, a saved JPG/PNG photo, Received By, and remarks.">
              <label htmlFor="bulk-status-select" className="text-xs text-white/75">Set status:</label>
              <select
                id="bulk-status-select"
                value={bulkStatus}
                onChange={e => setBulkStatus(e.target.value as DeliveryStatus | '')}
                disabled={bulkApplying}
                className="text-xs font-semibold bg-white/10 border border-white/25 text-white rounded-lg px-2.5 py-1.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white cursor-pointer"
              >
                <option value="" className="text-slate-900 bg-white">Keep unchanged</option>
                {DELIVERY_STATUSES.filter(s => s !== 'In Transit' && s !== 'Transport Complete' && s !== 'Delivered' && s !== 'Draft' && !(category === 'Deliveries' && s === 'Rescheduled') && [...selectedBulkIds].every(id => { const record = bulkSnapshots.current.get(id); return record && (record.status === s || selectableStatuses(record, currentUserRole).includes(s)); })).map(s => (
                  <option key={s} value={s} className="text-slate-900 bg-white">{s}</option>
                ))}
              </select>
              {category === 'Deliveries' && <span className="text-xs text-white/75 max-w-56 leading-tight">Reschedule deliveries one at a time to set each new date.</span>}
            </div>
          )}
          {canEdit && (
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor="bulk-priority-select" className="text-xs text-white/75">Set priority:</label>
              <select
                id="bulk-priority-select"
                value={effectiveBulkPriority}
                onChange={e => setBulkPriority(e.target.value as PriorityLevel | '')}
                disabled={bulkApplying || allSelectedPriorityLocked}
                aria-describedby={allSelectedPriorityLocked ? 'bulk-priority-locked-hint' : undefined}
                className="text-xs font-semibold bg-white/10 border border-white/25 text-white rounded-lg px-2.5 py-1.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white cursor-pointer"
              >
                <option value="" className="text-slate-900 bg-white">Keep unchanged</option>
                {(['1 - Low', '2 - Moderate', '3 - High'] as const).map(p => (
                  <option key={p} value={p} className="text-slate-900 bg-white">{p}</option>
                ))}
              </select>
              {allSelectedPriorityLocked && <span id="bulk-priority-locked-hint" className="text-xs text-white/75 max-w-56 leading-tight">{PRIORITY_LOCKED_NOTE}</span>}
            </div>
          )}
          {canBulkExtractSlips && !showDailyHandoff && (
            <button
              type="button"
              id="bulk-extract-slips"
              onClick={() => setBulkSlipsOpen(true)}
              disabled={bulkApplying}
              className="px-3 py-1.5 bg-white/10 hover:bg-white/20 border border-white/25 text-white text-xs font-semibold rounded-lg transition-all cursor-pointer disabled:opacity-60 flex items-center gap-1.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              <FileStack className="w-3.5 h-3.5" aria-hidden="true" /> Extract Slips (PDF)
            </button>
          )}
          {canBulkExtractSlips && !showDailyHandoff && (
            <button
              type="button"
              id="bulk-tass-daily-route-slip"
              onClick={() => setRouteSlipDialog({ open: true, scope: 'selected' })}
              disabled={bulkApplying}
              className="px-3 py-1.5 bg-white/10 hover:bg-white/20 border border-white/25 text-white text-xs font-semibold rounded-lg transition-all cursor-pointer disabled:opacity-60 flex items-center gap-1.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" aria-hidden="true" /> Daily Route Slip (DRR)
            </button>
          )}
          {showDailyHandoff && (
            <DailyHandoffControl
              variant="bulk"
              canDispatch={canDispatchToLogistics}
              disabled={bulkApplying}
              onDispatch={() => setDispatchDialog({ open: true, scope: 'selected' })}
              onExtractSlips={() => setBulkSlipsOpen(true)}
              onDailyRouteSlip={() => setRouteSlipDialog({ open: true, scope: 'selected' })}
            />
          )}
          {canBulkWrite && <button
            type="button"
            onClick={handleBulkUpdate}
            disabled={bulkApplying || !((canAssignDriver && bulkStatus) || (canEdit && effectiveBulkPriority))}
            className="px-4 py-1.5 bg-brand-blue hover:bg-brand-blue-hover text-white text-xs font-semibold rounded-lg transition-all cursor-pointer disabled:opacity-60 flex items-center gap-1.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            {bulkApplying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Apply
          </button>}
          <button
            type="button"
            onClick={() => setSelectedBulkIds(new Set())}
            disabled={bulkApplying}
            aria-label="Clear bulk selection"
            title="Clear bulk selection"
            className="p-1 text-white/70 hover:text-white rounded transition-colors cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {canBulkExtractSlips && (
        <BulkRmaSlipsDialog
          open={bulkSlipsOpen}
          onClose={() => setBulkSlipsOpen(false)}
          selectedCount={selectedBulkIds.size}
          loadSelected={loadSelectedSlipRecords}
          loadFiltered={loadFilteredSlipRecords}
          defaultDateFrom={effectiveDateFrom ?? ''}
          defaultDateTo={effectiveDateTo ?? ''}
          companies={companies}
        />
      )}
      {canBulkExtractSlips && (
        <TassDailyRouteSlipDialog
          open={routeSlipDialog.open}
          initialScope={routeSlipDialog.scope}
          onClose={() => setRouteSlipDialog({ open: false })}
          selectedCount={selectedBulkIds.size}
          loadSelected={loadSelectedSlipRecords}
          loadFiltered={loadFilteredSlipRecords}
          defaultDateFrom={effectiveDateFrom ?? ''}
          defaultDateTo={effectiveDateTo ?? ''}
          generatedByName={currentUserName}
          generatedByRole={currentUserRole}
        />
      )}
      {canDispatchToLogistics && (
        <DispatchToLogisticsDialog
          open={dispatchDialog.open}
          initialScope={dispatchDialog.scope}
          onClose={() => setDispatchDialog({ open: false })}
          selectedCount={selectedBulkIds.size}
          loadSelected={loadSelectedSlipRecords}
          loadFiltered={loadFilteredSlipRecords}
          defaultDateFrom={effectiveDateFrom ?? ''}
          defaultDateTo={effectiveDateTo ?? ''}
          companies={companies}
        />
      )}

      {/* Record Created output-action confirmation */}
      {creationBanner && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl p-3.5 flex items-start justify-between gap-3 print:hidden" id="record-created-banner">
          <div className="space-y-1">
            <p className="font-semibold text-xs text-emerald-900">Record created</p>
            <p className="text-xs font-medium">{creationBanner.referenceLabel} · <span className="tabular-nums font-semibold">{creationBanner.recordNo}</span></p>
            {creationBanner.lines.map((line, i) => (
              <span key={i} className="flex items-center gap-1.5 font-medium text-xs">
                {outputLineIcon(line)} {line}
              </span>
            ))}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button type="button" onClick={() => { setSelectedId(creationBanner.recordId); setCreationBanner(null); }} className="text-emerald-800 hover:bg-emerald-100 px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer">View record</button>
            <button type="button" onClick={() => setCreationBanner(null)} className="text-emerald-700 hover:bg-emerald-100 p-1 rounded-lg cursor-pointer"><X className="w-4 h-4" /></button>
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
          onAfterSubmit={({ recordId, recordNo, referenceLabel, lines }) =>
            setCreationBanner({ recordId, recordNo, referenceLabel, lines })
          }
        />
      ) : selectedId && (selectedRecord.isError || !activeRecord || activeRecord.category !== category) ? (
        <div role={selectedRecord.isError || activeRecord ? 'alert' : 'status'} className="rounded-xl border border-slate-200 bg-white p-6 space-y-3">
          <p>{selectedRecord.isError ? 'Could not load this record.' : activeRecord ? 'This record belongs to another category.' : 'Loading record…'}</p>
          {selectedRecord.isError && <button onClick={() => void selectedRecord.refetch()} className="px-3 py-2 rounded-lg border">Retry loading record</button>}
          <button onClick={() => setSelectedId(null)} className="px-3 py-2 rounded-lg border">Back to records</button>
        </div>
      ) : selectedId && activeRecord ? (
        /* ── Full-page Entity Workspace ─────────────────────────────────────── */
        <DeliveryRecordWorkspace
          record={activeRecord}
          allRecordIds={[...new Set([...displayRecords.map(r => r.id), selectedId])]}
          allRecords={displayRecords}
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
          {pagedError && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4">
            <p>Could not load records.</p>
            <button onClick={() => void retryPage()}>Retry loading records</button>
          </div>}
          {/* List — unified filter & table card */}
          <div className={`${cardClass} lg:col-span-3 overflow-hidden`}>
            <div className="p-4 border-b border-slate-200/80 space-y-3 print:hidden">
              {/* Row 1: Search + Date range + Sort + Advanced filters */}
              <div className="grid grid-cols-1 min-[400px]:grid-cols-2 lg:grid-cols-12 gap-3 items-end text-xs" id="date-range-filters">
                <div className="min-w-0 min-[400px]:col-span-2 lg:col-span-4 space-y-1">
                  <label className="font-medium text-slate-600 block">Search</label>
                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder={category === 'RMA' ? 'Search ref, Case#, SS#, company, SN...' : 'Search records...'}
                      aria-label={`Search ${category === 'Deliveries' ? 'delivery' : category} records`}
                      className="w-full min-h-10 pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-xs text-slate-800 placeholder:text-slate-400 bg-white focus:outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/20" />
                  </div>
                </div>
                <div className="min-w-0 min-[400px]:col-span-2 lg:col-span-5">
                  <DateRangePicker dateFrom={dateFrom} dateTo={dateTo} open={showDateRangePicker} onOpenChange={setShowDateRangePicker}
                    onChange={range => { setRouteSlipMode(routeSlipModeForDates(range.from, range.to)); setDateFrom(range.from); setDateTo(range.to); }} />
                </div>
                <div className="min-w-0 lg:col-span-3 flex items-end gap-2">
                  <div className="space-y-1 min-w-0 flex-1">
                    <label htmlFor="dateSort" className="font-medium text-slate-600 block">Sort</label>
                    <select
                      id="dateSort"
                      value={dateSort}
                      onChange={e => setDateSort(e.target.value as typeof dateSort)}
                      className="min-h-10 w-full text-xs font-medium border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/20 cursor-pointer"
                    >
                      <option value="default">Date: Default</option>
                      <option value="nearest">Nearest to Present</option>
                      <option value="oldest">Oldest First</option>
                      <option value="furthest">Furthest Future First</option>
                    </select>
                  </div>
                  <FilterPopover open={showAdvancedFilters} onOpenChange={setShowAdvancedFilters}
                    count={activeFilterCount}
                    onClear={clearAllFilters}>
                    <fieldset className="space-y-2 min-w-0">
                      <legend className="text-xs font-semibold text-slate-800 mb-2">Location</legend>
                      <label className="block text-xs font-medium text-slate-600">Region
                        <select value={regionFilter}
                          onChange={e => { setRegionFilter(e.target.value); setSubregionFilter('All Subregions'); setAreaFilter('All Areas'); }}
                          className="mt-1 min-h-10 text-xs border border-slate-200 rounded-lg px-2.5 py-2 w-full bg-white focus:ring-2 focus:ring-brand-blue/20 focus:border-brand-blue">
                          <option value="All Regions">All Regions</option>
                          {AREA_HIERARCHY.map(r => <option key={r.region} value={r.region}>{r.region}</option>)}
                        </select>
                      </label>
                      <div className="grid grid-cols-1 min-[400px]:grid-cols-2 gap-2">
                        <label className="block min-w-0 text-xs font-medium text-slate-600">Subregion
                          <select value={subregionFilter}
                            onChange={e => { setSubregionFilter(e.target.value); setAreaFilter('All Areas'); }}
                            className="mt-1 min-h-10 text-xs border border-slate-200 rounded-lg px-2.5 py-2 w-full bg-white focus:ring-2 focus:ring-brand-blue/20 focus:border-brand-blue">
                            <option value="All Subregions">All Subregions</option>
                            {(regionFilter === 'All Regions' ? AREA_HIERARCHY : AREA_HIERARCHY.filter(r => r.region === regionFilter))
                              .flatMap(r => r.subregions).map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
                          </select>
                        </label>
                        <label className="block min-w-0 text-xs font-medium text-slate-600">Area
                          <select value={areaFilter} onChange={e => setAreaFilter(e.target.value)}
                            className="mt-1 min-h-10 text-xs border border-slate-200 rounded-lg px-2.5 py-2 w-full bg-white focus:ring-2 focus:ring-brand-blue/20 focus:border-brand-blue">
                            {distinctAreasForFilter.map(a => <option key={a} value={a}>{a}</option>)}
                          </select>
                        </label>
                      </div>
                    </fieldset>
                    <fieldset className="min-w-0">
                      <legend className="text-xs font-semibold text-slate-800 mb-2">Personnel</legend>
                      <div className="grid grid-cols-1 min-[400px]:grid-cols-2 gap-2">
                        {amFilterInPopover && <FilterCombobox label="Account Manager" placeholder="All Account Managers" value={amFilter} onChange={setAmFilter} options={amOptions} />}
                        <FilterCombobox label="Driver" placeholder="All Drivers" value={driverFilter} onChange={setDriverFilter} options={driverOptions} />
                      </div>
                    </fieldset>
                    {category === 'RMA' && (
                      <fieldset className="min-w-0">
                        <legend className="text-xs font-semibold text-slate-800 mb-2">RMA slip</legend>
                        <div className="grid grid-cols-1 min-[400px]:grid-cols-2 gap-2">
                          <label className="block min-w-0 text-xs font-medium text-slate-600">Classification
                            <select id="rma-scope-filter" value={rmaScope} onChange={e => setRmaScope(e.target.value as typeof rmaScope)}
                              className="mt-1 min-h-10 text-xs border border-slate-200 rounded-lg px-2.5 py-2 w-full bg-white focus:ring-2 focus:ring-brand-blue/20 focus:border-brand-blue">
                              <option value="all">All</option>
                              <option value="rma">RMA Only</option>
                              <option value="internal_transfer">Internal Transfers</option>
                            </select>
                          </label>
                          <label className="block min-w-0 text-xs font-medium text-slate-600">Slip Category
                            <select id="rma-type-filter" value={rmaTypeFilter} onChange={e => setRmaTypeFilter(e.target.value)}
                              className="mt-1 min-h-10 text-xs border border-slate-200 rounded-lg px-2.5 py-2 w-full bg-white focus:ring-2 focus:ring-brand-blue/20 focus:border-brand-blue">
                              <option value="">All Categories</option>
                              {RMA_CATEGORIES.map(value => <option key={value} value={value}>{formatRmaCategoryOption(value)}</option>)}
                            </select>
                          </label>
                        </div>
                      </fieldset>
                    )}
                  </FilterPopover>
                </div>
              </div>

              {/* RMA quick filters: Movement Method, Account Manager and Created By (one click, no popover) */}
              {category === 'RMA' && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end text-xs" id="rma-quick-filters">
                  <label className="block min-w-0 font-medium text-slate-600">Movement Method
                    <select id="rma-movement-filter" value={rmaMovementFilter} onChange={e => setRmaMovementFilter(e.target.value)}
                      className="mt-1 min-h-10 text-xs border border-slate-200 rounded-lg px-2.5 py-2 w-full bg-white focus:ring-2 focus:ring-brand-blue/20 focus:border-brand-blue">
                      {RMA_MOVEMENT_FILTER_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </label>
                  <FilterCombobox label="Account Manager" placeholder="All Account Managers" value={amFilter} onChange={setAmFilter} options={amOptions} />
                  <FilterCombobox label="Created By" placeholder="All Creators" value={createdByFilter} onChange={setCreatedByFilter} options={creatorOptions} />
                </div>
              )}

              {/* Row 2: Status chips + Clear filters */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {['All', ...DELIVERY_STATUSES].map(s => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setStatusFilter(s)}
                      aria-pressed={statusFilter === s}
                      className={filterChipClass(statusFilter === s)}
                    >
                      {s}
                    </button>
                  ))}
                </div>
                {activeFilterCount > 0 && (
                  <button
                    type="button"
                    onClick={clearAllFilters}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue"
                  >
                    <X className="w-3.5 h-3.5" /> Clear All Filters
                  </button>
                )}
              </div>
            </div>

            {isRma ? renderRmaTable() : (
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
                </colgroup>
                <thead>
                  <tr className={tableHeaderRowClass}>
                    {showCheckbox && (
                      <th className="px-4 py-3" style={{ minWidth: '40px' }}>
                        <input
                          type="checkbox"
                          className="rounded cursor-pointer"
                          aria-label="Select all records on this page"
                          checked={displayRecords.length > 0 && displayRecords.every(record => selectedBulkIds.has(record.id))}
                          onChange={toggleAllBulk}
                        />
                      </th>
                    )}
                    <th className="px-4 py-3" style={{ minWidth: colMinWidth.id }}>Record No.</th>
                    <th className="px-4 py-3" style={{ minWidth: colMinWidth.company }}>Company</th>
                    <th className="px-4 py-3" style={{ minWidth: colMinWidth.area }}>Area</th>
                    <th className="px-4 py-3 text-center" style={{ minWidth: colMinWidth.date }}>Delivery Date</th>
                    <th className="px-4 py-3" style={{ minWidth: colMinWidth.driver }}>Driver</th>
                    <th className="px-4 py-3 text-center" style={{ minWidth: colMinWidth.status }}>Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {displayRecords.length === 0 ? (
                    pagedLoading ? (
                      <TableSkeleton columns={6 + (showCheckbox ? 1 : 0)} rows={6} />
                    ) : (
                      <tr><td colSpan={10}>
                        <EmptyState
                          compact
                          title="No matching records found"
                          description="Adjust your search, date range, or status filters to see records."
                        />
                      </td></tr>
                    )
                  ) : displayRecords.map(rec => {
                    const isSelected = selectedId === rec.id;
                    const label = recordLabel(rec);
                    return (
                      <tr key={rec.id} onClick={() => { setSelectedId(rec.id); setShowForm(false); }}
                        className={`${tableRowClass} cursor-pointer ${isSelected ? 'bg-brand-sky/60 font-medium border-l-4 border-l-brand-blue' : ''}`}>
                        {showCheckbox && (
                          <td className="px-4 py-3.5">
                            <input
                              type="checkbox"
                              className="rounded cursor-pointer"
                              aria-label={`Select ${label}`}
                              checked={selectedBulkIds.has(rec.id)}
                              onClick={e => e.stopPropagation()}
                              onChange={() => toggleBulkId(rec.id)}
                            />
                          </td>
                        )}
                        <td className="px-4 py-3.5 truncate">
                          <button
                            type="button"
                            onClick={e => { e.stopPropagation(); setSelectedId(rec.id); setShowForm(false); }}
                            aria-label={label}
                            title={`Open ${category} record ${label}`}
                            className={`${tableLeadButtonClass} text-xs max-w-full truncate block`}
                          >
                            {label}
                          </button>
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="font-semibold text-sm text-slate-900 truncate" title={rec.company_name}>{rec.company_name}</div>
                        </td>
                        <td className="px-4 py-3.5 truncate text-slate-600" title={rec.area}>{rec.area}</td>
                        <td className="px-4 py-3.5 text-center text-slate-600 tabular-nums">{rec.delivery_date}</td>
                        <td className="px-4 py-3.5 truncate text-slate-600" title={rec.driver}>{rec.driver || <span className="text-xs text-slate-500 italic">Unassigned</span>}</td>
                        <td className="px-4 py-3.5 text-center">
                          <RecordStatus record={rec} compact />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            )}
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
        <h1 className="text-lg font-bold">{category} Records — {new Date().toLocaleDateString()}</h1>
      </div>
    </div >
  );
}
