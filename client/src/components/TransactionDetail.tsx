import { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Loader2,
  AlertTriangle,
  GitCommitHorizontal,
  Package,
  Truck
} from 'lucide-react';
import { api, ApiTransactionDetail } from '../api';

interface TransactionDetailProps {
  source: 'delivery' | 'inventory';
  id: string;
  onBack: () => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  SCHEDULED:   'Scheduled',
  ACCOMPLISHED: 'Accomplished',
  ON_HOLD:     'On-Hold',
  RESCHEDULED: 'Rescheduled',
  PENDING:     'Pending'
};

const STATUS_BADGE: Record<string, string> = {
  SCHEDULED:   'bg-blue-50 text-blue-700 border-blue-200',
  ACCOMPLISHED: 'bg-green-50 text-green-700 border-green-200',
  ON_HOLD:     'bg-red-50 text-red-700 border-red-200',
  RESCHEDULED: 'bg-violet-50 text-violet-700 border-violet-200',
  PENDING:     'bg-amber-50 text-amber-700 border-amber-200'
};

const ACTION_BADGE: Record<string, string> = {
  CREATE: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  UPDATE: 'bg-blue-100 text-blue-700 border-blue-200',
  DELETE: 'bg-red-100 text-red-700 border-red-200'
};

const ACTION_DOT: Record<string, string> = {
  CREATE: 'bg-emerald-500',
  UPDATE: 'bg-blue-500',
  DELETE: 'bg-red-500'
};

const TXN_TYPE_BADGE: Record<string, string> = {
  'Goods Receipt': 'bg-green-50 text-green-700',
  'Sale':          'bg-blue-50 text-blue-700',
  'Transfer':      'bg-violet-50 text-violet-700',
  'Adjustment':    'bg-amber-50 text-amber-700'
};

function formatTs(ts: string | Date): string {
  return new Date(ts).toLocaleString('en-PH', {
    year: 'numeric', month: 'short', day: '2-digit',
    hour: '2-digit', minute: '2-digit'
  });
}

function formatDate(ts: string | Date): string {
  return new Date(ts).toLocaleDateString('en-PH', {
    year: 'numeric', month: 'short', day: '2-digit'
  });
}

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold mb-0.5">{label}</p>
      <p className="text-sm font-semibold text-slate-800">{value || '—'}</p>
    </div>
  );
}

// ─── Delivery Detail ──────────────────────────────────────────────────────────

