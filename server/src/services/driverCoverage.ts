import { AREA_HIERARCHY, canonicalCoverage } from '../areaHierarchy';

// TSK-115: converts legacy free-text coverage keywords to canonical Area or
// Subregion names. Only this explicit table is used — no substring or fuzzy
// matching. A keyword maps to the exact Areas it named; it is widened to a whole
// Subregion only where the keyword itself names that Subregion.
const LEGACY_COVERAGE: Record<string, string[]> = {
  'makati': ['Makati CBD'],
  'bgc': ['BGC (Taguig)'],
  'taguig': ['BGC (Taguig)'],
  'pasig': ['Pasig - Kapitolyo', 'Ortigas Center (Pasig)'],
  'ortigas': ['Ortigas Center (Pasig)'],
  'quezon city': ['Quezon City - Fairview', 'Quezon City - Balintawak', 'Quezon City - Commonwealth', 'Quezon City - Diliman'],
  'qc': ['Quezon City - Fairview', 'Quezon City - Balintawak', 'Quezon City - Commonwealth', 'Quezon City - Diliman'],
  'manila': ['Manila - Binondo', 'Manila - Ermita', 'Manila - Malate'],
  'muntinlupa': ['Muntinlupa - Alabang'],
  'alabang': ['Muntinlupa - Alabang'],
  'cainta': ['Cainta (Rizal)'],
  'antipolo': ['Antipolo (Rizal)'],
  'rizal': ['Cainta (Rizal)', 'Antipolo (Rizal)'],
  'pampanga': ['Pampanga / Clark'],
  'clark': ['Clark Freeport Zone, Pampanga'],
  'zambales': ['Subic / Olongapo'],
  'subic': ['Subic Bay Freeport, Zambales'],
};

export interface CoveragePlan { coverage: string[]; unmapped: string[]; changed: boolean }

export function planCoverageMigration(values: readonly string[]): CoveragePlan {
  const coverage: string[] = [];
  const unmapped: string[] = [];
  for (const value of values) {
    const canonical = canonicalCoverage(value);
    const mapped = canonical ? [canonical] : LEGACY_COVERAGE[value.trim().toLowerCase()];
    if (mapped) coverage.push(...mapped);
    else unmapped.push(value);
  }
  // A whole Subregion makes its own Areas redundant.
  const covered = new Set(AREA_HIERARCHY.flatMap(r => r.subregions).filter(s => coverage.includes(s.name)).flatMap(s => s.areas));
  const unique = [...new Set(coverage)].filter(value => !covered.has(value));
  const changed = unmapped.length > 0 || unique.length !== values.length || unique.some((v, i) => v !== values[i]);
  return { coverage: unique, unmapped, changed };
}
