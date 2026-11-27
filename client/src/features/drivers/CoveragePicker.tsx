import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  autoUpdate,
  flip,
  offset,
  shift,
  size,
  FloatingFocusManager,
  FloatingPortal,
  useClick,
  useDismiss,
  useFloating,
  useInteractions,
  useRole,
} from '@floating-ui/react';
import { Check, ChevronDown, MapPin, Search, X } from 'lucide-react';
import { AREA_HIERARCHY } from '@/data';
import { canonicalCoverage, isSubregionName } from '@/utils/driverCoverage';

// Coverage is picked from AREA_HIERARCHY only (TSK-115): an exact Area, or a
// whole Subregion. Values not in the list (legacy free text) are flagged and
// must be removed before saving; the server rejects them too.
export function legacyCoverage(values: readonly string[]): string[] {
  return values.filter(v => canonicalCoverage(v) === null);
}

const REGION_SHORT_LABELS: Record<string, string> = {
  'Metro Manila (NCR)': 'Metro Manila',
  'Luzon — Central & North': 'Central & North',
  'Luzon — CALABARZON': 'CALABARZON',
  'Luzon — Zambales': 'Zambales',
  Visayas: 'Visayas',
  Mindanao: 'Mindanao',
};

export default function CoveragePicker({
  id,
  value,
  onChange,
  disabled = false,
}: {
  id: string;
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [activeRegion, setActiveRegion] = useState<string>('ALL');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const popoverId = useId();

  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: next => {
      if (disabled) return;
      setOpen(next);
      if (!next) setSearch('');
    },
    placement: 'bottom-start',
    strategy: 'fixed',
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(6),
      flip({ padding: 12 }),
      shift({ padding: 12, crossAxis: true }),
      size({
        padding: 12,
        apply({ availableWidth, availableHeight, elements }) {
          Object.assign(elements.floating.style, {
            width: `${Math.min(560, Math.max(280, availableWidth))}px`,
            maxHeight: `${Math.min(500, Math.max(240, availableHeight))}px`,
          });
        },
      }),
    ],
  });

  const { getReferenceProps, getFloatingProps } = useInteractions([
    useClick(context, { enabled: !disabled }),
    useDismiss(context),
    useRole(context, { role: 'dialog' }),
  ]);

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => searchInputRef.current?.focus({ preventScroll: true }));
    }
  }, [open]);

  const selected = useMemo(() => new Set(value.map(v => v.toLowerCase())), [value]);
  const legacy = useMemo(() => legacyCoverage(value), [value]);

  const toggleSubregion = (subregionName: string, areas: string[]) => {
    const lower = subregionName.toLowerCase();
    if (selected.has(lower)) {
      onChange(value.filter(v => v.toLowerCase() !== lower));
      return;
    }
    // A whole Subregion makes its individual Areas redundant.
    const covered = new Set(areas.map(a => a.toLowerCase()));
    onChange([...value.filter(v => !covered.has(v.toLowerCase())), subregionName]);
  };

  const toggleArea = (area: string) => {
    const lower = area.toLowerCase();
    if (selected.has(lower)) {
      onChange(value.filter(v => v.toLowerCase() !== lower));
    } else {
      onChange([...value, area]);
    }
  };

  const remove = (item: string) => onChange(value.filter(v => v !== item));

  const query = search.trim().toLowerCase();

  const visibleRegions = useMemo(() => {
    return AREA_HIERARCHY
      .filter(region => query || activeRegion === 'ALL' || region.region === activeRegion)
      .map(region => {
        if (!query) return region;
        const regionMatch = region.region.toLowerCase().includes(query);
        const subregions = region.subregions
          .map(sub => {
            const subMatch = regionMatch || sub.name.toLowerCase().includes(query);
            const areas = subMatch
              ? sub.areas
              : sub.areas.filter(area => area.toLowerCase().includes(query));
            return areas.length > 0 ? { ...sub, areas } : null;
          })
          .filter((s): s is NonNullable<typeof s> => s !== null);
        return subregions.length > 0 ? { ...region, subregions } : null;
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);
  }, [activeRegion, query]);

  return (
    <div>
      {/* Use flex gap instead of space-y-* because FloatingFocusManager injects
          an out-of-flow position:fixed focus-guard span right after the trigger
          button, which breaks :not(:last-child) margin selectors. */}
      <div className="flex flex-col gap-2">
        {value.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5" aria-label="Selected coverage">
            {value.map(item => {
              const isLegacy = legacy.includes(item);
              const isSubregion = isSubregionName(item);
              return (
                <li
                  key={item}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs font-medium ${
                    isLegacy
                      ? 'border-amber-300 bg-amber-50 text-amber-800'
                      : isSubregion
                        ? 'border-brand-blue/30 bg-brand-sky text-brand-navy'
                        : 'border-slate-200 bg-white text-slate-700 shadow-2xs'
                  }`}
                >
                  <MapPin aria-hidden="true" className="h-3 w-3 shrink-0 opacity-75" />
                  <span>{item}</span>
                  {isSubregion && (
                    <span className="rounded bg-brand-navy/10 px-1 py-0.5 text-xs font-semibold leading-none text-brand-navy">
                      All
                    </span>
                  )}
                  {isLegacy && <span className="text-xs text-amber-700">· not in area list</span>}
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => remove(item)}
                    aria-label={`Remove ${item}`}
                    className="ml-0.5 rounded p-0.5 text-current opacity-65 transition-opacity hover:bg-black/5 hover:opacity-100 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <X aria-hidden="true" className="h-3 w-3" />
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-xs italic text-slate-400">
            No areas assigned — this Driver appears under "Other drivers".
          </p>
        )}

        <button
          ref={refs.setReference}
          {...getReferenceProps()}
          id={id}
          type="button"
          disabled={disabled}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? popoverId : undefined}
          className="flex h-9 w-full max-w-[560px] items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 text-left text-xs font-medium text-slate-700 shadow-2xs transition-colors hover:border-slate-300 hover:bg-slate-50/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue cursor-pointer disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
        >
          <span className="flex min-w-0 items-center gap-2 truncate">
            <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
            <span className="truncate text-slate-600">
              {value.length > 0
                ? `Edit coverage areas (${value.length} selected)`
                : 'Add areas or subregions…'}
            </span>
          </span>
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-150 ${open ? 'rotate-180 text-brand-navy' : ''}`}
            aria-hidden="true"
          />
        </button>

        {legacy.length > 0 && (
          <p role="alert" className="text-xs text-amber-700">
            Replace the highlighted legacy values with areas from the list before saving.
          </p>
        )}
      </div>

      {open && (
        <FloatingPortal>
          <FloatingFocusManager context={context} modal={false} returnFocus>
            <div
              ref={refs.setFloating}
              style={floatingStyles}
              {...getFloatingProps()}
              id={popoverId}
              aria-label="Select driver coverage areas"
              className="z-50 flex flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-2xl"
            >
              {/* Search header */}
              <div className="border-b border-slate-100 p-3 space-y-2.5 shrink-0">
                <div className="relative">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
                    aria-hidden="true"
                  />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search region, subregion, or area…"
                    aria-label="Search coverage areas"
                    className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50/70 pl-8 pr-8 text-xs text-slate-800 placeholder:text-slate-400 transition-colors focus:border-brand-blue focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-blue/20"
                  />
                  {search && (
                    <button
                      type="button"
                      onClick={() => setSearch('')}
                      aria-label="Clear search"
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 cursor-pointer"
                    >
                      <X className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  )}
                </div>

                {/* Region filter tabs (shown when not searching) */}
                {!query && (
                  <div className="flex flex-wrap gap-1">
                    <button
                      type="button"
                      onClick={() => setActiveRegion('ALL')}
                      aria-pressed={activeRegion === 'ALL'}
                      className={`rounded-lg px-2 py-1 text-xs font-medium transition-colors cursor-pointer ${
                        activeRegion === 'ALL'
                          ? 'bg-brand-navy text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200/80 hover:text-slate-900'
                      }`}
                    >
                      All regions
                    </button>
                    {AREA_HIERARCHY.map(region => {
                      const active = activeRegion === region.region;
                      return (
                        <button
                          key={region.region}
                          type="button"
                          onClick={() => setActiveRegion(region.region)}
                          aria-pressed={active}
                          className={`rounded-lg px-2 py-1 text-xs font-medium transition-colors cursor-pointer ${
                            active
                              ? 'bg-brand-navy text-white'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200/80 hover:text-slate-900'
                          }`}
                        >
                          {REGION_SHORT_LABELS[region.region] ?? region.region}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Scrollable subregion & area list */}
              <div className="min-h-0 flex-1 overflow-y-auto p-3 space-y-3">
                {visibleRegions.length === 0 ? (
                  <div className="py-8 text-center">
                    <p className="text-xs font-semibold text-slate-700">No matching areas</p>
                    <p className="mt-1 text-xs text-slate-500">
                      Try another city, subregion, or region name.
                    </p>
                  </div>
                ) : (
                  visibleRegions.map(region => (
                    <div key={region.region} className="space-y-2">
                      {(activeRegion === 'ALL' || query) && (
                        <p className="px-1 text-xs font-semibold text-slate-500">
                          {region.region}
                        </p>
                      )}
                      {region.subregions.map(subregion => {
                        const subregionSelected = selected.has(subregion.name.toLowerCase());
                        return (
                          <div
                            key={subregion.name}
                            className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-2.5 space-y-2"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-semibold text-slate-800">
                                {subregion.name}
                              </span>
                              <button
                                type="button"
                                onClick={() => toggleSubregion(subregion.name, subregion.areas)}
                                aria-pressed={subregionSelected}
                                className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium transition-colors cursor-pointer ${
                                  subregionSelected
                                    ? 'border-brand-navy bg-brand-navy text-white'
                                    : 'border-slate-200 bg-white text-slate-600 hover:border-brand-blue/40 hover:bg-brand-sky/50 hover:text-brand-navy'
                                }`}
                              >
                                {subregionSelected && <Check className="h-3 w-3" aria-hidden="true" />}
                                Whole subregion
                              </button>
                            </div>

                            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                              {subregion.areas.map(area => {
                                const areaSelected = selected.has(area.toLowerCase());
                                const checked = subregionSelected || areaSelected;
                                return (
                                  <button
                                    key={area}
                                    type="button"
                                    disabled={subregionSelected}
                                    onClick={() => toggleArea(area)}
                                    aria-pressed={checked}
                                    className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-xs transition-colors ${
                                      subregionSelected
                                        ? 'border-slate-200/70 bg-white/60 text-slate-400 cursor-default'
                                        : areaSelected
                                          ? 'border-brand-blue/40 bg-brand-sky/70 text-brand-navy font-medium cursor-pointer'
                                          : 'border-slate-200/90 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50 cursor-pointer'
                                    }`}
                                  >
                                    <span
                                      aria-hidden="true"
                                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                                        subregionSelected
                                          ? 'border-slate-300 bg-slate-200 text-slate-500'
                                          : areaSelected
                                            ? 'border-brand-navy bg-brand-navy text-white'
                                            : 'border-slate-300 bg-white'
                                      }`}
                                    >
                                      {checked && <Check className="h-3 w-3" />}
                                    </span>
                                    <span className="truncate">{area}</span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between gap-2 border-t border-slate-100 bg-slate-50/70 px-3.5 py-2.5 shrink-0">
                <div className="flex items-center gap-3 text-xs">
                  <span className="font-medium text-slate-500 tabular-nums">
                    {value.length} selected
                  </span>
                  {value.length > 0 && (
                    <button
                      type="button"
                      onClick={() => onChange([])}
                      className="font-medium text-red-600 hover:text-red-700 cursor-pointer"
                    >
                      Clear all
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-lg bg-brand-navy px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-brand-blue cursor-pointer"
                >
                  Done
                </button>
              </div>
            </div>
          </FloatingFocusManager>
        </FloatingPortal>
      )}
    </div>
  );
}
