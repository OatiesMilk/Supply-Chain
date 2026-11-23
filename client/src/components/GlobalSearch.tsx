import { useState, useEffect, useId, useRef, useCallback } from 'react';
import { Search, X, Truck, Package, ArrowRight, Loader2, Users, UserRound, LayoutGrid } from 'lucide-react';
import { DeliveryRecord } from '../types';
import { ApiCustomer, ApiDriver, ApiSku, ApiSupplier, api } from '../api';
import { normalizeApiRecord } from '../api/queries/useRecordsQuery';
import { DATA_SAMPLER_ENABLED } from '../utils/developmentTools';
import { recordLabel } from '../utils/recordLabel';
import { statusDotClass } from '../utils/statusTheme';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  deliveryRecords: DeliveryRecord[];
  customers?: ApiCustomer[];
  suppliers?: ApiSupplier[];
  drivers?: ApiDriver[];
  products: ApiSku[];
  accessibleScreens?: ReadonlySet<string>;
  onNavigate: (screen: string, item_id?: string) => void;
}

const GLOBAL_SEARCH_SCREEN_LABELS = {
  main: 'All Records', dashboard: 'Dashboard', deliveries: 'Deliveries', rma: 'RMA',
  accounting_collection: 'Accounting Collection', procurement_pickup: 'Procurement Pick-up',
  sales_orders: 'Sales Orders', customers: 'Customers', suppliers: 'Suppliers',
  driver: 'Drivers', driver_manager: 'Driver Manager', calendar: 'Delivery Calendar',
  driver_board: 'Driver Board', am_directory: 'Account Managers', transactions: 'Transaction Center',
  inventory: 'Products / SKU Master', statistical_reports: 'Statistical Reports',
  driver_dashboard: 'Driver Dashboard', data_sampler: 'Data Sampler', admin: 'Admin Panel',
} as const;

export function matchesGlobalQuery(query: string, ...values: Array<string | null | undefined>): boolean {
  const normalized = query.trim().toLowerCase();
  return normalized.length >= 2 && values.some(value => value?.toLowerCase().includes(normalized));
}

export function findGlobalSearchScreens(query: string, accessibleScreens: ReadonlySet<string>) {
  return Object.entries(GLOBAL_SEARCH_SCREEN_LABELS)
    .filter(([screen, label]) => (screen !== 'data_sampler' || DATA_SAMPLER_ENABLED) && accessibleScreens.has(screen) && matchesGlobalQuery(query, label))
    .map(([screen, label]) => ({ screen, label }));
}

const CATEGORY_SCREEN: Record<string, string> = {
  'Deliveries': 'deliveries',
  'RMA': 'rma',
  'Accounting Collection': 'accounting_collection',
  'Procurement Pick-up': 'procurement_pickup',
  'Sales Orders': 'sales_orders'
};

