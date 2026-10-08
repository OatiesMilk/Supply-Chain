import { AREA_HIERARCHY } from '../data';

// Driver coverage (TSK-115). Coverage values are canonical names from
// AREA_HIERARCHY: an exact Area (covers that Area only) or a Subregion (covers
// every Area inside it). Matching is exact and case-insensitive — never
// substring — and one covered Area never implies its whole Subregion.
// Coverage ranks Drivers for Logistics; it never blocks assigning one.

export type CoverageMatch = 'area' | 'subregion';

const key = (value: string) => value.trim().toLowerCase();

const SUBREGION_OF_AREA = new Map<string, string>(
  AREA_HIERARCHY.flatMap(r => r.subregions.flatMap(s => s.areas.map(a => [key(a), s.name] as const))),
);
const SUBREGIONS = new Map<string, string>(
  AREA_HIERARCHY.flatMap(r => r.subregions.map(s => [key(s.name), s.name] as const)),
);
const AREA_NAMES = new Map<string, string>(
  AREA_HIERARCHY.flatMap(r => r.subregions.flatMap(s => s.areas.map(a => [key(a), a] as const))),
);

/** Canonical spelling of an Area or Subregion name, or null when it is not in AREA_HIERARCHY. */
export function canonicalCoverage(value: string): string | null {
  return AREA_NAMES.get(key(value)) ?? SUBREGIONS.get(key(value)) ?? null;
}

export function isSubregionName(value: string): boolean {
  return SUBREGIONS.has(key(value));
}

export function driverCoverageMatch(coverage: readonly string[], recordArea: string): CoverageMatch | null {
  const area = key(recordArea ?? '');
  if (!area) return null;
  const covered = new Set(coverage.map(key));
  if (AREA_NAMES.has(area) && covered.has(area)) return 'area';
  const subregion = SUBREGION_OF_AREA.get(area) ?? SUBREGIONS.get(area);
  if (subregion && covered.has(key(subregion))) return 'subregion';
  return null;
}

/** Splits Drivers into dropdown groups: exact Area, explicit Subregion, then everyone else. */
export function rankDriversByCoverage(
  drivers: readonly string[],
  coverageOf: (driver: string) => readonly string[] | undefined,
  recordArea: string,
): { area: string[]; subregion: string[]; other: string[]; subregionName: string | null } {
  const groups = { area: [] as string[], subregion: [] as string[], other: [] as string[] };
  for (const driver of drivers) {
    const match = driverCoverageMatch(coverageOf(driver) ?? [], recordArea);
    groups[match ?? 'other'].push(driver);
  }
  const area = key(recordArea ?? '');
  return { ...groups, subregionName: SUBREGION_OF_AREA.get(area) ?? SUBREGIONS.get(area) ?? null };
}