function DeliveryDetail({ detail }: { detail: ApiTransactionDetail }) {
  const statusStyle = detail.status ? (STATUS_BADGE[detail.status] ?? 'bg-slate-50 text-slate-700 border-slate-200') : '';
  const statusLabel = detail.status ? (STATUS_LABEL[detail.status] ?? detail.status) : '—';

  const timeline = detail.timeline ?? [];

  return (
    <div className="space-y-6">
      {/* Summary Card */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 bg-[#1F3864] text-white flex flex-wrap items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
            <Truck className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/60">Delivery Record</p>
            <p className="font-mono font-black text-white text-base leading-tight truncate">{detail.reference}</p>
          </div>
          <div className="ml-auto flex items-center gap-2 flex-wrap">
            <span className="px-2.5 py-1 rounded-full bg-white/10 border border-white/20 text-white text-[11px] font-bold">
              {detail.type}
            </span>
            {detail.status && (
              <span className={`px-2.5 py-1 rounded-full border text-[11px] font-black uppercase tracking-wide ${statusStyle}`}>
                {statusLabel}
              </span>
            )}
          </div>
        </div>

        <div className="p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <InfoRow label="Company / Entity"    value={detail.entity} />
          <InfoRow label="Item Description"    value={detail.description} />
          <InfoRow label="Delivery Date"       value={detail.delivery_date} />
          <InfoRow label="Date & Time"         value={detail.date_time ? formatTs(detail.date_time) : null} />
          <InfoRow label="Area"                value={detail.area} />
          <InfoRow label="Vehicle"             value={detail.vehicle} />
          <InfoRow label="Driver"              value={detail.driver} />
          <InfoRow label="Driver Assistant"    value={detail.driver_assistants?.join(', ') ?? null} />
          <InfoRow label="Account Manager"     value={detail.account_manager} />
          <InfoRow label="Item Type"           value={detail.item_type} />
          <InfoRow label="Priority"            value={detail.priority} />
          <InfoRow label="Remarks"             value={detail.remarks} />
          <InfoRow label="Created By"          value={detail.created_by} />
          <InfoRow label="Created At"          value={formatTs(detail.created_at)} />
          <InfoRow label="Last Updated"        value={formatTs(detail.updated_at)} />
        </div>
      </div>

      {/* Enterprise Timeline */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50">
          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
            Audit Timeline
          </h3>
          {timeline.length > 0 && (
            <p className="text-xs text-slate-400 mt-0.5">
              {timeline.length} event{timeline.length !== 1 ? 's' : ''} — oldest first
            </p>
          )}
        </div>

        <div className="p-6">
          {timeline.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center space-y-3">
              <GitCommitHorizontal className="w-8 h-8 text-slate-200" />
              <p className="text-sm text-slate-400">
                No audit trail recorded. Timeline will appear here once the record is modified.
              </p>
            </div>
          ) : (
            <div className="relative">
              {/* Vertical line */}
              <div className="absolute left-[18px] top-0 bottom-0 w-px bg-slate-200" />
              <div className="space-y-4">
                {timeline.map((event, idx) => (
                  <div key={idx} className="flex items-start gap-4">
                    <div
                      className={`relative z-10 w-9 h-9 rounded-full flex items-center justify-center shrink-0 border-2 border-white shadow-sm ${ACTION_DOT[event.action] ?? 'bg-slate-400'}`}
                    >
                      <GitCommitHorizontal className="w-4 h-4 text-white" />
                    </div>
                    <div className="flex-1 bg-slate-50 border border-slate-200 rounded-xl p-4 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span
                          className={`px-2 py-0.5 rounded-full border text-[10px] font-black uppercase tracking-wider ${ACTION_BADGE[event.action] ?? 'bg-slate-100 text-slate-700 border-slate-200'}`}
                        >
                          {event.action}
                        </span>
                        <span className="text-xs font-bold text-slate-700">{event.label}</span>
                        <span className="text-[11px] text-slate-400 ml-auto">
                          {formatTs(event.timestamp)}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500">
                        by <span className="font-semibold">{event.changed_by}</span>
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Inventory Detail ─────────────────────────────────────────────────────────

function InventoryDetail({ detail }: { detail: ApiTransactionDetail }) {
  const typeBadge = TXN_TYPE_BADGE[detail.type] ?? 'bg-slate-50 text-slate-700';
  const qty       = detail.qty_change ?? 0;
  const related   = detail.related_transactions ?? [];

  return (
    <div className="space-y-6">
      {/* Summary Card */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 bg-[#0f766e] text-white flex flex-wrap items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
            <Package className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/60">Inventory Transaction</p>
            <p className="font-mono font-black text-white text-base leading-tight truncate">{detail.reference}</p>
          </div>
          <div className="ml-auto">
            <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold bg-white/15 border border-white/25 text-white`}>
              {detail.type}
            </span>
          </div>
        </div>

        <div className="p-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {/* KPI tiles */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-center">
            <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold mb-1">Qty Change</p>
            <p className={`text-2xl font-black ${qty >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
              {qty >= 0 ? '+' : ''}{qty}
            </p>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-center">
            <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold mb-1">Resulting Balance</p>
            <p className="text-2xl font-black text-slate-900">{detail.resulting_balance}</p>
          </div>

          <div className="col-span-2 sm:col-span-1 lg:col-span-2 flex flex-col justify-center">
            <div className="grid grid-cols-1 gap-3">
              <InfoRow label="Date Recorded" value={formatTs(detail.created_at)} />
              <InfoRow label="Reference"     value={detail.reference} />
            </div>
          </div>
        </div>

        {/* Product details */}
        {detail.product && (
          <div className="px-6 pb-6">
            <div className="border-t border-slate-100 pt-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
              <InfoRow label="Product Name" value={detail.product.name} />
              <InfoRow label="SKU Code"     value={detail.product.sku_code} />
              <InfoRow label="Category"     value={`Category ${detail.product.category}`} />
              <InfoRow label="Type"         value={detail.type} />
            </div>
          </div>
        )}
      </div>

      {/* Related transactions */}
      {related.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 bg-slate-50">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              Other Recent Transactions — Same Product (last {related.length})
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-100 text-[10px] text-slate-400 uppercase tracking-widest font-bold">
                  <th className="px-5 py-3 text-left">Date</th>
                  <th className="px-5 py-3 text-left">Type</th>
                  <th className="px-5 py-3 text-right">Qty Change</th>
                  <th className="px-5 py-3 text-right">Balance</th>
                  <th className="px-5 py-3 text-left">Reference</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {related.map(r => (
                  <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-3 text-slate-500">{formatDate(r.date)}</td>
                    <td className="px-5 py-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${TXN_TYPE_BADGE[r.type] ?? 'bg-slate-50 text-slate-700'}`}>
                        {r.type}
                      </span>
                    </td>
                    <td className={`px-5 py-3 text-right font-bold ${r.qty_change >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                      {r.qty_change >= 0 ? '+' : ''}{r.qty_change}
                    </td>
                    <td className="px-5 py-3 text-right font-mono font-semibold text-slate-800">{r.resulting_balance}</td>
                    <td className="px-5 py-3 font-mono text-slate-500 text-[11px]">{r.reference}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function TransactionDetail({ source, id, onBack }: TransactionDetailProps) {
  const [detail, setDetail]   = useState<ApiTransactionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api.getTransaction(source, id)
      .then(setDetail)
      .catch(e => setError(e.message ?? 'Failed to load transaction.'))
      .finally(() => setLoading(false));
  }, [source, id]);

  const breadcrumbId = detail?.reference ?? id;

  return (
    <div className="space-y-4" id="transaction-detail">
      {/* Navigation bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 pb-4">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-[#0078C1] hover:text-[#1F3864] text-xs font-semibold transition-colors shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
            Transaction Center
          </button>
          <span className="text-slate-300">/</span>
          <span className="font-mono font-bold text-slate-700 text-sm truncate">{breadcrumbId}</span>
        </div>
      </div>

      {loading && (
        <div className="flex flex-col items-center justify-center py-32 text-slate-400">
          <Loader2 className="w-8 h-8 animate-spin mb-3 text-[#0078C1]" />
          <span className="text-sm">Loading transaction…</span>
        </div>
      )}

      {error && (
        <div className="flex flex-col items-center justify-center py-32 text-red-500 space-y-3">
          <AlertTriangle className="w-8 h-8" />
          <p className="text-sm">{error}</p>
          <button onClick={onBack} className="text-sm text-[#0078C1] hover:underline">
            ← Back to Transaction Center
          </button>
        </div>
      )}

      {!loading && !error && detail && (
        detail.source === 'delivery'
          ? <DeliveryDetail detail={detail} />
          : <InventoryDetail detail={detail} />
      )}
    </div>
  );
}
