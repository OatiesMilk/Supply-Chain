import { Product, InventoryItem, InventoryTransaction, Customer, DeliveryRecord, Supplier } from './types';

// Shared audit helper values for seed data
const SEED_CREATED_BY = 'M. Reyes (Sales Coordinator)';
const SEED_MODIFIED_BY = 'M. Reyes (Sales Coordinator)';

// --- Reference option lists used across the delivery record form, driver view, and dashboard ---

export type AreaSubregion = { name: string; areas: string[] };
export type AreaRegion    = { region: string; subregions: AreaSubregion[] };

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

// Flat list derived from hierarchy — keeps import sites unchanged
export const AREAS: string[] = AREA_HIERARCHY.flatMap(r => r.subregions.flatMap(s => s.areas));

export function getSubregion(area: string): string | null {
  for (const r of AREA_HIERARCHY)
    for (const s of r.subregions)
      if (s.areas.includes(area)) return s.name;
  return null;
}

export function getRegion(area: string): string | null {
  for (const r of AREA_HIERARCHY)
    for (const s of r.subregions)
      if (s.areas.includes(area)) return r.region;
  return null;
}

// Returns all other areas in the same subregion (excludes the given area itself)
export function getNearbyAreas(area: string): string[] {
  for (const r of AREA_HIERARCHY)
    for (const s of r.subregions)
      if (s.areas.includes(area)) return s.areas.filter(a => a !== area);
  return [];
}
export const VEHICLES = ['(None)', 'Truck-A (6-Wheeler)', 'Truck-B (10-Wheeler)', 'Van-01 (L300)', 'Motorcycle-01 (Express)'];
export const PRIORITIES = ['1 - Low', '2 - Moderate', '3 - High'] as const;
export const ITEM_TYPES = ['Small Item', 'Medium Item', 'Large / Pallet'] as const;
export const RMA_ITEM_TYPES = ['Small Item', 'Unit'] as const;
export const DELIVERY_STATUSES = ['Draft', 'Scheduled', 'In Transit', 'Delivered', 'On-Hold', 'Rescheduled', 'Pending'] as const;

// Accounting Collection displays collection-domain vocabulary in its UI while
// the underlying DeliveryStatus value stays the same shared enum used by
// Deliveries/RMA/Procurement Pick-up/Sales Orders (Scheduled/Delivered/
// On-Hold/Rescheduled/Pending) — only the label shown to the user differs
// for Accounting Collection records. This keeps status transitions, output
// action triggers, and server-side STATUS_TO_DB mapping untouched.
export function acStatusLabel(status: string): string {
  if (status === 'Delivered') return 'Collected';
  if (status === 'Pending') return 'Awaiting Collection';
  return status;
}
export const CATEGORIES = ['Sales Orders', 'Deliveries', 'RMA', 'Accounting Collection', 'Procurement Pick-up'] as const;

// ── Managed driver store ─────────────────────────────────────────────────────
// These mutable arrays are populated from the /api/v1/drivers endpoint at startup
// (see App.tsx → setManagedDriverList). Components that import DRIVERS,
// DRIVER_ASSISTANTS, and DRIVER_COVERAGE get the live managed list.
// Assignment options remain empty until the API provides the roster.

let _managedDrivers: string[] = [];
let _managedDriverIds: Record<string, string> = {};
let _managedAssistants: string[] = [];
let _managedCoverage: Record<string, string[]> = {};
let managedDriverVersion = 0;
const managedDriverListeners = new Set<() => void>();
export const getManagedDriverVersion = () => managedDriverVersion;
export function subscribeManagedDrivers(listener: () => void) {
  managedDriverListeners.add(listener);
  return () => { managedDriverListeners.delete(listener); };
}

export interface ManagedDriver {
  id: string;
  name: string;
  type: 'DRIVER' | 'ASSISTANT';
  coverage_areas: string[];
  is_active: boolean;
}

