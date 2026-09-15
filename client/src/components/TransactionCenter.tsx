import React, { useState, useEffect, useCallback } from 'react';
import { Filter, ChevronLeft, ChevronRight, Loader2, AlertTriangle } from 'lucide-react';
import { api, ApiTransaction, ApiTransactionList } from '../api';
import TransactionDetail from './TransactionDetail';
import ExportMenu from './ExportMenu';
import { TXN_COLUMNS, fmtDate, fmtStatus } from '../utils/export';

interface TransactionCenterProps {
  currentUserRole: string;
  currentUserName: string;
}

const showExportForRole = (role: string) => role === 'Admin' || role === 'Sales Coordinator';

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  SCHEDULED:    'Scheduled',
  ACCOMPLISHED: 'Accomplished',
  ON_HOLD:      'On-Hold',
  RESCHEDULED:  'Rescheduled',
  PENDING:      'Pending'
};

const STATUS_BADGE: Record<string, string> = {
  SCHEDULED:    'bg-blue-50 text-blue-700 border-blue-200',
  ACCOMPLISHED: 'bg-green-50 text-green-700 border-green-200',
  ON_HOLD:      'bg-red-50 text-red-700 border-red-200',
  RESCHEDULED:  'bg-violet-50 text-violet-700 border-violet-200',
  PENDING:      'bg-amber-50 text-amber-700 border-amber-200'
};

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
  ]
};

function getCategoryOptions(role: string) {
  return CATEGORY_OPTIONS_BY_ROLE[role] ?? CATEGORY_OPTIONS_BY_ROLE['Admin'];
}

// ─── Filter state ─────────────────────────────────────────────────────────────

interface Filters {
  source:   string;
  category: string;
  status:   string;
  from:     string;
  to:       string;
}

function defaultFilters(role: string): Filters {
  return {
    source:   role === 'TASS' ? 'delivery' : 'all',
    category: '',
    status:   '',
    from:     '',
    to:       ''
  };
}

// ─── Source badge ─────────────────────────────────────────────────────────────