export default function GlobalSearch({
  isOpen, onClose, deliveryRecords, customers = [], suppliers = [], drivers = [], products,
  accessibleScreens = new Set<string>(), onNavigate,
}: Props) {
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(-1);
  const [serverRecords, setServerRecords] = useState<DeliveryRecord[]>([]);
  const [searching, setSearching] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const navigatedRef = useRef(false);
  const listboxId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
      navigatedRef.current = false;
      previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setQuery('');
      setCursor(-1);
      setServerRecords([]);
      if (!dialog.open) {
        if (typeof dialog.showModal === 'function') dialog.showModal();
        else dialog.setAttribute('open', '');
      }
      requestAnimationFrame(() => inputRef.current?.focus());
    } else if (dialog.open) {
      if (typeof dialog.close === 'function') dialog.close();
      else dialog.removeAttribute('open');
      if (!navigatedRef.current) {
        const target = previousFocusRef.current?.isConnected
          ? previousFocusRef.current
          : document.getElementById('global-search-button');
        requestAnimationFrame(() => {
          if (target instanceof HTMLElement) target.focus();
        });
      }
    }

    return () => {
      if (dialog.open && typeof dialog.close === 'function') dialog.close();
    };
  }, [isOpen]);

  const q = query.toLowerCase().trim();
  const canSearchRecords = Object.values(CATEGORY_SCREEN).some(screen => accessibleScreens.has(screen));

  useEffect(() => {
    if (!isOpen || q.length < 2 || !canSearchRecords) {
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
  }, [isOpen, q, deliveryRecords, canSearchRecords]);

  const matchedRecords = q.length < 2 ? [] : serverRecords.filter(record =>
    accessibleScreens.has(CATEGORY_SCREEN[record.category] ?? 'deliveries')
  );

  const matchedCustomers = customers.filter(customer => matchesGlobalQuery(
    q, customer.id, customer.name, customer.contact_person, customer.email,
    customer.phone, customer.address, customer.city,
  )).slice(0, 5);
  const matchedSuppliers = suppliers.filter(supplier => matchesGlobalQuery(
    q, supplier.id, supplier.name, supplier.contact_person, supplier.email,
    supplier.phone, supplier.address, supplier.city,
  )).slice(0, 5);
  const matchedDrivers = drivers.filter(driver => matchesGlobalQuery(
    q, driver.id, driver.name, ...driver.coverage_areas,
  )).slice(0, 5);
  const matchedScreens = findGlobalSearchScreens(q, accessibleScreens);

  const matchedSkus = products.filter(p => matchesGlobalQuery(
    q, p.id, p.sku_code, p.name, p.description, p.category,
    p.inventory?.warehouse_location,
  )).slice(0, 5);

  const total = matchedScreens.length + matchedRecords.length + matchedCustomers.length
    + matchedSuppliers.length + matchedDrivers.length + matchedSkus.length;

  // Flat list of all results for keyboard nav
  type ResultItem =
    | { kind: 'record'; data: DeliveryRecord }
    | { kind: 'customer'; data: ApiCustomer }
    | { kind: 'supplier'; data: ApiSupplier }
    | { kind: 'driver'; data: ApiDriver }
    | { kind: 'sku'; data: ApiSku }
    | { kind: 'screen'; data: { screen: string; label: string } };

  const allResults: ResultItem[] = [
    ...matchedScreens.map(data => ({ kind: 'screen' as const, data })),
    ...matchedRecords.map(r => ({ kind: 'record' as const, data: r })),
    ...matchedCustomers.map(data => ({ kind: 'customer' as const, data })),
    ...matchedSuppliers.map(data => ({ kind: 'supplier' as const, data })),
    ...matchedDrivers.map(data => ({ kind: 'driver' as const, data })),
    ...matchedSkus.map(p => ({ kind: 'sku' as const, data: p }))
  ];

  const driverScreen = ['driver_manager', 'driver', 'driver_board'].find(screen => accessibleScreens.has(screen)) ?? 'driver';

  const openItem = useCallback((item: ResultItem) => {
    navigatedRef.current = true;
    if (item.kind === 'screen') {
      onNavigate(item.data.screen);
    } else if (item.kind === 'record') {
      onNavigate(CATEGORY_SCREEN[item.data.category] ?? 'deliveries', item.data.id);
    } else if (item.kind === 'customer') {
      onNavigate('customers', item.data.id);
    } else if (item.kind === 'supplier') {
      onNavigate('suppliers', item.data.id);
    } else if (item.kind === 'driver') {
      onNavigate(driverScreen, item.data.id);
    } else {
      onNavigate('inventory', item.data.id);
    }
    onClose();
  }, [driverScreen, onNavigate, onClose]);

  const handleKeyDown = (e: { key: string; preventDefault: () => void }) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }
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
    items[cursor]?.scrollIntoView?.({ block: 'nearest' });
  }, [cursor]);

  const optionId = (index: number) => `${listboxId}-option-${index}`;
  const activeDescendant = cursor >= 0 && cursor < allResults.length ? optionId(cursor) : undefined;

  let globalIdx = -1;
  const renderSimpleResult = (
    item: ResultItem,
    title: string,
    detail: string,
    Icon: typeof Users,
  ) => {
    globalIdx++;
    const idx = globalIdx;
    const isActive = cursor === idx;
    const resultId = item.kind === 'screen' ? item.data.screen : item.data.id;
    return (
      <button
        key={`${item.kind}-${resultId}`}
        id={optionId(idx)}
        type="button"
        role="option"
        aria-selected={isActive}
        data-result-item
        onClick={() => openItem(item)}
        className={`w-full text-left flex items-center gap-3 px-4 py-3 transition-all cursor-pointer border-b border-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-brand-blue ${
          isActive ? 'bg-blue-50 border-l-2 border-l-brand-blue' : 'hover:bg-blue-50'
        }`}
      >
        <Icon className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <p className="text-xs text-slate-800 font-semibold truncate">{title}</p>
          <p className="text-xs text-slate-500 truncate">{detail}</p>
        </div>
        <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />
      </button>
    );
  };

  return (
    <dialog
      ref={dialogRef}
      aria-label="Global search"
      onCancel={e => { e.preventDefault(); onClose(); }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      className="mx-auto mt-[10vh] mb-auto w-[calc(100%-2rem)] max-w-xl rounded-2xl border border-slate-200 bg-white p-0 text-slate-800 shadow-2xl overflow-hidden backdrop:bg-slate-900/60 backdrop:backdrop-blur-sm"
    >
      {isOpen && (
        <div className="flex flex-col" style={{ maxHeight: '70vh' }}>
          {/* Search input */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200">
            <Search className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true" />
            <input
              ref={inputRef}
              role="combobox"
              aria-label="Global search"
              aria-expanded={total > 0}
              aria-controls={listboxId}
              aria-activedescendant={activeDescendant}
              aria-autocomplete="list"
              value={query}
              onChange={e => { setCursor(-1); setQuery(e.target.value); }}
              onKeyDown={handleKeyDown}
              placeholder="Search records, companies, drivers, SKUs…"
              className="flex-1 text-sm text-slate-800 placeholder:text-slate-400 outline-none bg-transparent"
            />
            <div className="flex items-center gap-2">
              {searching && <Loader2 className="w-3.5 h-3.5 animate-spin text-brand-blue shrink-0" aria-hidden="true" />}
              <kbd className="hidden sm:inline-flex text-xs font-medium bg-slate-100 border border-slate-200 text-slate-500 px-1.5 py-0.5 rounded">Esc</kbd>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close global search"
                className="p-1 hover:bg-slate-100 rounded text-slate-500 hover:text-slate-800 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          </div>

          {/* Results */}
          <div className="overflow-y-auto flex-1" ref={listRef} id={listboxId} role="listbox" aria-label="Search results">
            {q.length < 2 ? (
              <div className="py-10 text-center text-slate-500 text-sm">
                Type at least 2 characters to search
              </div>
            ) : total === 0 ? (
              <div className="py-10 text-center text-slate-500 text-sm">
                No results for "<span className="font-semibold text-slate-700">{query}</span>"
              </div>
            ) : (
              <div>
                {matchedScreens.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide px-4 py-2 bg-slate-50 border-b border-slate-100">
                      Pages ({matchedScreens.length})
                    </p>
                    {matchedScreens.map(page => renderSimpleResult(
                      { kind: 'screen', data: page }, page.label, 'Open accessible module', LayoutGrid,
                    ))}
                  </div>
                )}

                {matchedRecords.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide px-4 py-2 bg-slate-50 border-b border-slate-100">
                      Delivery Records ({matchedRecords.length})
                    </p>
                    {matchedRecords.map(r => {
                      globalIdx++;
                      const idx = globalIdx;
                      const isActive = cursor === idx;
                      return (
                        <button
                          key={r.id}
                          id={optionId(idx)}
                          type="button"
                          role="option"
                          aria-selected={isActive}
                          data-result-item
                          onClick={() => openItem({ kind: 'record', data: r })}
                          className={`w-full text-left flex items-center gap-3 px-4 py-3 transition-all cursor-pointer border-b border-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-brand-blue ${
                            isActive ? 'bg-blue-50 border-l-2 border-l-brand-blue' : 'hover:bg-blue-50'
                          }`}
                        >
                          <Truck className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="tabular-nums font-semibold text-xs text-slate-900">{recordLabel(r)}</span>
                              <span className={`w-2 h-2 rounded-full shrink-0 ${statusDotClass(r.status)}`} />
                              <span className="text-xs text-slate-600 truncate">{r.category}</span>
                            </div>
                            <p className="text-xs text-slate-700 font-semibold truncate">{r.company_name}</p>
                            <p className="text-xs text-slate-500">
                              {r.reference} · {r.delivery_date} · {r.driver || 'No driver'}
                            </p>
                          </div>
                          <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />
                        </button>
                      );
                    })}
                  </div>
                )}

                {matchedCustomers.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide px-4 py-2 bg-slate-50 border-b border-slate-100">
                      Customers ({matchedCustomers.length})
                    </p>
                    {matchedCustomers.map(customer => renderSimpleResult(
                      { kind: 'customer', data: customer }, customer.name,
                      `${customer.contact_person || 'No contact person'} · ${customer.city || 'No city'}`, Users,
                    ))}
                  </div>
                )}

                {matchedSuppliers.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide px-4 py-2 bg-slate-50 border-b border-slate-100">
                      Suppliers ({matchedSuppliers.length})
                    </p>
                    {matchedSuppliers.map(supplier => renderSimpleResult(
                      { kind: 'supplier', data: supplier }, supplier.name,
                      `${supplier.contact_person || 'No contact person'} · ${supplier.city || 'No city'}`, Package,
                    ))}
                  </div>
                )}

                {matchedDrivers.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide px-4 py-2 bg-slate-50 border-b border-slate-100">
                      Drivers ({matchedDrivers.length})
                    </p>
                    {matchedDrivers.map(driver => renderSimpleResult(
                      { kind: 'driver', data: driver }, driver.name,
                      driver.type === 'DRIVER' ? 'Driver' : 'Driver assistant', UserRound,
                    ))}
                  </div>
                )}

                {matchedSkus.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide px-4 py-2 bg-slate-50 border-b border-slate-100">
                      SKU Master ({matchedSkus.length})
                    </p>
                    {matchedSkus.map(p => {
                      globalIdx++;
                      const idx = globalIdx;
                      const isActive = cursor === idx;
                      return (
                        <button
                          key={p.id}
                          id={optionId(idx)}
                          type="button"
                          role="option"
                          aria-selected={isActive}
                          data-result-item
                          onClick={() => openItem({ kind: 'sku', data: p })}
                          className={`w-full text-left flex items-center gap-3 px-4 py-3 transition-all cursor-pointer border-b border-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-brand-blue ${
                            isActive ? 'bg-blue-50 border-l-2 border-l-brand-blue' : 'hover:bg-blue-50'
                          }`}
                        >
                          <Package className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="tabular-nums font-semibold text-xs text-slate-900">{p.sku_code}</span>
                              <span className="text-xs bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded font-semibold">Cat {p.category}</span>
                            </div>
                            <p className="text-xs text-slate-700 truncate">{p.name}</p>
                            {p.inventory && (
                              <p className="text-xs text-slate-500">
                                On hand: {p.inventory.on_hand_qty} · ATP: {p.inventory.atp}
                              </p>
                            )}
                          </div>
                          <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50/70 text-xs text-slate-500 flex items-center gap-3">
            <span><kbd className="font-medium bg-white border border-slate-200 px-1.5 py-0.5 rounded text-slate-600 shadow-2xs">↑↓</kbd> navigate</span>
            <span><kbd className="font-medium bg-white border border-slate-200 px-1.5 py-0.5 rounded text-slate-600 shadow-2xs">Enter</kbd> open</span>
            <span><kbd className="font-medium bg-white border border-slate-200 px-1.5 py-0.5 rounded text-slate-600 shadow-2xs">Esc</kbd> close</span>
            <span className="ml-auto tabular-nums">{total > 0 ? `${total} result${total !== 1 ? 's' : ''}` : ''}</span>
          </div>
        </div>
      )}
    </dialog>
  );
}
