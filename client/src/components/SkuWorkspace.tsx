import { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeft, ChevronLeft, ChevronRight, Package, Layers,
  ArrowRightLeft, ShoppingBag, TrendingUp, Truck, RotateCcw,
  Banknote, FileText, BarChart3, Shield, Lock,
  Loader2, AlertTriangle, RefreshCw, CheckCircle2,
  ClipboardList, History, FolderOpen
} from 'lucide-react';
import { api, ApiSku, ApiAuditEntry } from '../api';

interface SkuWorkspaceProps {
  skuId: string;
  allSkuIds: string[];
  currentUserRole: string;
  currentUserName: string;
  onBack: () => void;
  onRefresh: () => void;
  onNavigateToSku: (id: string) => void;
}

type TabId =
  | 'general' | 'inventory' | 'transactions' | 'purchase' | 'sales'
  | 'delivery' | 'rma' | 'accounting' | 'documents' | 'analytics' | 'audit';

interface TabDef {
  id: TabId;
  label: string;
  icon: typeof Package;
}

const ALL_TABS: TabDef[] = [
  { id: 'general',      label: 'General',                icon: ClipboardList  },
  { id: 'inventory',    label: 'Inventory',              icon: Layers },
  { id: 'transactions', label: 'Transactions',           icon: ArrowRightLeft },
  { id: 'purchase',     label: 'Purchase History',       icon: ShoppingBag },
  { id: 'sales',        label: 'Sales History',          icon: TrendingUp },
  { id: 'delivery',     label: 'Delivery History',       icon: Truck },
  { id: 'rma',          label: 'RMA History',            icon: RotateCcw },
  { id: 'accounting',   label: 'Accounting History',     icon: Banknote },
  { id: 'documents',    label: 'Documents & Attachments',icon: FolderOpen     },
  { id: 'analytics',    label: 'Analytics & Forecasting',icon: BarChart3 },
  { id: 'audit',        label: 'Audit Trail',            icon: History        }
];

const TABS_BY_ROLE: Record<string, TabId[]> = {
  Admin: ['general','inventory','transactions','purchase','sales','delivery','rma','accounting','documents','analytics','audit'],
  'Sales Coordinator': ['general','inventory'],
  Logistics: ['general','inventory'],
  TASS: ['general']
};

const CATEGORY_LABEL: Record<string, string> = {
  A: 'Category A — High Value',
  B: 'Category B — Medium Value',
  C: 'Category C — Consumables / Low Value'
};

