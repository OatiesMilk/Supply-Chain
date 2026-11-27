import React, { useState, useEffect, useCallback } from 'react';
import { Filter, ChevronLeft, ChevronRight, Loader2, AlertTriangle } from 'lucide-react';
import Pagination, { DEFAULT_PAGE_SIZE } from '@/components/Pagination';
import { api, ApiTransaction, ApiTransactionList } from '@/api';
import TransactionDetail from '@/features/transactions/TransactionDetail';
import ExportMenu from '@/components/ExportMenu';
import { TXN_COLUMNS, fmtDate, fmtStatus } from '@/utils/export';
import { DashboardFilterId, getManilaWeekRange } from '@/utils/dashboardFilters';
import DashboardFilterChip from '@/components/DashboardFilterChip';
import { statusBadgeClass, statusDisplayLabel } from '@/utils/statusTheme';
import { btnPrimaryClass, btnSecondaryClass, tableHeaderRowClass, tableLeadButtonClass } from '@/utils/uiClasses';

interface TransactionCenterProps {
  currentUserRole: string;
  currentUserName: string;
  dashboardFilterId: DashboardFilterId | null;
  clearDashboardFilter: () => void;
}

const showExportForRole = (role: string) => role === 'Admin' || role === 'Sales Coordinator';

// ─── Constants ────────────────────────────────────────────────────────────────

// Allowed delivery categories per role (display label → DB value)
const CATEGORY_OPTIONS_BY_ROLE: Record<string, Array<{ label: string; value: string }>> = {
  Admin: [
    { label: 'Deliveries',            value: 'DELIVERY' },
    { label: 'RMA',                   value: 'RMA' },
    { label: 'Accounting Collection', value: 'ACCOUNTING_COLLECTION' },
    { label: 'Procurement Pick-up',   value: 'PROCUREMENT_PICKUP' },
    { label: 'Sales Orders',          value: 'SALES_ORDERS' }
  ],
  'Sales Coordinator': [
    { label: 'Deliveries',          value: 'DELIVERY' },
    { label: 'Procurement Pick-up', value: 'PROCUREMENT_PICKUP' },
    { label: 'Sales Orders',        value: 'SALES_ORDERS' }
  ],
  Logistics: [
    { label: 'Deliveries',          value: 'DELIVERY' },
    { label: 'RMA',                 value: 'RMA' },
    { label: 'Procurement Pick-up', value: 'PROCUREMENT_PICKUP' }
  ],
  TASS: [
    { label: 'Accounting Collection', value: 'ACCOUNTING_COLLECTION' }
  ],
  Driver: [
    { label: 'Deliveries',            value: 'DELIVERY' },
    { label: 'RMA',                   value: 'RMA' },
    { label: 'Accounting Collection', value: 'ACCOUNTING_COLLECTION' },
    { label: 'Procurement Pick-up',   value: 'PROCUREMENT_PICKUP' },
    { label: 'Sales Orders',          value: 'SALES_ORDERS' }
  ]
};

function getCategoryOptions(role: string) {
  return CATEGORY_OPTIONS_BY_ROLE[role] ?? [];
}

function canViewInventory(role: string) {
  return ['Admin', 'Sales Coordinator', 'Logistics'].includes(role);
}

// ─── Filter state ─────────────────────────────────────────────────────────────

interface Filters {
  source:   string;
  category: string;
  status:   string;
  from:     string;
  to:       string;
}

function defaultFilters(role: string, dashboardFilterId: DashboardFilterId | null = null): Filters {
  const base: Filters = {
    source: canViewInventory(role) ? 'all' : 'delivery',
    category: '',
    status: '',
    from: '',
    to: '',
  };
  if (dashboardFilterId === 'admin-records-this-week') {
    return { ...base, source: 'delivery', ...getManilaWeekRange() };
  }
  return {
    ...base,
  };
}

// ─── Source badge ─────────────────────────────────────────────────────────────

