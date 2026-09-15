import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, X, Truck, Package, ArrowRight } from 'lucide-react';
import { DeliveryRecord } from '../types';
import { ApiSku } from '../api';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  deliveryRecords: DeliveryRecord[];
  products: ApiSku[];
  onNavigate: (screen: string, item_id?: string) => void;
}

const CATEGORY_SCREEN: Record<string, string> = {
  'Deliveries': 'deliveries',
  'RMA': 'rma',
  'Accounting Collection': 'accounting_collection',
  'Procurement Pick-up': 'procurement_pickup',
  'Sales Orders': 'sales_orders'
};

const STATUS_DOT: Record<string, string> = {
  Delivered: 'bg-emerald-500',
  Scheduled: 'bg-blue-500',
  Pending: 'bg-amber-500',
  'On-Hold': 'bg-red-500',
  Rescheduled: 'bg-purple-500'
};

export default function GlobalSearch({ isOpen, onClose, deliveryRecords, products, onNavigate }: Props) {
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setCursor(-1);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const q = query.toLowerCase().trim();

  const matchedRecords = q.length < 2 ? [] : deliveryRecords.filter(r =>
    r.id.toLowerCase().includes(q) ||
    r.company_name.toLowerCase().includes(q) ||
    r.reference.toLowerCase().includes(q) ||
    (r.driver && r.driver.toLowerCase().includes(q)) ||
    r.account_manager.toLowerCase().includes(q) ||
    r.area.toLowerCase().includes(q)
  ).slice(0, 8);

  const matchedSkus = q.length < 2 ? [] : products.filter(p =>
    p.sku_code.toLowerCase().includes(q) ||
    p.name.toLowerCase().includes(q) ||
    p.description.toLowerCase().includes(q)
  ).slice(0, 5);

  const total = matchedRecords.length + matchedSkus.length;

  // Flat list of all results for keyboard nav
  type ResultItem =
    | { kind: 'record'; data: DeliveryRecord }
    | { kind: 'sku'; data: ApiSku };

  const allResults: ResultItem[] = [
    ...matchedRecords.map(r => ({ kind: 'record' as const, data: r })),
    ...matchedSkus.map(p => ({ kind: 'sku' as const, data: p }))
  ];

  const openItem = useCallback((item: ResultItem) => {
    if (item.kind === 'record') {
      onNavigate(CATEGORY_SCREEN[item.data.category] ?? 'deliveries', item.data.id);
    } else {
      onNavigate('inventory', item.data.id);
    }
    onClose();
  }, [onNavigate, onClose]);

  const handleKeyDown = (e: { key: string; preventDefault: () => void }) => {
    if (allResults.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor(c => Math.min(c + 1, allResults.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor(c => Math.max(c - 1, 0));
    } else if (e.key === 'Enter' && cursor >= 0) {
      e.preventDefault();
      openItem(allResults[cursor]);
    }
  };

  // Scroll highlighted item into view
  useEffect(() => {
    if (cursor < 0 || !listRef.current) return;
    const items = listRef.current.querySelectorAll('[data-result-item]');
    items[cursor]?.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  // Reset cursor when query changes
  useEffect(() => { setCursor(-1); }, [query]);

  if (!isOpen) return null;

  let globalIdx = -1;

  return (
    <div
      className="fixed inset-0 z-[60] bg-slate-900/60 backdrop-blur-sm flex items-start justify-center pt-[10vh] px-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white w-full max-w-xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col" style={{ maxHeight: '70vh' }}>
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search records, companies, drivers, SKUs…"
            className="flex-1 text-sm text-slate-800 placeholder:text-slate-400 outline-none bg-transparent"
          />
          <div className="flex items-center gap-2">
            <kbd className="hidden sm:inline-flex text-[10px] font-mono bg-slate-100 border border-slate-200 text-slate-500 px-1.5 py-0.5 rounded">Esc</kbd>
            <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded text-slate-400 cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Results */}
        <div className="overflow-y-auto flex-1" ref={listRef}>
          {q.length < 2 ? (
            <div className="py-10 text-center text-slate-400 text-sm">
              Type at least 2 characters to search
            </div>
          ) : total === 0 ? (
            <div className="py-10 text-center text-slate-400 text-sm">
              No results for "<span className="font-semibold text-slate-600">{query}</span>"
            </div>
          ) : (
            <div>
              {matchedRecords.length > 0 && (
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-4 py-2 bg-slate-50 border-b border-slate-100">
                    Delivery Records ({matchedRecords.length})
                  </p>
                  {matchedRecords.map(r => {
                    globalIdx++;
                    const idx = globalIdx;
                    const isActive = cursor === idx;
                    return (
                      <button
                        key={r.id}
                        data-result-item
                        onClick={() => openItem({ kind: 'record', data: r })}
                        className={`w-full text-left flex items-center gap-3 px-4 py-3 transition-all cursor-pointer border-b border-slate-50 ${
                          isActive ? 'bg-blue-50 border-l-2 border-l-[#0078C1]' : 'hover:bg-blue-50'
                        }`}
                      >
                        <Truck className="w-4 h-4 text-slate-300 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-xs text-slate-900">{r.id}</span>
                            <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[r.status] ?? 'bg-slate-300'}`} />
                            <span className="text-[10px] text-slate-500 truncate">{r.category}</span>
                          </div>
                          <p className="text-xs text-slate-600 font-semibold truncate">{r.company_name}</p>
                          <p className="text-[10px] text-slate-400">
                            {r.reference} · {r.delivery_date} · {r.driver || 'No driver'}
                          </p>
                        </div>
                        <ArrowRight className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                      </button>
                    );
                  })}
                </div>
              )}

              {matchedSkus.length > 0 && (
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-4 py-2 bg-slate-50 border-b border-slate-100">
                    SKU Master ({matchedSkus.length})
                  </p>
                  {matchedSkus.map(p => {
                    globalIdx++;
                    const idx = globalIdx;
                    const isActive = cursor === idx;
                    return (
                      <button
                        key={p.id}
                        data-result-item
                        onClick={() => openItem({ kind: 'sku', data: p })}
                        className={`w-full text-left flex items-center gap-3 px-4 py-3 transition-all cursor-pointer border-b border-slate-50 ${
                          isActive ? 'bg-blue-50 border-l-2 border-l-[#0078C1]' : 'hover:bg-blue-50'
                        }`}
                      >
                        <Package className="w-4 h-4 text-slate-300 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-xs text-slate-900">{p.sku_code}</span>
                            <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-bold">Cat {p.category}</span>
                          </div>
                          <p className="text-xs text-slate-600 truncate">{p.name}</p>
                          {p.inventory && (
                            <p className="text-[10px] text-slate-400">
                              On hand: {p.inventory.on_hand_qty} · ATP: {p.inventory.atp}
                            </p>
                          )}
                        </div>
                        <ArrowRight className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-4 py-2 border-t border-slate-100 text-[10px] text-slate-400 flex items-center gap-3">
          <span><kbd className="font-mono bg-slate-100 border border-slate-200 px-1 rounded">↑↓</kbd> navigate</span>
          <span><kbd className="font-mono bg-slate-100 border border-slate-200 px-1 rounded">Enter</kbd> open</span>
          <span><kbd className="font-mono bg-slate-100 border border-slate-200 px-1 rounded">Esc</kbd> close</span>
          <span className="ml-auto">{total > 0 ? `${total} result${total !== 1 ? 's' : ''}` : ''}</span>
        </div>
      </div>
    </div>
  );
}