function SourceBadge({ source }: { source: 'delivery' | 'inventory' }) {
  return source === 'delivery' ? (
    <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wide bg-[#1F3864] text-white whitespace-nowrap">
      Delivery
    </span>
  ) : (
    <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wide bg-teal-700 text-white whitespace-nowrap">
      Inventory
    </span>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function TransactionCenter({ currentUserRole, currentUserName }: TransactionCenterProps) {
  const [data,    setData]    = useState<ApiTransactionList | null>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const [page,    setPage]    = useState(1);
  const [filters, setFilters] = useState<Filters>(() => defaultFilters(currentUserRole));
  const [pendingFilters, setPendingFilters] = useState<Filters>(() => defaultFilters(currentUserRole));
  const [filtersOpen, setFiltersOpen] = useState(true);

  // Selected transaction for detail view
  const [selected, setSelected] = useState<{ source: 'delivery' | 'inventory'; id: string } | null>(null);

  const isTass = currentUserRole === 'TASS';
  const categoryOptions = getCategoryOptions(currentUserRole);

  // Only show category/status filters when source includes delivery records
  const showCategoryFilter = pendingFilters.source !== 'inventory' && !isTass;
  const showStatusFilter   = pendingFilters.source !== 'inventory';

  const fetchData = useCallback(async (f: Filters, p: number) => {
    setLoading(true);
    setError(null);
    try {
      const params: Parameters<typeof api.getTransactions>[0] = { page: p, limit: 25 };
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
    fetchData(filters, page);
  }, [filters, page, fetchData]);

  const handleApply = () => {
    setFilters(pendingFilters);
    setPage(1);
  };

  const handleClear = () => {
    const fresh = defaultFilters(currentUserRole);
    setPendingFilters(fresh);
    setFilters(fresh);
    setPage(1);
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
    status:      t.status ? (STATUS_LABEL[t.status] ?? t.status) : '',
    date_fmt:    fmtDate(t.date),
    description: t.description,
    qty_change:  t.qty_change ?? '',
    balance:     t.resulting_balance ?? '',
    created_by:  t.created_by ?? '',
  }));

  return (
    <div className="space-y-6" id="transaction-center">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 pb-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Transaction Center</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Unified view of all operational transactions across delivery records and inventory movements.
          </p>
        </div>
        {showExportForRole(currentUserRole) && (
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
        )}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        {/* Filters bar */}
        <div className="border-b border-slate-200">
          <div
            className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-slate-50 transition-colors select-none"
            onClick={() => setFiltersOpen(v => !v)}
          >
            <span className="flex items-center gap-1.5 text-[10px] font-black text-slate-400 uppercase tracking-widest">
              <Filter className="w-3.5 h-3.5" /> Filters
            </span>
            <span className="text-[10px] text-slate-400">{filtersOpen ? 'Collapse ▲' : 'Expand ▼'}</span>
          </div>

          {filtersOpen && (
            <div className="px-4 pb-4 space-y-3">
              <div className="flex flex-wrap gap-3 items-end">
                {/* Source filter — hidden for TASS */}
                {!isTass && (
                  <div>
                    <label className="text-[11px] font-semibold text-slate-500 block mb-1">Source</label>
                    <select
                      value={pendingFilters.source}
                      onChange={e => setPendingFilters(p => ({ ...p, source: e.target.value, category: '', status: '' }))}
                      className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-700 bg-white focus:outline-none focus:border-[#1F3864]"
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
                    <label className="text-[11px] font-semibold text-slate-500 block mb-1">Category</label>
                    <select
                      value={pendingFilters.category}
                      onChange={e => setPendingFilters(p => ({ ...p, category: e.target.value }))}
                      className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-700 bg-white focus:outline-none focus:border-[#1F3864]"
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
                    <label className="text-[11px] font-semibold text-slate-500 block mb-1">Status</label>
                    <select
                      value={pendingFilters.status}
                      onChange={e => setPendingFilters(p => ({ ...p, status: e.target.value }))}
                      className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-700 bg-white focus:outline-none focus:border-[#1F3864]"
                    >
                      <option value="">All Statuses</option>
                      <option value="SCHEDULED">Scheduled</option>
                      <option value="ACCOMPLISHED">Accomplished</option>
                      <option value="ON_HOLD">On-Hold</option>
                      <option value="RESCHEDULED">Rescheduled</option>
                      <option value="PENDING">Pending</option>
                    </select>
                  </div>
                )}

                {/* Date range */}
                <div>
                  <label className="text-[11px] font-semibold text-slate-500 block mb-1">From</label>
                  <input
                    type="date"
                    value={pendingFilters.from}
                    onChange={e => setPendingFilters(p => ({ ...p, from: e.target.value }))}
                    className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-700 bg-white focus:outline-none focus:border-[#1F3864]"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-500 block mb-1">To</label>
                  <input
                    type="date"
                    value={pendingFilters.to}
                    onChange={e => setPendingFilters(p => ({ ...p, to: e.target.value }))}
                    className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-700 bg-white focus:outline-none focus:border-[#1F3864]"
                  />
                </div>

                {/* Actions */}
                <div className="flex items-end gap-2 ml-auto">
                  <button
                    onClick={handleClear}
                    className="px-3 py-1.5 text-xs font-semibold text-slate-500 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    Clear
                  </button>
                  <button
                    onClick={handleApply}
                    className="px-4 py-1.5 text-xs font-bold text-white bg-[#1F3864] hover:bg-[#0078C1] rounded-lg transition-colors"
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
            <Loader2 className="w-6 h-6 animate-spin text-[#0078C1]" />
          </div>
        ) : error ? (
          <div className="flex items-center justify-center gap-2 py-16 text-red-600 text-sm">
            <AlertTriangle className="w-4 h-4" /> {error}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
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
                    <td colSpan={7} className="px-4 py-12 text-center text-slate-400">
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

        {/* Footer / Pagination */}
        <div className="p-3 bg-slate-50 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-slate-500">
          <span>
            {total === 0
              ? 'No transactions'
              : `Showing ${startRow}–${endRow} of ${total} transaction${total !== 1 ? 's' : ''}`}
          </span>

          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}
                className="flex items-center gap-1 px-2.5 py-1 border border-slate-200 rounded-lg hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed text-xs font-semibold text-slate-600 transition-colors"
              >
                <ChevronLeft className="w-3.5 h-3.5" /> Prev
              </button>
              <span className="font-semibold text-slate-600">
                Page {page} of {totalPages}
              </span>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage(p => p + 1)}
                className="flex items-center gap-1 px-2.5 py-1 border border-slate-200 rounded-lg hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed text-xs font-semibold text-slate-600 transition-colors"
              >
                Next <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Transaction row ──────────────────────────────────────────────────────────

function TransactionRow({ txn, onClick }: { key?: React.Key; txn: ApiTransaction; onClick: () => void }) {
  const statusStyle = txn.status ? (STATUS_BADGE[txn.status] ?? 'bg-slate-50 text-slate-700 border-slate-200') : '';
  const statusLabel = txn.status ? (STATUS_LABEL[txn.status] ?? txn.status) : null;

  return (
    <tr
      className="hover:bg-blue-50/40 cursor-pointer transition-all"
      onClick={onClick}
    >
      <td className="px-4 py-3 font-mono text-slate-700 whitespace-nowrap">{txn.date}</td>
      <td className="px-4 py-3">
        <SourceBadge source={txn.source} />
      </td>
      <td className="px-4 py-3 font-semibold text-slate-700">{txn.type}</td>
      <td className="px-4 py-3 font-mono text-slate-700">{txn.reference}</td>
      <td className="px-4 py-3 max-w-[160px] truncate font-medium text-slate-800" title={txn.entity}>
        {txn.entity}
      </td>
      <td className="px-4 py-3">
        {statusLabel ? (
          <span className={`px-2 py-0.5 rounded-full border text-[10px] font-semibold tracking-wide inline-block whitespace-nowrap ${statusStyle}`}>
            {statusLabel}
          </span>
        ) : (
          <span className="text-slate-300">—</span>
        )}
      </td>
      <td className="px-4 py-3 max-w-[220px] truncate text-slate-500" title={txn.description}>
        {txn.description}
      </td>
    </tr>
  );
}