function SourceBadge({ source }: { source: 'delivery' | 'inventory' }) {
  return source === 'delivery' ? (
    <span className="px-2 py-0.5 rounded text-xs font-semibold bg-brand-navy text-white whitespace-nowrap">
      Delivery
    </span>
  ) : (
    <span className="px-2 py-0.5 rounded text-xs font-semibold bg-teal-700 text-white whitespace-nowrap">
      Inventory
    </span>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function TransactionCenter({ currentUserRole, currentUserName, dashboardFilterId, clearDashboardFilter }: TransactionCenterProps) {
  const [data,    setData]    = useState<ApiTransactionList | null>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const [page,    setPage]    = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [filters, setFilters] = useState<Filters>(() => defaultFilters(currentUserRole, dashboardFilterId));
  const [pendingFilters, setPendingFilters] = useState<Filters>(() => defaultFilters(currentUserRole, dashboardFilterId));
  const [filtersOpen, setFiltersOpen] = useState(true);

  // Selected transaction for detail view
  const [selected, setSelected] = useState<{ source: 'delivery' | 'inventory'; id: string } | null>(null);

  const isTass = currentUserRole === 'TASS';
  const inventoryAllowed = canViewInventory(currentUserRole);
  const categoryOptions = getCategoryOptions(currentUserRole);

  useEffect(() => {
    const fresh = defaultFilters(currentUserRole, dashboardFilterId);
    setFilters(fresh);
    setPendingFilters(fresh);
    setPage(1);
    setSelected(null);
  }, [currentUserRole, dashboardFilterId]);

  // Only show category/status filters when source includes delivery records
  const showCategoryFilter = pendingFilters.source !== 'inventory' && !isTass;
  const showStatusFilter   = pendingFilters.source !== 'inventory';

  const fetchData = useCallback(async (f: Filters, p: number, limit: number) => {
    setLoading(true);
    setError(null);
    try {
      const params: Parameters<typeof api.getTransactions>[0] = { page: p, limit };
      if (f.source   && f.source   !== 'all') params.source   = f.source;
      if (f.category)                          params.category = f.category;
      if (f.status)                            params.status   = f.status;
      if (f.from)                              params.from     = f.from;
      if (f.to)                                params.to       = f.to;
      const result = await api.getTransactions(params);
      setData(result);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load transactions.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(filters, page, pageSize);
  }, [filters, page, pageSize, fetchData]);

  const handleApply = () => {
    setFilters(pendingFilters);
    setPage(1);
  };

  const handleClear = () => {
    const fresh = defaultFilters(currentUserRole);
    setPendingFilters(fresh);
    setFilters(fresh);
    setPage(1);
    clearDashboardFilter();
  };

  // If detail view is active, render TransactionDetail instead
  if (selected) {
    return (
      <TransactionDetail
        source={selected.source}
        id={selected.id}
        onBack={() => setSelected(null)}
      />
    );
  }

  const total     = data?.total ?? 0;
  const totalPages = data?.pages ?? 1;
  const startRow  = total === 0 ? 0 : (page - 1) * 25 + 1;
  const endRow    = total === 0 ? 0 : Math.min(page * 25, total);
  const transactions = data?.transactions ?? [];

  const exportRows = transactions.map(t => ({
    reference:   t.reference,
    type:        t.type,
    source:      t.source,
    entity:      t.entity,
    status:      t.status ? statusDisplayLabel(t.status) : '',
    date_fmt:    fmtDate(t.date),
    description: t.description,
    qty_change:  t.qty_change ?? '',
    balance:     t.resulting_balance ?? '',
    created_by:  t.created_by ?? '',
  }));

  return (
    <div className="space-y-4" id="transaction-center">
      <DashboardFilterChip filterId={dashboardFilterId} onClear={handleClear} />
      {dashboardFilterId === 'admin-records-this-week' && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Transaction Center filters delivery date for this week; the dashboard total is based on record creation date.
        </p>
      )}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        {/* Filters bar */}
        <div className="border-b border-slate-200">
          <div className="flex items-center justify-between gap-3 px-4 py-2.5">
            <button
              type="button"
              onClick={() => setFiltersOpen(v => !v)}
              aria-expanded={filtersOpen}
              className="flex flex-1 items-center justify-between gap-2 rounded-lg py-1 text-left transition-colors hover:text-brand-blue cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue"
            >
              <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 uppercase tracking-wide">
                <Filter className="w-3.5 h-3.5" aria-hidden="true" /> Filters
              </span>
              <span className="text-xs text-slate-500">{filtersOpen ? 'Collapse ▲' : 'Expand ▼'}</span>
            </button>
            {showExportForRole(currentUserRole) && (
              <div className="shrink-0">
                <ExportMenu
                  rows={exportRows}
                  columns={TXN_COLUMNS}
                  sheetName="Transactions"
                  filename={`transactions-p${page}`}
                  pdfTitle="Transaction Center Report"
                  showPdf={false}
                  meta={{
                    reportName: 'Transaction Center Export',
                    generatedByName: currentUserName,
                    generatedByRole: currentUserRole,
                  }}
                />
              </div>
            )}
          </div>

          {filtersOpen && (
            <div className="px-4 pb-4 space-y-3">
              <div className="flex flex-wrap gap-3 items-end">
                {/* Inventory sources require an explicitly authorized role. */}
                {inventoryAllowed && (
                  <div>
                    <label className="text-xs font-semibold text-slate-600 block mb-1">Source</label>
                    <select
                      value={pendingFilters.source}
                      onChange={e => setPendingFilters(p => ({ ...p, source: e.target.value, category: '', status: '' }))}
                      className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 bg-white focus:outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/25 cursor-pointer"
                    >
                      <option value="all">All Sources</option>
                      <option value="delivery">Delivery Records</option>
                      <option value="inventory">Inventory Movements</option>
                    </select>
                  </div>
                )}

                {/* Category filter — only when source includes delivery */}
                {showCategoryFilter && (
                  <div>
                    <label className="text-xs font-semibold text-slate-600 block mb-1">Category</label>
                    <select
                      value={pendingFilters.category}
                      onChange={e => setPendingFilters(p => ({ ...p, category: e.target.value }))}
                      className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 bg-white focus:outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/25 cursor-pointer"
                    >
                      <option value="">All Categories</option>
                      {categoryOptions.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Status filter — only when source includes delivery */}
                {showStatusFilter && (
                  <div>
                    <label className="text-xs font-semibold text-slate-600 block mb-1">Status</label>
                    <select
                      value={pendingFilters.status}
                      onChange={e => setPendingFilters(p => ({ ...p, status: e.target.value }))}
                      className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 bg-white focus:outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/25 cursor-pointer"
                    >
                      <option value="">All Statuses</option>
                      <option value="SCHEDULED">Scheduled</option>
                      <option value="TRANSPORT_COMPLETE">Transport Complete</option>
                      <option value="ACCOMPLISHED">Complete</option>
                      <option value="ON_HOLD">On-Hold</option>
                      <option value="RESCHEDULED">Rescheduled</option>
                      <option value="PENDING">Pending</option>
                    </select>
                  </div>
                )}

                {/* Date range */}
                <div>
                  <label className="text-xs font-semibold text-slate-600 block mb-1">From</label>
                  <input
                    type="date"
                    value={pendingFilters.from}
                    onChange={e => setPendingFilters(p => ({ ...p, from: e.target.value }))}
                    className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 bg-white focus:outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/25"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600 block mb-1">To</label>
                  <input
                    type="date"
                    value={pendingFilters.to}
                    onChange={e => setPendingFilters(p => ({ ...p, to: e.target.value }))}
                    className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 bg-white focus:outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/25"
                  />
                </div>

                {/* Actions */}
                <div className="flex items-end gap-2 ml-auto">
                  <button
                    type="button"
                    onClick={handleClear}
                    className={btnSecondaryClass}
                  >
                    Clear
                  </button>
                  <button
                    type="button"
                    onClick={handleApply}
                    className={btnPrimaryClass}
                  >
                    Apply Filters
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-brand-blue" />
          </div>
        ) : error ? (
          <div className="flex items-center justify-center gap-2 py-16 text-red-600 text-sm">
            <AlertTriangle className="w-4 h-4" /> {error}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className={tableHeaderRowClass}>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Source</th>
                  <th className="px-4 py-3">Type / Category</th>
                  <th className="px-4 py-3">Reference</th>
                  <th className="px-4 py-3">Entity</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 max-w-[220px]">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {transactions.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-sm text-slate-500">
                      No transactions found for the selected filters.
                    </td>
                  </tr>
                ) : (
                  transactions.map(txn => (
                    <TransactionRow
                      key={`${txn.source}-${txn.id}`}
                      txn={txn}
                      onClick={() => setSelected({ source: txn.source, id: txn.id })}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        <div className="border-t border-slate-100">
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            totalItems={total}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={(newSize) => {
              setPageSize(newSize);
              setPage(1);
            }}
            pageSizeOptions={[10, 25, 50, 100]}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Transaction row ──────────────────────────────────────────────────────────

function TransactionRow({ txn, onClick }: { key?: React.Key; txn: ApiTransaction; onClick: () => void }) {
  const statusStyle = txn.status ? statusBadgeClass(txn.status) : '';
  const statusLabel = txn.status ? statusDisplayLabel(txn.status) : null;

  return (
    <tr
      className="hover:bg-blue-50/40 focus-within:bg-blue-50/40 cursor-pointer transition-all"
      onClick={onClick}
    >
      <td className="px-4 py-3 tabular-nums text-slate-700 whitespace-nowrap">{txn.date}</td>
      <td className="px-4 py-3">
        <SourceBadge source={txn.source} />
      </td>
      <td className="px-4 py-3 font-semibold text-slate-700">{txn.type}</td>
      <td className="px-4 py-3 tabular-nums">
        <button
          type="button"
          onClick={e => { e.stopPropagation(); onClick(); }}
          aria-label={`Open transaction ${txn.reference}`}
          className={`${tableLeadButtonClass} tabular-nums text-xs`}
        >
          {txn.reference}
        </button>
      </td>
      <td className="px-4 py-3 max-w-[160px] truncate font-semibold text-slate-800" title={txn.entity}>
        {txn.entity}
      </td>
      <td className="px-4 py-3">
        {statusLabel ? (
          <span className={`px-2 py-0.5 rounded-full border text-xs font-semibold inline-block whitespace-nowrap ${statusStyle}`}>
            {statusLabel}
          </span>
        ) : (
          <span className="text-slate-400">—</span>
        )}
      </td>
      <td className="px-4 py-3 max-w-[220px] truncate text-slate-600" title={txn.description}>
        {txn.description}
      </td>
    </tr>
  );
}
