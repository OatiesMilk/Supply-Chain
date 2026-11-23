import RecordStatus from '@/components/RecordStatus';
import { usePermissions } from '@/hooks/usePermissions';
import { useState, useMemo, useEffect } from "react";
import { Layers, Plus } from "lucide-react";
import { DeliveryRecord, DeliveryCategory, UserRole } from "@/types";
import { ApiCompany, apiUrl, api } from "@/api";
import { normalizeApiRecord, usePagedRecordsQuery } from "@/api/queries/useRecordsQuery";
import RecordCreateForm from "@/features/deliveries/RecordCreateForm";
import AllOpsExportMenu from "@/components/AllOpsExportMenu";
import { StatusHistoryCounts } from "@/utils/export";
import { DateSortMode, sortRecordsByDate } from "@/utils/allOpsExport";
import Pagination, { DEFAULT_PAGE_SIZE } from "@/components/Pagination";
import DashboardFilterChip from "@/components/DashboardFilterChip";
import { DashboardFilterId } from "@/utils/dashboardFilters";
import { recordLabel } from '../utils/recordLabel';
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

interface MainViewProps {
  records: DeliveryRecord[];
  currentUserRole: UserRole;
  currentUserName: string;
  onNavigate: (screen: string, item_id?: string) => void;
  companies: ApiCompany[];
  onCreateRecord: (
    data: Omit<
      DeliveryRecord,
      | "id"
      | "created_by"
      | "created_at"
      | "modified_by"
      | "modified_at"
      | "email_notification_sent"
    >,
  ) => Promise<DeliveryRecord>;
  effectiveScreens: Set<string>;
  dashboardFilterId?: DashboardFilterId | null;
  clearDashboardFilter?: () => void;
}

type FilterKey =
  | "all"
  | "Scheduled"
  | "Delivered"
  | "On-Hold"
  | "Rescheduled"
  | "Pending"
  | "draft";

const CATEGORY_TO_SCREEN: Record<string, string> = {
  Deliveries: "deliveries",
  RMA: "rma",
  "Accounting Collection": "accounting_collection",
  "Procurement Pick-up": "procurement_pickup",
  "Sales Orders": "sales_orders",
};


const FILTER_BUTTONS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "Scheduled", label: "Scheduled" },
  { key: "Delivered", label: "Delivered" },
  { key: "On-Hold", label: "On-Hold" },
  { key: "Rescheduled", label: "Rescheduled" },
  { key: "Pending", label: "Pending" },
  { key: "draft", label: "Delivery For Approval" },
];

function fmtCreatedAt(ts: string): string {
  return new Date(ts).toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Manila",
  });
}

