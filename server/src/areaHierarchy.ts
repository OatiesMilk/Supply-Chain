// Canonical Region → Subregion → Area list used to validate Driver coverage
// (TSK-115). Keep identical to AREA_HIERARCHY in client/src/data.ts —
// server/tests/driverCoverage.test.ts fails if the two copies drift.

export type AreaSubregion = { name: string; areas: string[] };
export type AreaRegion = { region: string; subregions: AreaSubregion[] };

export const AREA_HIERARCHY: AreaRegion[] = [
  {
    region: 'Metro Manila (NCR)',
    subregions: [
      { name: 'South Manila Belt',   areas: ['Makati CBD', 'BGC (Taguig)', 'Pasay', 'Parañaque', 'Las Piñas', 'Muntinlupa - Alabang'] },
      { name: 'Ortigas Corridor',    areas: ['Mandaluyong', 'Ortigas Center (Pasig)', 'San Juan', 'Pasig - Kapitolyo'] },
      { name: 'North QC',            areas: ['Quezon City - Fairview', 'Quezon City - Balintawak', 'Quezon City - Commonwealth'] },
      { name: 'Central QC / Manila', areas: ['Quezon City - Diliman', 'Manila - Binondo', 'Manila - Ermita', 'Manila - Malate'] },
      { name: 'East Metro',          areas: ['Marikina', 'Cainta (Rizal)', 'Antipolo (Rizal)'] },
      { name: 'North Metro',         areas: ['Caloocan', 'Valenzuela', 'Malabon'] },
    ],
  },
  {
    region: 'Luzon — Central & North',
    subregions: [
      { name: 'Pampanga / Clark',                    areas: ['Angeles City, Pampanga', 'Clark Freeport Zone, Pampanga', 'San Fernando, Pampanga'] },
      { name: 'Bulacan',                              areas: ['Malolos, Bulacan', 'San Jose del Monte, Bulacan'] },
      { name: 'Nueva Ecija / Pangasinan / Benguet',  areas: ['Cabanatuan City, Nueva Ecija', 'Dagupan City, Pangasinan', 'Baguio City, Benguet'] },
    ],
  },
  {
    region: 'Luzon — CALABARZON',
    subregions: [
      { name: 'Cavite',   areas: ['Bacoor, Cavite', 'Imus, Cavite', 'Dasmariñas, Cavite'] },
      { name: 'Laguna',   areas: ['Sta. Rosa, Laguna', 'Biñan, Laguna'] },
      { name: 'Batangas', areas: ['Batangas City', 'Lipa City, Batangas'] },
    ],
  },
  {
    region: 'Luzon — Zambales',
    subregions: [
      { name: 'Subic / Olongapo', areas: ['Subic Bay Freeport, Zambales', 'Olongapo City, Zambales'] },
    ],
  },
  {
    region: 'Visayas',
    subregions: [
      { name: 'Cebu',                      areas: ['Cebu City', 'Mandaue City, Cebu', 'Lapu-Lapu City, Cebu'] },
      { name: 'Western / Eastern Visayas', areas: ['Iloilo City', 'Bacolod City', 'Tacloban City, Leyte'] },
    ],
  },
  {
    region: 'Mindanao',
    subregions: [
      { name: 'Northern Mindanao', areas: ['Cagayan de Oro City', 'Iligan City'] },
      { name: 'Southern Mindanao', areas: ['Davao City', 'General Santos City'] },
      { name: 'Western Mindanao',  areas: ['Zamboanga City'] },
    ],
  },
];

const key = (value: string) => value.trim().toLowerCase();
const CANONICAL = new Map<string, string>(
  AREA_HIERARCHY.flatMap(r => r.subregions.flatMap(s => [[key(s.name), s.name] as const, ...s.areas.map(a => [key(a), a] as const)])),
);

/** Canonical spelling of an Area or Subregion name, or null when it is not in the list. */
export function canonicalCoverage(value: string): string | null {
  return CANONICAL.get(key(value)) ?? null;
}

export function areasForLocation(region?: string, subregion?: string): string[] | null {
  const matchingRegions = region
    ? AREA_HIERARCHY.filter(item => item.region === region)
    : AREA_HIERARCHY;
  if (region && matchingRegions.length === 0) return null;

  const matchingSubregions = matchingRegions.flatMap(item => item.subregions)
    .filter(item => !subregion || item.name === subregion);
  if (subregion && matchingSubregions.length === 0) return null;

  return matchingSubregions.flatMap(item => item.areas);
}
