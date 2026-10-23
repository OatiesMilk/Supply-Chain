import { screenLabel } from '@/utils/navigationLabels';
import { useState, useEffect, useLayoutEffect, useRef, useCallback, useId } from 'react';
import { Search, X, Truck, Package, ArrowRight, Loader2 } from 'lucide-react';
import { DeliveryRecord } from '../types';
import { ApiSku, api } from '../api';
import { normalizeApiRecord } from '../api/queries/useRecordsQuery';

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
  const [serverRecords, setServerRecords] = useState<DeliveryRecord[]>([]);
  const [searching, setSearching] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const resultsId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Reset before the reopened dialog can receive input. A passive effect could
  // clear freshly typed text if the user (or Playwright) searched immediately.
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !isOpen) return;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setQuery('');
    setCursor(-1);
    setServerRecords([]);
    dialog.showModal();
    inputRef.current?.focus();
    return () => {
      if (dialog.open) dialog.close();
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
  }, [isOpen]);

  const q = query.toLowerCase().trim();

  useEffect(() => {
    if (q.length < 2) {
      setServerRecords([]);
      setSearching(false);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await api.getPagedRecords({ search: q, limit: 8, paged: true });
        if (!cancelled) {
          setServerRecords(res.rows.map(normalizeApiRecord));
        }
      } catch {
        if (!cancelled && deliveryRecords?.length) {
          const fallback = deliveryRecords.filter(r =>
            r.id.toLowerCase().includes(q) ||
            r.company_name.toLowerCase().includes(q) ||
            r.reference.toLowerCase().includes(q) ||
            (r.driver && r.driver.toLowerCase().includes(q)) ||
            r.account_manager.toLowerCase().includes(q) ||
            r.area.toLowerCase().includes(q)
          ).slice(0, 8);
          setServerRecords(fallback);
        }
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 150);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [q, deliveryRecords]);

  const matchedRecords = q.length < 2 ? [] : serverRecords;

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
    } else if (e.key === 'Enter' && cursor >= 0 && cursor < allResults.length) {
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

  if (!isOpen) return null;

  let globalIdx = -1;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onCancel={event => { event.preventDefault(); onClose(); }}
      onKeyDown={event => {
        if (event.key !== 'Tab') return;
        // Keep keyboard navigation inside the page modal rather than allowing
        // the native dialog's last Tab stop to move into browser chrome.
        const controls = event.currentTarget.querySelectorAll<HTMLElement>(
          'input:not([disabled]), button:not([disabled]):not([tabindex="-1"])',
        );
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }}
      className="mx-auto mt-[10dvh] w-[calc(100%-2rem)] max-w-xl rounded-2xl border-0 bg-transparent p-0 text-slate-900 backdrop:bg-slate-900/60 backdrop:backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white w-full max-w-xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col" style={{ maxHeight: '70vh' }}>
        <h2 id={titleId} className="sr-only">Search records and products</h2>
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            ref={inputRef}
            id="global-search-input"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={true}
            aria-label="Search records and products"
            aria-describedby={`${resultsId}-help`}
            aria-controls={resultsId}
            aria-activedescendant={cursor >= 0 && cursor < total ? `${resultsId}-${cursor}` : undefined}
            value={query}
            onChange={e => { setCursor(-1); setQuery(e.target.value); }}
            onKeyDown={handleKeyDown}
            placeholder="Search records, companies, drivers, SKUs…"
            className="min-h-11 min-w-0 flex-1 text-sm text-slate-800 placeholder:text-slate-400 outline-none bg-transparent"
          />
          <div className="flex items-center gap-2">
            {searching && <Loader2 className="w-3.5 h-3.5 animate-spin text-sky-500 shrink-0" />}
            <kbd className="hidden sm:inline-flex text-[10px] font-mono bg-slate-100 border border-slate-200 text-slate-500 px-1.5 py-0.5 rounded">Esc</kbd>
            <button type="button" aria-label="Close search" onClick={onClose} className="min-h-11 min-w-11 inline-flex items-center justify-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-700 p-1 hover:bg-slate-100 rounded text-slate-400 cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Results */}
        <div id={resultsId} role="listbox" aria-label="Search results" className="overflow-y-auto flex-1" ref={listRef}>
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
                        id={`${resultsId}-${idx}`}
                        data-result-item
                        role="option"
                        tabIndex={-1}
                        aria-selected={isActive}
                        onClick={() => openItem({ kind: 'record', data: r })}
                        className={`min-h-11 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-700 w-full text-left flex items-center gap-3 px-4 py-3 transition-all cursor-pointer border-b border-slate-50 ${
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
                    {screenLabel('inventory')} ({matchedSkus.length})
                  </p>
                  {matchedSkus.map(p => {
                    globalIdx++;
                    const idx = globalIdx;
                    const isActive = cursor === idx;
                    return (
                      <button
                        key={p.id}
                        id={`${resultsId}-${idx}`}
                        data-result-item
                        role="option"
                        tabIndex={-1}
                        aria-selected={isActive}
                        onClick={() => openItem({ kind: 'sku', data: p })}
                        className={`min-h-11 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-700 w-full text-left flex items-center gap-3 px-4 py-3 transition-all cursor-pointer border-b border-slate-50 ${
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

        <div id={`${resultsId}-help`} className="px-4 py-2 border-t border-slate-100 text-[10px] text-slate-400 flex items-center gap-3">
          <span><kbd className="font-mono bg-slate-100 border border-slate-200 px-1 rounded">↑↓</kbd> navigate</span>
          <span><kbd className="font-mono bg-slate-100 border border-slate-200 px-1 rounded">Enter</kbd> open</span>
          <span><kbd className="font-mono bg-slate-100 border border-slate-200 px-1 rounded">Esc</kbd> close</span>
          <span role="status" className="ml-auto">{total > 0 ? `${total} result${total !== 1 ? 's' : ''}` : ''}</span>
        </div>
      </div>
    </dialog>
  );
}