const CATEGORY_BADGE: Record<string, string> = {
  A: 'bg-purple-100 text-purple-800 border-purple-200',
  B: 'bg-blue-100 text-blue-800 border-blue-200',
  C: 'bg-slate-100 text-slate-800 border-slate-200'
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

// ─── Scaffold placeholder shared by 8 tabs ─────────────────────────────────
function ScaffoldTab({
  icon: Icon,
  label,
  detail
}: {
  icon: typeof Package;
  label: string;
  detail?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
      <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center">
        <Icon className="w-8 h-8 text-slate-300" />
      </div>
      <div>
        <h3 className="text-base font-bold text-slate-700">{label}</h3>
        <p className="text-sm text-slate-400 mt-1 max-w-sm">
          {detail ?? `This section is under development. ${label} data will appear here once the module is connected.`}
        </p>
      </div>
    </div>
  );
}

// ─── Audit Trail Timeline ───────────────────────────────────────────────────
function AuditTrailTab({ skuId }: { skuId: string }) {
  const [entries, setEntries] = useState<ApiAuditEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    api.getSkuAudit(skuId)
      .then(setEntries)
      .catch(e => setError(e.message ?? 'Failed to load audit trail.'))
      .finally(() => setLoading(false));
  }, [skuId]);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-[#0078C1]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-red-600 text-sm">
        <AlertTriangle className="w-4 h-4" /> {error}
      </div>
    );
  }

  if (!entries || entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center space-y-3">
        <Shield className="w-10 h-10 text-slate-200" />
        <p className="text-sm text-slate-400">No audit trail entries recorded yet for this SKU.</p>
      </div>
    );
  }

  const actionColor: Record<string, string> = {
    CREATE: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    UPDATE: 'bg-blue-100 text-blue-700 border-blue-200',
    DELETE: 'bg-red-100 text-red-700 border-red-200'
  };
  const dotColor: Record<string, string> = {
    CREATE: 'bg-emerald-500',
    UPDATE: 'bg-blue-500',
    DELETE: 'bg-red-500'
  };

  return (
    <div className="space-y-1 py-4 px-2">
      <p className="text-xs text-slate-400 mb-4 px-2">
        {entries.length} audit event{entries.length !== 1 ? 's' : ''} — most recent first
      </p>
      <div className="relative">
        <div className="absolute left-6 top-0 bottom-0 w-px bg-slate-200" />
        <div className="space-y-4">
          {entries.map(entry => (
            <div key={entry.id} className="flex items-start gap-4 pl-2">
              <div className={`relative z-10 w-9 h-9 rounded-full flex items-center justify-center shrink-0 border-2 border-white shadow-sm ${dotColor[entry.action] ?? 'bg-slate-400'}`}>
                <Shield className="w-4 h-4 text-white" />
              </div>
              <div className="flex-1 bg-white border border-slate-200 rounded-xl p-4 shadow-sm min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span className={`px-2 py-0.5 rounded-full border text-[10px] font-black uppercase tracking-wider ${actionColor[entry.action] ?? 'bg-slate-100 text-slate-700 border-slate-200'}`}>
                    {entry.action}
                  </span>
                  <span className="text-xs font-semibold text-slate-700">{entry.changed_by}</span>
                  <span className="text-[11px] text-slate-400 ml-auto">{formatTs(entry.timestamp)}</span>
                </div>
                {entry.new_value && (
                  <pre className="text-[11px] text-slate-500 bg-slate-50 rounded-lg p-2 mt-2 overflow-x-auto whitespace-pre-wrap break-all">
                    {JSON.stringify(entry.new_value, null, 2)}
                  </pre>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Inventory Tab ──────────────────────────────────────────────────────────
function InventoryTab({
  sku,
  currentUserRole,
  onAdjusted
}: {
  sku: ApiSku;
  currentUserRole: string;
  onAdjusted: (updated: ApiSku) => void;
}) {
  const inv = sku.inventory;
  const atp = inv?.atp ?? 0;
  const onHand = inv?.on_hand_qty ?? 0;

  const canAdjust = currentUserRole === 'Admin' || currentUserRole === 'Logistics';

  const [adjType, setAdjType] = useState<string>('Adjustment');
  const [adjQty, setAdjQty] = useState<string>('');
  const [adjRef, setAdjRef] = useState<string>('');
  const [adjusting, setAdjusting] = useState(false);
  const [adjError, setAdjError] = useState<string | null>(null);
  const [adjSuccess, setAdjSuccess] = useState(false);

  let stockLabel = 'In Stock';
  let stockColor = 'bg-green-50 text-green-700 border-green-200';
  if (onHand <= 0) {
    stockLabel = 'Out of Stock';
    stockColor = 'bg-red-50 text-red-700 border-red-200';
  } else if (atp <= sku.reorder_point) {
    stockLabel = 'Low Stock';
    stockColor = 'bg-amber-50 text-amber-700 border-amber-200';
  }

  const handleAdjust = async () => {
    const qty = parseInt(adjQty, 10);
    if (isNaN(qty) || qty === 0) {
      setAdjError('Quantity must be a non-zero number.');
      return;
    }
    if (!adjRef.trim()) {
      setAdjError('Reference is required.');
      return;
    }
    setAdjusting(true);
    setAdjError(null);
    try {
      const updated = await api.adjustStock(sku.id, {
        type: adjType,
        qty_change: qty,
        reference: adjRef.trim()
      });
      setAdjQty('');
      setAdjRef('');
      setAdjSuccess(true);
      setTimeout(() => setAdjSuccess(false), 3000);
      onAdjusted(updated);
    } catch (e: any) {
      setAdjError(e.message ?? 'Stock adjustment failed.');
    } finally {
      setAdjusting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'On Hand', value: onHand, color: 'text-slate-900' },
          { label: 'Allocated', value: inv?.allocated_qty ?? 0, color: 'text-amber-700' },
          { label: 'Available to Promise (ATP)', value: atp, color: atp <= sku.reorder_point && atp > 0 ? 'text-amber-600' : atp <= 0 ? 'text-red-600' : 'text-emerald-600' }
        ].map(kpi => (
          <div key={kpi.label} className="bg-white border border-slate-200 rounded-xl p-4 text-center shadow-sm">
            <p className="text-[11px] text-slate-400 uppercase tracking-widest font-bold mb-1">{kpi.label}</p>
            <p className={`text-3xl font-black ${kpi.color}`}>{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* Details Row */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Inventory Details</h4>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <p className="text-[10px] text-slate-400 uppercase tracking-wider font-bold mb-0.5">Stock Status</p>
            <span className={`px-2.5 py-1 rounded-full border text-[10px] font-black uppercase tracking-wider inline-block ${stockColor}`}>
              {stockLabel}
            </span>
          </div>
          <div>
            <p className="text-[10px] text-slate-400 uppercase tracking-wider font-bold mb-0.5">Warehouse Bin</p>
            <p className="font-mono font-bold text-sm text-slate-800">{inv?.warehouse_location ?? '—'}</p>
          </div>
          <div>
            <p className="text-[10px] text-slate-400 uppercase tracking-wider font-bold mb-0.5">Unit Cost</p>
            <p className="font-semibold text-sm text-slate-800">₱{sku.unit_cost.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-[10px] text-slate-400 uppercase tracking-wider font-bold mb-0.5">Unit Price</p>
            <p className="font-semibold text-sm text-slate-800">₱{sku.unit_price.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-[10px] text-slate-400 uppercase tracking-wider font-bold mb-0.5">Reorder Threshold</p>
            <p className="font-mono font-bold text-sm text-slate-800">{sku.reorder_point} units</p>
          </div>
        </div>
      </div>

      {/* Recent Transactions */}
      {sku.recent_transactions && sku.recent_transactions.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 bg-slate-50">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Recent Inventory Transactions (last {sku.recent_transactions.length})</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-100 text-[10px] text-slate-400 uppercase tracking-widest font-bold">
                  <th className="px-4 py-2 text-left">Date</th>
                  <th className="px-4 py-2 text-left">Type</th>
                  <th className="px-4 py-2 text-right">Qty Change</th>
                  <th className="px-4 py-2 text-right">Balance</th>
                  <th className="px-4 py-2 text-left">Reference</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {sku.recent_transactions.map(t => (
                  <tr key={t.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 text-slate-500">{formatDate(t.date)}</td>
                    <td className="px-4 py-2.5">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                        t.type === 'Goods Receipt' ? 'bg-green-50 text-green-700' :
                        t.type === 'Sale'          ? 'bg-blue-50 text-blue-700' :
                        t.type === 'Transfer'      ? 'bg-violet-50 text-violet-700' :
                        'bg-amber-50 text-amber-700'
                      }`}>{t.type}</span>
                    </td>
                    <td className={`px-4 py-2.5 text-right font-bold ${t.qty_change > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                      {t.qty_change > 0 ? '+' : ''}{t.qty_change}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono font-semibold text-slate-800">{t.resulting_balance}</td>
                    <td className="px-4 py-2.5 font-mono text-slate-500 text-[11px]">{t.reference}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Stock Adjustment Form */}
      {canAdjust && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Stock Adjustment</h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-[11px] font-semibold text-slate-600 block mb-1">Adjustment Type</label>
              <select
                value={adjType}
                onChange={e => setAdjType(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1F3864] bg-slate-50"
              >
                <option>Goods Receipt</option>
                <option>Sale</option>
                <option>Adjustment</option>
                <option>Transfer</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                Qty Change <span className="text-slate-400 font-normal">(+ for in, − for out)</span>
              </label>
              <input
                type="number"
                value={adjQty}
                onChange={e => setAdjQty(e.target.value)}
                placeholder="e.g. 10 or -5"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-[#1F3864] bg-slate-50"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-slate-600 block mb-1">Reference</label>
              <input
                type="text"
                value={adjRef}
                onChange={e => setAdjRef(e.target.value)}
                placeholder="e.g. GRN-1010 or ADJ-883"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-[#1F3864] bg-slate-50"
              />
            </div>
          </div>
          {adjError && (
            <p className="text-red-600 text-xs flex items-center gap-1 mt-3">
              <AlertTriangle className="w-3.5 h-3.5" /> {adjError}
            </p>
          )}
          {adjSuccess && (
            <p className="text-emerald-600 text-xs flex items-center gap-1 mt-3">
              <CheckCircle2 className="w-3.5 h-3.5" /> Adjustment saved and inventory updated.
            </p>
          )}
          <button
            onClick={handleAdjust}
            disabled={adjusting}
            className="mt-4 px-5 py-2 bg-[#1F3864] hover:bg-[#0078C1] text-white text-xs font-bold rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {adjusting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Post Adjustment
          </button>
        </div>
      )}
    </div>
  );
}

// ─── General Tab ────────────────────────────────────────────────────────────
function GeneralTab({ sku }: { sku: ApiSku }) {
  return (
    <div className="space-y-5">
      {/* Hero row */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
          <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-[#1F3864] to-[#0078C1] flex items-center justify-center shrink-0">
            <Package className="w-7 h-7 text-white" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className="font-mono text-2xl font-black text-slate-900">{sku.sku_code}</span>
              <span className={`px-2.5 py-1 rounded-md font-black text-xs shadow-sm border ${CATEGORY_BADGE[sku.category] ?? 'bg-slate-100 text-slate-800 border-slate-200'}`}>
                {sku.category}
              </span>
            </div>
            <p className="text-base font-bold text-slate-800">{sku.name}</p>
            <p className="text-xs text-slate-500 mt-1">{CATEGORY_LABEL[sku.category]}</p>
          </div>
        </div>

        {sku.description && (
          <div className="mt-4 pt-4 border-t border-slate-100">
            <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold mb-1.5">Description</p>
            <p className="text-sm text-slate-600 leading-relaxed">{sku.description}</p>
          </div>
        )}
      </div>

      {/* Attribute grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {[
          { label: 'Unit Cost',     value: `₱${sku.unit_cost.toLocaleString()}` },
          { label: 'Unit Price',    value: `₱${sku.unit_price.toLocaleString()}` },
          { label: 'Reorder Point', value: `${sku.reorder_point} units` },
          { label: 'Category',      value: CATEGORY_LABEL[sku.category] ?? sku.category },
          { label: 'Created By',    value: sku.created_by },
          { label: 'Created At',    value: formatTs(sku.created_at) },
          { label: 'Last Modified By', value: sku.modified_by },
          { label: 'Last Updated At',  value: formatTs(sku.updated_at) }
        ].map(row => (
          <div key={row.label} className="bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-sm">
            <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold mb-0.5">{row.label}</p>
            <p className="text-sm font-semibold text-slate-800">{row.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────
export default function SkuWorkspace({
  skuId,
  allSkuIds,
  currentUserRole,
  currentUserName: _currentUserName,
  onBack,
  onRefresh,
  onNavigateToSku
}: SkuWorkspaceProps) {
  const [sku, setSku] = useState<ApiSku | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('general');

  const allowedTabIds = TABS_BY_ROLE[currentUserRole] ?? ['general'];
  const visibleTabs = ALL_TABS.filter(t => allowedTabIds.includes(t.id));

  const fetchSku = useCallback(() => {
    setLoading(true);
    setError(null);
    api.getSku(skuId)
      .then(data => {
        setSku(data);
        // reset to first visible tab if current tab is not allowed
        setActiveTab(prev => (allowedTabIds.includes(prev) ? prev : (allowedTabIds[0] as TabId)));
      })
      .catch(e => setError(e.message ?? 'Failed to load SKU.'))
      .finally(() => setLoading(false));
  }, [skuId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchSku();
  }, [fetchSku]);

  const currentIndex = allSkuIds.indexOf(skuId);
  const prevId = currentIndex > 0 ? allSkuIds[currentIndex - 1] : null;
  const nextId = currentIndex < allSkuIds.length - 1 ? allSkuIds[currentIndex + 1] : null;

  const handleRefresh = () => {
    fetchSku();
    onRefresh();
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-slate-400">
        <Loader2 className="w-8 h-8 animate-spin mb-3 text-[#0078C1]" />
        <span className="text-sm">Loading SKU workspace…</span>
      </div>
    );
  }

  if (error || !sku) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-red-500 space-y-3">
        <AlertTriangle className="w-8 h-8" />
        <p className="text-sm">{error ?? 'SKU not found.'}</p>
        <button onClick={onBack} className="text-sm text-[#0078C1] hover:underline">← Back to SKU Master</button>
      </div>
    );
  }

  const renderTabContent = () => {
    if (!allowedTabIds.includes(activeTab)) {
      return (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-500">
          <Lock className="w-8 h-8 text-slate-300" />
          <p className="text-sm">This tab requires Admin role.</p>
        </div>
      );
    }

    switch (activeTab) {
      case 'general':
        return <GeneralTab sku={sku} />;
      case 'inventory':
        return (
          <InventoryTab
            sku={sku}
            currentUserRole={currentUserRole}
            onAdjusted={updated => {
              setSku(updated);
              onRefresh();
            }}
          />
        );
      case 'transactions':
        return (
          <ScaffoldTab
            icon={ArrowRightLeft}
            label="Transactions"
            detail="Links to the Transaction Center filtered by this SKU — coming with the Transaction Center module."
          />
        );
      case 'purchase':
        return <ScaffoldTab icon={ShoppingBag} label="Purchase History" />;
      case 'sales':
        return <ScaffoldTab icon={TrendingUp} label="Sales History" />;
      case 'delivery':
        return <ScaffoldTab icon={Truck} label="Delivery History" />;
      case 'rma':
        return <ScaffoldTab icon={RotateCcw} label="RMA History" />;
      case 'accounting':
        return <ScaffoldTab icon={Banknote} label="Accounting History" />;
      case 'documents':
        return <ScaffoldTab icon={FileText} label="Documents & Attachments" />;
      case 'analytics':
        return <ScaffoldTab icon={BarChart3} label="Analytics & Forecasting" />;
      case 'audit':
        return currentUserRole === 'Admin'
          ? <AuditTrailTab skuId={skuId} />
          : (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-500">
              <Lock className="w-8 h-8 text-slate-300" />
              <p className="text-sm">Audit Trail access requires Admin role.</p>
            </div>
          );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-4" id="sku-workspace">
      {/* Navigation bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 pb-4">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-[#0078C1] hover:text-[#1F3864] text-xs font-semibold transition-colors shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
            SKU Master
          </button>
          <span className="text-slate-300">/</span>
          <span className="font-mono font-black text-slate-700 text-sm truncate">{sku.sku_code}</span>
          <span className="text-slate-400 text-xs truncate hidden sm:inline">— {sku.name}</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>

          <div className="flex items-center gap-1">
            <button
              onClick={() => prevId && onNavigateToSku(prevId)}
              disabled={!prevId}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-semibold text-slate-600"
              title="Previous SKU"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              Prev
            </button>
            <span className="text-[11px] text-slate-400 px-1 hidden sm:inline">
              {currentIndex + 1} / {allSkuIds.length}
            </span>
            <button
              onClick={() => nextId && onNavigateToSku(nextId)}
              disabled={!nextId}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-semibold text-slate-600"
              title="Next SKU"
            >
              Next
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="border-b border-slate-200 overflow-x-auto">
          <div className="flex items-stretch min-w-max">
            {visibleTabs.map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-5 py-4 text-sm whitespace-nowrap border-b-[3px] transition-all ${
                    isActive
                      ? 'border-[#1F3864] text-[#1F3864] bg-blue-50/70 font-semibold'
                      : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-100 font-medium'
                  }`}
                >
                  <Icon className="w-[18px] h-[18px] shrink-0" />
                  {tab.label}
                  {tab.id === 'audit' && <span className="text-[9px] font-black text-slate-400 uppercase ml-1">ADMIN</span>}
                </button>
              );
            })}
          </div>
        </div>

        {/* Tab Content */}
        <div className="p-5">
          {renderTabContent()}
        </div>
      </div>
    </div>
  );
}