// Assignments save the Driver profile id; the roster keeps names unique per
// type, so the name shown in a dropdown maps to exactly one active profile.
export function driverIdForName(name: string): string | null {
  return _managedDriverIds[name] ?? null;
}

export function setManagedDriverList(list: ManagedDriver[]) {
  const active = list.filter(d => d.is_active);
  _managedDrivers = active.filter(d => d.type === 'DRIVER').map(d => d.name);
  _managedDriverIds = Object.fromEntries(active.filter(d => d.type === 'DRIVER').map(d => [d.name, d.id]));
  _managedAssistants = active.filter(d => d.type === 'ASSISTANT').map(d => d.name);
  const cov: Record<string, string[]> = {};
  for (const d of active) {
    if (d.coverage_areas.length > 0) cov[d.name] = d.coverage_areas;
  }
  _managedCoverage = cov;
  managedDriverVersion++;
  managedDriverListeners.forEach(listener => listener());
}

function createArrayProxy(getSrc: () => string[]): string[] {
  return new Proxy([] as string[], {
    get(_, prop, receiver) {
      const src = getSrc();
      const val = Reflect.get(src, prop, receiver === _ ? src : receiver);
      if (typeof val === 'function') {
        return val.bind(src);
      }
      return val;
    },
    has(_, prop) {
      return Reflect.has(getSrc(), prop);
    },
    ownKeys(_) {
      return Reflect.ownKeys(getSrc());
    },
    getOwnPropertyDescriptor(_, prop) {
      return Object.getOwnPropertyDescriptor(getSrc(), prop);
    },
  });
}

export const DRIVERS: string[] = createArrayProxy(() => _managedDrivers);
export const DRIVER_ASSISTANTS: string[] = createArrayProxy(() => _managedAssistants);

export const DRIVER_COVERAGE: Record<string, string[]> = new Proxy({} as Record<string, string[]>, {
  get(_, prop) {
    const src = _managedCoverage;
    return Reflect.get(src, prop);
  },
  ownKeys() {
    return Reflect.ownKeys(_managedCoverage);
  },
  getOwnPropertyDescriptor(_, prop) {
    const src = _managedCoverage;
    if (prop in src) return { configurable: true, enumerable: true, value: (src as any)[prop] };
    return undefined;
  },
  has(_, prop) {
    return prop in (_managedCoverage);
  },
});

// Proximity clusters — derived from AREA_HIERARCHY (subregion name → areas)
export const AREA_CLUSTERS: Record<string, string[]> = Object.fromEntries(
  AREA_HIERARCHY.flatMap(r => r.subregions.map(s => [s.name, s.areas]))
);

export const DRIVER_COVERAGE_AREAS: Record<string, string[]> = new Proxy({} as Record<string, string[]>, {
  get(_, prop) {
    const src = _managedCoverage;
    return Reflect.get(src, prop);
  },
  ownKeys() {
    return Reflect.ownKeys(_managedCoverage);
  },
  getOwnPropertyDescriptor(_, prop) {
    const src = _managedCoverage;
    if (prop in src) return { configurable: true, enumerable: true, value: (src as any)[prop] };
    return undefined;
  },
  has(_, prop) {
    return prop in (_managedCoverage);
  },
});

// 1. Products (POS Hardware & Accessories - 20 items)
export const initialProducts: Product[] = [];

// 2. Initial Inventory Mapped to Products (At least 20 items, low stock examples included)
export const initialInventory: InventoryItem[] = [];

// 3. Initial Inventory Transactions (Historic audit log - 22 records)
export const initialTransactions: InventoryTransaction[] = [];

// 4. Customers (Realistic Manila-based retail & F&B chains)
export const initialCustomers: Customer[] = [];

// 5. Delivery Records — the ONE unified list, filtered by `category` to power
//    Deliveries / RMA / Accounting Collection / Procurement Pick-up / Sales Orders screens.
export const initialDeliveryRecords: DeliveryRecord[] = [];

// ─── Supplier Master (seed data) ─────────────────────────────────────────────

export const initialSuppliers: Supplier[] = [];
