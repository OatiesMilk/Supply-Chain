import { MapPin, X } from 'lucide-react';
import { AREA_HIERARCHY } from '@/data';
import { canonicalCoverage, isSubregionName } from '@/utils/driverCoverage';

// Coverage is picked from AREA_HIERARCHY only (TSK-115): an exact Area, or a
// whole Subregion. Values not in the list (legacy free text) are flagged and
// must be removed before saving; the server rejects them too.
export function legacyCoverage(values: readonly string[]): string[] {
  return values.filter(v => canonicalCoverage(v) === null);
}

export default function CoveragePicker({ id, value, onChange, disabled = false }: {
  id: string;
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  const selected = new Set(value.map(v => v.toLowerCase()));
  const legacy = legacyCoverage(value);
  const add = (choice: string) => {
    if (!choice || selected.has(choice.toLowerCase())) return;
    // A whole Subregion makes its individual Areas redundant.
    const subregion = AREA_HIERARCHY.flatMap(r => r.subregions).find(s => s.name === choice);
    const covered = new Set(subregion?.areas.map(a => a.toLowerCase()) ?? []);
    onChange([...value.filter(v => !covered.has(v.toLowerCase())), choice]);
  };
  const remove = (item: string) => onChange(value.filter(v => v !== item));

  return (
    <div className="space-y-2">
      {value.length > 0 ? (
        <ul className="flex flex-wrap gap-1" aria-label="Selected coverage">
          {value.map(item => {
            const isLegacy = legacy.includes(item);
            const isSubregion = isSubregionName(item);
            return (
              <li key={item}
                className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] ${
                  isLegacy ? 'border-amber-300 bg-amber-50 text-amber-800'
                    : isSubregion ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
                    : 'border-blue-200 bg-blue-50 text-blue-700'}`}>
                <MapPin aria-hidden="true" className="h-2.5 w-2.5" />
                {item}{isSubregion && ' · whole subregion'}{isLegacy && ' · not in area list'}
                <button type="button" disabled={disabled} onClick={() => remove(item)}
                  aria-label={`Remove ${item}`} className="rounded hover:bg-black/5 disabled:opacity-50">
                  <X aria-hidden="true" className="h-3 w-3" />
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-[10px] italic text-slate-400">No areas assigned — this Driver appears under "Other drivers".</p>
      )}
      <select id={id} value="" disabled={disabled} onChange={e => add(e.target.value)}
        className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs focus:border-[#0078C1] focus:outline-none focus:ring-2 focus:ring-[#0078C1]/30">
        <option value="">Add an area or a whole subregion…</option>
        {AREA_HIERARCHY.map(region => (
          <optgroup key={region.region} label={region.region}>
            {region.subregions.flatMap(subregion => {
              const subregionTaken = selected.has(subregion.name.toLowerCase());
              return [
                <option key={subregion.name} value={subregion.name} disabled={subregionTaken}>
                  {subregion.name} — whole subregion
                </option>,
                ...subregion.areas.map(area => (
                  <option key={area} value={area} disabled={subregionTaken || selected.has(area.toLowerCase())}>
                    {'   '}{area}
                  </option>
                )),
              ];
            })}
          </optgroup>
        ))}
      </select>
      {legacy.length > 0 && (
        <p role="alert" className="text-[10px] text-amber-700">
          Replace the highlighted legacy values with areas from the list before saving.
        </p>
      )}
    </div>
  );
}