export default function MainView({
  currentUserRole,
  currentUserName,
  onNavigate,
  companies,
  onCreateRecord,
  effectiveScreens,
  dashboardFilterId = null,
  clearDashboardFilter,
}: MainViewProps) {
  const access = usePermissions();
  const [activeFilter, setActiveFilter] = useState<FilterKey>("all");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createCategory, setCreateCategory] = useState<DeliveryCategory | null>(
    null,
  );
  const [statusHistoryCounts, setStatusHistoryCounts] = useState<
    StatusHistoryCounts | undefined
  >(undefined);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortMode, setSortMode] = useState<DateSortMode>("nearest");

  useEffect(() => {
    const params = new URLSearchParams();
    if (activeFilter !== "all")
      params.set("status", activeFilter === "draft" ? "Draft" : activeFilter);
    if (dateFrom) params.set("deliveryDateFrom", dateFrom);
    if (dateTo) params.set("deliveryDateTo", dateTo);

    api.getStatusHistoryCounts(params)
      .then((data) => setStatusHistoryCounts(data ?? undefined))
      .catch(() => setStatusHistoryCounts(undefined));
  }, [activeFilter, dateFrom, dateTo]);

  const availableCategories = useMemo<DeliveryCategory[]>(
    () =>
      Object.entries(CATEGORY_TO_SCREEN)
        .filter(([, screen]) => effectiveScreens.has(screen))
        .map(([cat]) => cat as DeliveryCategory)
        .filter(cat => access.canRecord(cat, 'CREATE'))
        .filter((cat) => !(currentUserRole === "Logistics" && cat === "RMA")),
    [effectiveScreens, currentUserRole, access],
  );

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const query = usePagedRecordsQuery({
    paged: true, page: currentPage, limit: pageSize,
    status: activeFilter === 'all' ? undefined : activeFilter === 'draft' ? 'Draft' : activeFilter,
    dateFrom: dateFrom || undefined, dateTo: dateTo || undefined,
    dateSort: dateFrom || dateTo ? 'default' : sortMode,
    dashboard_filter: dashboardFilterId ?? undefined,
  });
  const displayRecords = query.data?.rows ?? [];
  const paginatedRecords = displayRecords;
  const totalRecords = query.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  useEffect(() => { setCurrentPage(1); }, [activeFilter, dateFrom, dateTo, sortMode, pageSize, dashboardFilterId]);
  useEffect(() => {
    if (query.data && currentPage > totalPages) setCurrentPage(totalPages);
  }, [query.data, currentPage, totalPages]);

  const handleRowClick = (record: DeliveryRecord) => {
    const screen = CATEGORY_TO_SCREEN[record.category];
    if (screen) onNavigate(screen, record.id);
  };

  const handleOpenCreate = () => {
    if (availableCategories.length === 0) return;
    setCreateCategory(availableCategories[0]);
    setShowCreateForm(true);
  };

  const fetchExportData = async () => {
    const raw = await api.getAllRecordsForExport({
      status: activeFilter === "all" ? undefined : activeFilter === "draft" ? "Draft" : activeFilter,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      dashboard_filter: dashboardFilterId ?? undefined,
    });
    const normalized = raw.map(normalizeApiRecord);
    return dateFrom || dateTo ? normalized : sortRecordsByDate(normalized, sortMode);
  };

  return (
    <div className="space-y-4">
      {dashboardFilterId && clearDashboardFilter && (
        <DashboardFilterChip
          filterId={dashboardFilterId}
          onClear={clearDashboardFilter}
        />
      )}
      {/* Top action bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-slate-500 tabular-nums">
          Showing{" "}
          <span className="font-semibold text-slate-800">
            {displayRecords.length}
          </span>{" "}
          of <span className="font-semibold text-slate-800">{totalRecords}</span>{" "}
          matching records
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <AllOpsExportMenu
            records={displayRecords}
            meta={{
              reportName: "All Operations",
              dateRange: dateFrom || dateTo
                ? `${dateFrom || "earliest"} to ${dateTo || "latest"}`
                : "All dates",
              dateBasis: "Delivery Date (Asia/Manila)",
              generatedByName: currentUserName,
              generatedByRole: currentUserRole,
            }}
            activeFilterLabel={
              activeFilter !== "all"
                ? activeFilter === "draft"
                  ? "Draft Records"
                  : activeFilter + " Records"
                : undefined
            }
            statusHistoryCounts={statusHistoryCounts}
            fetchExportData={fetchExportData}
          />
          <button
            type="button"
            onClick={handleOpenCreate}
            disabled={availableCategories.length === 0}
            title={
              availableCategories.length === 0
                ? "No order types available for your account"
                : "Create a new delivery record"
            }
            className={btnPrimaryClass}
          >
            <Plus className="w-4 h-4" />
            New Delivery
          </button>
        </div>
      </div>

      {/* Unified Filter & Table Card */}
      <div className={`${cardClass} overflow-hidden`}>
        <div className="p-4 border-b border-slate-200/80 space-y-3">
          {/* Status filter pills */}
          <div className="flex flex-wrap gap-1.5 items-center">
            {FILTER_BUTTONS.map(({ key, label }) => {
              const isActive = activeFilter === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setActiveFilter(key)}
                  aria-pressed={isActive}
                  className={filterChipClass(isActive)}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {/* Date range + sort filter bar */}
          <div className="flex flex-wrap gap-2 items-center">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="h-9 px-3 border border-slate-200 rounded-lg text-xs text-slate-700 tabular-nums bg-white focus:outline-none focus:ring-2 focus:ring-brand-blue/20 focus:border-brand-blue"
              title="Delivery Date From"
            />
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="h-9 px-3 border border-slate-200 rounded-lg text-xs text-slate-700 tabular-nums bg-white focus:outline-none focus:ring-2 focus:ring-brand-blue/20 focus:border-brand-blue"
              title="Delivery Date To"
            />
            <select
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as DateSortMode)}
              disabled={!!(dateFrom || dateTo)}
              title={
                dateFrom || dateTo
                  ? "Sort order is N/A while a date range filter is active"
                  : undefined
              }
              className={`h-9 px-3 border rounded-lg text-xs font-medium focus:outline-none focus:ring-2 focus:ring-brand-blue/20 focus:border-brand-blue ${dateFrom || dateTo ? "border-slate-100 bg-slate-50 text-slate-400 cursor-not-allowed" : "border-slate-200 bg-white text-slate-700 cursor-pointer"}`}
            >
              {(dateFrom || dateTo) && <option value={sortMode}>Sort: N/A</option>}
              <option value="nearest">Nearest to Present</option>
              <option value="oldest">Oldest First</option>
              <option value="furthest">Furthest Future First</option>
            </select>

            {(dateFrom || dateTo || sortMode !== "nearest") && (
              <button
                type="button"
                onClick={() => {
                  setDateFrom("");
                  setDateTo("");
                  setSortMode("nearest");
                }}
                className={btnSecondaryClass}
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {query.isError ? (
          <div role="alert" className="p-6 text-sm text-red-700">Could not load records. <button type="button" className="font-semibold underline cursor-pointer" onClick={() => void query.refetch()}>Retry loading records</button></div>
        ) : query.isPending ? (
          <div className="overflow-x-auto" role="status" aria-label="Loading records">
            <table className="w-full table-auto text-sm">
              <thead>
                <tr className={`${tableHeaderRowClass} text-left`}>
                  <th className="px-4 py-3 whitespace-nowrap">Date Created</th>
                  <th className="px-4 py-3">Company</th>
                  <th className="px-4 py-3">Reference</th>
                  <th className="px-4 py-3 whitespace-nowrap">Category</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Area</th>
                  <th className="px-4 py-3 whitespace-nowrap">Account Manager</th>
                  <th className="px-4 py-3 whitespace-nowrap">Delivery Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <TableSkeleton columns={8} rows={6} />
              </tbody>
            </table>
          </div>
        ) : displayRecords.length === 0 ? (
          <EmptyState
            icon={Layers}
            title="No records match this filter"
            description="Try adjusting the status or date range filters to see more operational records."
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full table-auto text-sm">
                <thead>
                  <tr className={`${tableHeaderRowClass} text-left`}>
                    <th className="px-4 py-3 whitespace-nowrap">Date Created</th>
                    <th className="px-4 py-3">Company</th>
                    <th className="px-4 py-3">Reference</th>
                    <th className="px-4 py-3 whitespace-nowrap">Category</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Area</th>
                    <th className="px-4 py-3 whitespace-nowrap">Account Manager</th>
                    <th className="px-4 py-3 whitespace-nowrap">Delivery Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedRecords.map((record) => {
                    const label = recordLabel(record);
                    return (
                      <tr
                        key={record.id}
                        onClick={() => handleRowClick(record)}
                        className={`${tableRowClass} cursor-pointer group`}
                      >
                        <td className="px-4 py-3.5 whitespace-nowrap text-slate-600 tabular-nums text-xs">
                          {fmtCreatedAt(record.created_at)}
                        </td>
                        <td className="px-4 py-3.5">
                          <button
                            type="button"
                            onClick={e => { e.stopPropagation(); handleRowClick(record); }}
                            aria-label={`Open ${record.category} record ${label}`}
                            className={`${tableLeadButtonClass} text-sm text-slate-900 group-hover:text-brand-blue line-clamp-1`}
                          >
                            {record.company_name}
                          </button>
                          <span className="block text-xs text-slate-500 tabular-nums mt-0.5">
                            {label}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-slate-600 whitespace-nowrap text-xs tabular-nums">
                          {record.reference || "—"}
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <span className="px-2 py-0.5 rounded-md text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200/80">
                            {record.category}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <RecordStatus record={record} compact />
                        </td>
                        <td className="px-4 py-3.5 text-slate-600 whitespace-nowrap text-xs">
                          {record.area || "—"}
                        </td>
                        <td className="px-4 py-3.5 text-slate-600 whitespace-nowrap text-xs">
                          {record.account_manager || "—"}
                        </td>
                        <td className="px-4 py-3.5 text-slate-600 whitespace-nowrap text-xs tabular-nums">
                          {record.delivery_date || "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="border-t border-slate-200/80">
              <Pagination
                currentPage={safeCurrentPage}
                totalPages={totalPages}
                totalItems={totalRecords}
                pageSize={pageSize}
                onPageChange={setCurrentPage}
                onPageSizeChange={(newSize) => {
                  setPageSize(newSize);
                  setCurrentPage(1);
                }}
                pageSizeOptions={[10, 25, 50, 100]}
              />
            </div>
          </>
        )}
      </div>

      {/* Create record modal */}
      {showCreateForm && createCategory && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-[2px]"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowCreateForm(false);
          }}
        >
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto m-4">
            <div className="px-6 pt-5 pb-3 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-900">
                New delivery
              </h2>
              <button
                type="button"
                onClick={() => setShowCreateForm(false)}
                aria-label="Close"
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors cursor-pointer"
              >
                ×
              </button>
            </div>
            <div className="p-6">
              <RecordCreateForm
                category={createCategory}
                categoryLocked={false}
                availableCategories={availableCategories}
                onCategoryChange={(cat) => setCreateCategory(cat)}
                companies={companies}
                onSubmit={onCreateRecord}
                onCancel={() => setShowCreateForm(false)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
