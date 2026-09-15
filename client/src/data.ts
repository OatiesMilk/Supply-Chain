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
export const DELIVERY_STATUSES = ['Scheduled', 'Delivered', 'On-Hold', 'Rescheduled', 'Pending'] as const;

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
export const ACCOUNT_MANAGERS = ['P. Soriano', 'D. Macaraeg', 'F. Valenzuela', 'R. Pagkalinawan', 'M. Reyes', 'A. Santos', 'C. Lim'];

// ── Managed driver store ─────────────────────────────────────────────────────
// These mutable arrays are populated from the /api/drivers endpoint at startup
// (see App.tsx → setManagedDriverList). Components that import DRIVERS,
// DRIVER_ASSISTANTS, and DRIVER_COVERAGE get the live managed list.
// Hardcoded defaults serve as fallback only when the API hasn't responded yet.

const _DEFAULT_DRIVERS = ['Lando Navarro', 'Manny Santos', 'Ronald de la Cruz'];
const _DEFAULT_ASSISTANTS = ['Jayson Reyes', 'Bong Alvarez', 'Ricky Mendoza'];
const _DEFAULT_COVERAGE: Record<string, string[]> = {
  'Lando Navarro':      ['Makati', 'BGC', 'Taguig', 'Mandaluyong', 'San Juan', 'Pasig', 'Ortigas'],
  'Manny Santos':       ['Quezon City', 'Marikina', 'Caloocan', 'Valenzuela', 'Malabon', 'Bulacan', 'Cainta', 'Antipolo'],
  'Ronald de la Cruz':  ['Manila', 'Parañaque', 'Pasay', 'Las Piñas', 'Muntinlupa', 'Cavite', 'Laguna', 'Batangas'],
};
const _DEFAULT_COVERAGE_AREAS: Record<string, string[]> = {
  'Lando Navarro':     ['North QC', 'Central QC / Manila', 'North Metro'],
  'Manny Santos':      ['South Manila Belt', 'Ortigas Corridor'],
  'Ronald de la Cruz': ['East Metro', 'Ortigas Corridor'],
};

let _managedDrivers: string[] | null = null;
let _managedAssistants: string[] | null = null;
let _managedCoverage: Record<string, string[]> | null = null;

export interface ManagedDriver {
  name: string;
  type: 'DRIVER' | 'ASSISTANT';
  coverage_areas: string[];
  is_active: boolean;
}

export function setManagedDriverList(list: ManagedDriver[]) {
  const active = list.filter(d => d.is_active);
  _managedDrivers = active.filter(d => d.type === 'DRIVER').map(d => d.name);
  _managedAssistants = active.filter(d => d.type === 'ASSISTANT').map(d => d.name);
  const cov: Record<string, string[]> = {};
  for (const d of active) {
    if (d.coverage_areas.length > 0) cov[d.name] = d.coverage_areas;
  }
  _managedCoverage = cov;
}

export const DRIVERS: string[] = new Proxy([] as string[], {
  get(_, prop) {
    const src = _managedDrivers ?? _DEFAULT_DRIVERS;
    return Reflect.get(src, prop);
  },
});

export const DRIVER_ASSISTANTS: string[] = new Proxy([] as string[], {
  get(_, prop) {
    const src = _managedAssistants ?? _DEFAULT_ASSISTANTS;
    return Reflect.get(src, prop);
  },
});

export const DRIVER_COVERAGE: Record<string, string[]> = new Proxy({} as Record<string, string[]>, {
  get(_, prop) {
    const src = _managedCoverage ?? _DEFAULT_COVERAGE;
    return Reflect.get(src, prop);
  },
  ownKeys() {
    return Reflect.ownKeys(_managedCoverage ?? _DEFAULT_COVERAGE);
  },
  getOwnPropertyDescriptor(_, prop) {
    const src = _managedCoverage ?? _DEFAULT_COVERAGE;
    if (prop in src) return { configurable: true, enumerable: true, value: (src as any)[prop] };
    return undefined;
  },
  has(_, prop) {
    return prop in (_managedCoverage ?? _DEFAULT_COVERAGE);
  },
});

// Proximity clusters — derived from AREA_HIERARCHY (subregion name → areas)
export const AREA_CLUSTERS: Record<string, string[]> = Object.fromEntries(
  AREA_HIERARCHY.flatMap(r => r.subregions.map(s => [s.name, s.areas]))
);

export const DRIVER_COVERAGE_AREAS: Record<string, string[]> = new Proxy({} as Record<string, string[]>, {
  get(_, prop) {
    const src = _managedCoverage ?? _DEFAULT_COVERAGE_AREAS;
    return Reflect.get(src, prop);
  },
  ownKeys() {
    return Reflect.ownKeys(_managedCoverage ?? _DEFAULT_COVERAGE_AREAS);
  },
  getOwnPropertyDescriptor(_, prop) {
    const src = _managedCoverage ?? _DEFAULT_COVERAGE_AREAS;
    if (prop in src) return { configurable: true, enumerable: true, value: (src as any)[prop] };
    return undefined;
  },
  has(_, prop) {
    return prop in (_managedCoverage ?? _DEFAULT_COVERAGE_AREAS);
  },
});

// 1. Products (POS Hardware & Accessories - 20 items)
export const initialProducts: Product[] = [
  {
    id: 'PRD-001',
    sku_code: 'UTK-TAB10',
    name: 'Utak Premium 10" POS Tablet',
    category: 'A',
    unit_cost: 8500,
    unit_price: 14999,
    reorder_point: 15,
    description: 'High-performance 10-inch Android tablet pre-configured with Utak POS launcher. Eye-safe display with anti-shatter screen.',
    created_by: SEED_CREATED_BY, created_at: '2026-06-01T09:00:00', modified_by: SEED_MODIFIED_BY, modified_at: '2026-06-01T09:00:00'
  },
  {
    id: 'PRD-002',
    sku_code: 'UTK-TAB08',
    name: 'Utak Compact 8" POS Tablet',
    category: 'A',
    unit_cost: 5200,
    unit_price: 9499,
    reorder_point: 20,
    description: 'Compact 8-inch high-durability tablet optimized for handheld waiter ordering and quick-service checkout.',
    created_by: SEED_CREATED_BY, created_at: '2026-06-01T09:05:00', modified_by: SEED_MODIFIED_BY, modified_at: '2026-06-01T09:05:00'
  },
  {
    id: 'PRD-003',
    sku_code: 'UTK-STD-ROT',
    name: 'Utak 360-Degree Rotating Metal Stand',
    category: 'B',
    unit_cost: 1200,
    unit_price: 2499,
    reorder_point: 30,
    description: 'Heavy duty, premium aluminum alloy tablet stand with dual joints and a 360-degree rotating base.',
    created_by: SEED_CREATED_BY, created_at: '2026-06-01T09:10:00', modified_by: SEED_MODIFIED_BY, modified_at: '2026-06-01T09:10:00'
  },
  {
    id: 'PRD-004',
    sku_code: 'UTK-STD-FXD',
    name: 'Utak Fixed Angled Steel Stand',
    category: 'B',
    unit_cost: 800,
    unit_price: 1699,
    reorder_point: 25,
    description: 'Solid heavy-gauge steel stand with fixed 45-degree angle. Secured counter-mounting holes.',
    created_by: SEED_CREATED_BY, created_at: '2026-06-01T09:15:00', modified_by: SEED_MODIFIED_BY, modified_at: '2026-06-01T09:15:00'
  },
  {
    id: 'PRD-005',
    sku_code: 'UTK-PRN-TH80',
    name: 'Utak 80mm Thermal Receipt Printer (USB/LAN)',
    category: 'A',
    unit_cost: 3200,
    unit_price: 5999,
    reorder_point: 12,
    description: 'Auto-cutter thermal receipt printer, printing speed of 250mm/s. Triple-interface connectivity.',
    created_by: SEED_CREATED_BY, created_at: '2026-06-02T09:00:00', modified_by: SEED_MODIFIED_BY, modified_at: '2026-06-02T09:00:00'
  },
  {
    id: 'PRD-006',
    sku_code: 'UTK-PRN-TH58',
    name: 'Utak 58mm Mobile Bluetooth Printer',
    category: 'B',
    unit_cost: 1400,
    unit_price: 2999,
    reorder_point: 15,
    description: 'Handheld 58mm rechargeable battery-powered thermal printer for mobile billing and deliveries.',
    created_by: SEED_CREATED_BY, created_at: '2026-06-02T09:05:00', modified_by: SEED_MODIFIED_BY, modified_at: '2026-06-02T09:05:00'
  },
  {
    id: 'PRD-007',
    sku_code: 'UTK-DRW-HVY',
    name: 'Utak Heavy Duty RJ11 Cash Drawer',
    category: 'B',
    unit_cost: 1800,
    unit_price: 3499,
    reorder_point: 10,
    description: 'Full-steel cash drawer, 5 bills / 8 coins slots, RJ11 cable for direct printer-driven automatic open.',
    created_by: SEED_CREATED_BY, created_at: '2026-06-02T09:10:00', modified_by: SEED_MODIFIED_BY, modified_at: '2026-06-02T09:10:00'
  },
  {
    id: 'PRD-008',
    sku_code: 'UTK-DRW-MED',
    name: 'Utak Compact 4-Bill Cash Drawer',
    category: 'B',
    unit_cost: 1300,
    unit_price: 2499,
    reorder_point: 15,
    description: 'Compact space-saving cash drawer with 4 bill slots and durable steel construction.',
    created_by: SEED_CREATED_BY, created_at: '2026-06-02T09:15:00', modified_by: SEED_MODIFIED_BY, modified_at: '2026-06-02T09:15:00'
  },
  {
    id: 'PRD-009',
    sku_code: 'UTK-SCN-2D',
    name: 'Utak Omni-directional 2D Barcode Scanner',
    category: 'A',
    unit_cost: 2500,
    unit_price: 4799,
    reorder_point: 10,
    description: 'Hands-free presentation desktop scanner. High-speed scanning of 1D/2D digital screen barcodes.',
    created_by: SEED_CREATED_BY, created_at: '2026-06-03T09:00:00', modified_by: SEED_MODIFIED_BY, modified_at: '2026-06-03T09:00:00'
  },
  {
    id: 'PRD-010',
    sku_code: 'UTK-SCN-HND',
    name: 'Utak Handheld Wireless Barcode Scanner',
    category: 'B',
    unit_cost: 1500,
    unit_price: 2999,
    reorder_point: 15,
    description: 'Ergonomic handheld laser scanner with 2.4G wireless USB dongle. Ranges up to 50 meters.',
    created_by: SEED_CREATED_BY, created_at: '2026-06-03T09:05:00', modified_by: SEED_MODIFIED_BY, modified_at: '2026-06-03T09:05:00'
  },
  {
    id: 'PRD-011',
    sku_code: 'UTK-STY-PEN',
    name: 'Utak Active Stylus Pen (Capacitive)',
    category: 'C',
    unit_cost: 450,
    unit_price: 999,
    reorder_point: 50,
    description: 'Active fine-tip rechargeable stylus for seamless order taking and signature capture on POS tablets.',
    created_by: SEED_CREATED_BY, created_at: '2026-06-03T09:10:00', modified_by: SEED_MODIFIED_BY, modified_at: '2026-06-03T09:10:00'
  },
  {
    id: 'PRD-012',
    sku_code: 'UTK-STY-PAS',
    name: 'Utak Passive Stylus Pen (5-Pack)',
    category: 'C',
    unit_cost: 150,
    unit_price: 399,
    reorder_point: 40,
    description: 'High-durability rubber tipped passive styluses, perfect for rough commercial kitchen environments.',
    created_by: SEED_CREATED_BY, created_at: '2026-06-03T09:15:00', modified_by: SEED_MODIFIED_BY, modified_at: '2026-06-03T09:15:00'
  },
  {
    id: 'PRD-013',
    sku_code: 'UTK-ACC-PWR',
    name: 'Utak 5-in-1 POS Hub & Power Adapter',
    category: 'C',
    unit_cost: 500,
    unit_price: 1199,
    reorder_point: 20,
    description: 'Integrated USB-C adapter supplying reliable continuous power + 4 high-speed USB ports for accessories.',
    created_by: SEED_CREATED_BY, created_at: '2026-06-04T09:00:00', modified_by: SEED_MODIFIED_BY, modified_at: '2026-06-04T09:00:00'
  },
  {
    id: 'PRD-014',
    sku_code: 'UTK-ACC-ROLL',
    name: '80mmx70mm Thermal Paper Rolls (Box of 50)',
    category: 'C',
    unit_cost: 650,
    unit_price: 1200,
    reorder_point: 40,
    description: 'High-grade bright white BPA-free thermal receipt rolls. Suitable for kitchen printers.',
    created_by: SEED_CREATED_BY, created_at: '2026-06-04T09:05:00', modified_by: SEED_MODIFIED_BY, modified_at: '2026-06-04T09:05:00'
  },
  {
    id: 'PRD-015',
    sku_code: 'UTK-ACC-ROLL58',
    name: '58mmx40mm Thermal Paper Rolls (Box of 100)',
    category: 'C',
    unit_cost: 550,
    unit_price: 1050,
    reorder_point: 30,
    description: 'Premium BPA-free mini thermal rolls for portable handheld systems and delivery printers.',
    created_by: SEED_CREATED_BY, created_at: '2026-06-04T09:10:00', modified_by: SEED_MODIFIED_BY, modified_at: '2026-06-04T09:10:00'
  },
  {
    id: 'PRD-016',
    sku_code: 'UTK-LTE-RTR',
    name: 'Utak 4G/LTE Backup Network Router',
    category: 'A',
    unit_cost: 2100,
    unit_price: 3999,
    reorder_point: 8,
    description: 'Industrial failover router. Seamlessly routes cloud database sync over LTE SIM if wired Internet drops.',
    created_by: SEED_CREATED_BY, created_at: '2026-06-05T09:00:00', modified_by: SEED_MODIFIED_BY, modified_at: '2026-06-05T09:00:00'
  },
  {
    id: 'PRD-017',
    sku_code: 'UTK-KBD-BT',
    name: 'Utak Slim Bluetooth POS Keyboard',
    category: 'C',
    unit_cost: 350,
    unit_price: 799,
    reorder_point: 25,
    description: 'Ultra-slim splash-resistant Bluetooth keyboard for fast inventory audits and database lookup at checkout.',
    created_by: SEED_CREATED_BY, created_at: '2026-06-05T09:05:00', modified_by: SEED_MODIFIED_BY, modified_at: '2026-06-05T09:05:00'
  },
  {
    id: 'PRD-018',
    sku_code: 'UTK-DISP-VFD',
    name: 'Utak 2-Line VFD Customer Pole Display',
    category: 'B',
    unit_cost: 2200,
    unit_price: 4299,
    reorder_point: 10,
    description: 'High-visibility fluorescent pole display showing items and total amount to customers.',
    created_by: SEED_CREATED_BY, created_at: '2026-06-05T09:10:00', modified_by: SEED_MODIFIED_BY, modified_at: '2026-06-05T09:10:00'
  },
  {
    id: 'PRD-019',
    sku_code: 'UTK-CARD-RDR',
    name: 'Utak Contactless NFC & Card Reader',
    category: 'A',
    unit_cost: 1900,
    unit_price: 3599,
    reorder_point: 12,
    description: 'NFC card terminal supporting digital e-wallets, loyalty card scans, and cashier login cards.',
    created_by: SEED_CREATED_BY, created_at: '2026-06-06T09:00:00', modified_by: SEED_MODIFIED_BY, modified_at: '2026-06-06T09:00:00'
  },
  {
    id: 'PRD-020',
    sku_code: 'UTK-RFID-TAG',
    name: 'Utak RFID Key Fobs for Cashiers (10-Pack)',
    category: 'C',
    unit_cost: 200,
    unit_price: 499,
    reorder_point: 50,
    description: 'Secure tap-to-login RFID tags for retail staff. Fast operator switching on busy terminal shifts.',
    created_by: SEED_CREATED_BY, created_at: '2026-06-06T09:05:00', modified_by: SEED_MODIFIED_BY, modified_at: '2026-06-06T09:05:00'
  }
];

// 2. Initial Inventory Mapped to Products (At least 20 items, low stock examples included)
export const initialInventory: InventoryItem[] = [
  { product_id: 'PRD-001', warehouse_location: 'BIN-A01', on_hand_qty: 48, allocated_qty: 12 }, // ATP: 36
  { product_id: 'PRD-002', warehouse_location: 'BIN-A02', on_hand_qty: 12, allocated_qty: 8 },  // ATP: 4 (Low stock, ROP=20)
  { product_id: 'PRD-003', warehouse_location: 'BIN-B01', on_hand_qty: 85, allocated_qty: 15 }, // ATP: 70
  { product_id: 'PRD-004', warehouse_location: 'BIN-B02', on_hand_qty: 42, allocated_qty: 5 },  // ATP: 37
  { product_id: 'PRD-005', warehouse_location: 'BIN-A05', on_hand_qty: 24, allocated_qty: 10 }, // ATP: 14
  { product_id: 'PRD-006', warehouse_location: 'BIN-A06', on_hand_qty: 8,  allocated_qty: 5 },  // ATP: 3 (Low stock, ROP=15)
  { product_id: 'PRD-007', warehouse_location: 'BIN-C01', on_hand_qty: 18, allocated_qty: 3 },  // ATP: 15
  { product_id: 'PRD-008', warehouse_location: 'BIN-C02', on_hand_qty: 5,  allocated_qty: 4 },  // ATP: 1 (Low stock, ROP=15)
  { product_id: 'PRD-009', warehouse_location: 'BIN-D01', on_hand_qty: 22, allocated_qty: 6 },  // ATP: 16
  { product_id: 'PRD-010', warehouse_location: 'BIN-D02', on_hand_qty: 14, allocated_qty: 12 }, // ATP: 2 (Low stock, ROP=15)
  { product_id: 'PRD-011', warehouse_location: 'BIN-E01', on_hand_qty: 120, allocated_qty: 30 }, // ATP: 90
  { product_id: 'PRD-012', warehouse_location: 'BIN-E02', on_hand_qty: 90, allocated_qty: 10 }, // ATP: 80
  { product_id: 'PRD-013', warehouse_location: 'BIN-E05', on_hand_qty: 65, allocated_qty: 15 }, // ATP: 50
  { product_id: 'PRD-014', warehouse_location: 'BIN-F01', on_hand_qty: 15, allocated_qty: 5 },  // ATP: 10 (Low stock, ROP=40)
  { product_id: 'PRD-015', warehouse_location: 'BIN-F02', on_hand_qty: 18, allocated_qty: 0 },  // ATP: 18 (Low stock, ROP=30)
  { product_id: 'PRD-016', warehouse_location: 'BIN-A10', on_hand_qty: 4,  allocated_qty: 2 },  // ATP: 2 (Low stock, ROP=8)
  { product_id: 'PRD-017', warehouse_location: 'BIN-E06', on_hand_qty: 50, allocated_qty: 12 }, // ATP: 38
  { product_id: 'PRD-018', warehouse_location: 'BIN-D05', on_hand_qty: 16, allocated_qty: 4 },  // ATP: 12
  { product_id: 'PRD-019', warehouse_location: 'BIN-A12', on_hand_qty: 30, allocated_qty: 8 },  // ATP: 22
  { product_id: 'PRD-020', warehouse_location: 'BIN-E08', on_hand_qty: 140, allocated_qty: 20 }  // ATP: 120
];

// 3. Initial Inventory Transactions (Historic audit log - 22 records)
export const initialTransactions: InventoryTransaction[] = [
  { id: 'TXN-001', product_id: 'PRD-001', date: '2026-06-15T09:00:00', type: 'Goods Receipt', qty_change: 50, resulting_balance: 50, reference: 'GRN-1001' },
  { id: 'TXN-002', product_id: 'PRD-001', date: '2026-06-18T14:30:00', type: 'Sale', qty_change: -2, resulting_balance: 48, reference: 'REC-4001' },
  { id: 'TXN-003', product_id: 'PRD-002', date: '2026-06-15T09:15:00', type: 'Goods Receipt', qty_change: 20, resulting_balance: 20, reference: 'GRN-1001' },
  { id: 'TXN-004', product_id: 'PRD-002', date: '2026-06-20T11:00:00', type: 'Sale', qty_change: -8, resulting_balance: 12, reference: 'REC-4002' },
  { id: 'TXN-005', product_id: 'PRD-003', date: '2026-06-16T10:00:00', type: 'Goods Receipt', qty_change: 100, resulting_balance: 100, reference: 'GRN-1002' },
  { id: 'TXN-006', product_id: 'PRD-003', date: '2026-06-22T15:00:00', type: 'Sale', qty_change: -15, resulting_balance: 85, reference: 'REC-4003' },
  { id: 'TXN-007', product_id: 'PRD-004', date: '2026-06-16T10:15:00', type: 'Goods Receipt', qty_change: 50, resulting_balance: 50, reference: 'GRN-1002' },
  { id: 'TXN-008', product_id: 'PRD-004', date: '2026-06-24T16:45:00', type: 'Sale', qty_change: -5, resulting_balance: 45, reference: 'REC-4004' },
  { id: 'TXN-009', product_id: 'PRD-004', date: '2026-06-28T09:30:00', type: 'Adjustment', qty_change: -3, resulting_balance: 42, reference: 'ADJ-881 (Damaged in Transit)' },
  { id: 'TXN-010', product_id: 'PRD-005', date: '2026-06-17T09:00:00', type: 'Goods Receipt', qty_change: 30, resulting_balance: 30, reference: 'GRN-1003' },
  { id: 'TXN-011', product_id: 'PRD-005', date: '2026-06-25T13:20:00', type: 'Sale', qty_change: -6, resulting_balance: 24, reference: 'REC-4005' },
  { id: 'TXN-012', product_id: 'PRD-006', date: '2026-06-17T09:30:00', type: 'Goods Receipt', qty_change: 15, resulting_balance: 15, reference: 'GRN-1003' },
  { id: 'TXN-013', product_id: 'PRD-006', date: '2026-06-27T10:00:00', type: 'Sale', qty_change: -7, resulting_balance: 8, reference: 'REC-4006' },
  { id: 'TXN-014', product_id: 'PRD-007', date: '2026-06-18T10:00:00', type: 'Goods Receipt', qty_change: 20, resulting_balance: 20, reference: 'GRN-1004' },
  { id: 'TXN-015', product_id: 'PRD-007', date: '2026-06-29T11:40:00', type: 'Sale', qty_change: -2, resulting_balance: 18, reference: 'REC-4007' },
  { id: 'TXN-016', product_id: 'PRD-008', date: '2026-06-18T10:15:00', type: 'Goods Receipt', qty_change: 10, resulting_balance: 10, reference: 'GRN-1004' },
  { id: 'TXN-017', product_id: 'PRD-008', date: '2026-06-30T15:10:00', type: 'Sale', qty_change: -5, resulting_balance: 5, reference: 'REC-4008' },
  { id: 'TXN-018', product_id: 'PRD-014', date: '2026-06-19T09:00:00', type: 'Goods Receipt', qty_change: 20, resulting_balance: 20, reference: 'GRN-1005' },
  { id: 'TXN-019', product_id: 'PRD-014', date: '2026-07-02T14:15:00', type: 'Sale', qty_change: -5, resulting_balance: 15, reference: 'REC-4009' },
  { id: 'TXN-020', product_id: 'PRD-016', date: '2026-06-19T10:00:00', type: 'Goods Receipt', qty_change: 5, resulting_balance: 5, reference: 'GRN-1005' },
  { id: 'TXN-021', product_id: 'PRD-016', date: '2026-07-03T16:00:00', type: 'Sale', qty_change: -1, resulting_balance: 4, reference: 'REC-4010' },
  { id: 'TXN-022', product_id: 'PRD-011', date: '2026-06-20T11:00:00', type: 'Goods Receipt', qty_change: 150, resulting_balance: 150, reference: 'GRN-1006' }
];

// 4. Customers (Realistic Manila-based retail & F&B chains)
export const initialCustomers: Customer[] = [
  { id: 'CST-001', name: 'Jollibee Foods Corp. - Quezon City Cluster', contact_person: 'Theresa Alajar', email: 'procurement.qc@jfc.com.ph', phone: '0917-882-9921', address: '12 E. Rodriguez Jr. Ave', city: 'Quezon City', created_by: SEED_CREATED_BY, created_at: '2026-05-01T08:00:00', modified_by: SEED_MODIFIED_BY, modified_at: '2026-05-01T08:00:00' },
  { id: 'CST-002', name: 'Mercury Drug Corporation - Head Office', contact_person: 'Gabriel Sy', email: 'purchasing@mercurydrug.com', phone: '02-8911-5000', address: '7 Jupiter St. Cor. Makati Ave', city: 'Makati', created_by: SEED_CREATED_BY, created_at: '2026-05-01T08:05:00', modified_by: SEED_MODIFIED_BY, modified_at: '2026-05-01T08:05:00' },
  { id: 'CST-003', name: 'SM Retail Inc. - Department Store Division', contact_person: 'Veronica Co', email: 'veronica.co@smretail.com', phone: '0918-112-4040', address: 'SM Central Business Park', city: 'Pasay', created_by: SEED_CREATED_BY, created_at: '2026-05-01T08:10:00', modified_by: SEED_MODIFIED_BY, modified_at: '2026-05-01T08:10:00' },
  { id: 'CST-004', name: 'Potato Corner Franchise Group (Manila)', contact_person: 'Christian Pineda', email: 'cpineda@potatocorner.com', phone: '0905-223-9110', address: '88 Shaw Blvd, Mandaluyong', city: 'Mandaluyong', created_by: SEED_CREATED_BY, created_at: '2026-05-02T08:00:00', modified_by: SEED_MODIFIED_BY, modified_at: '2026-05-02T08:00:00' },
  { id: 'CST-005', name: 'The Coffee Bean & Tea Leaf (CBTL PH)', contact_person: 'Regine Velasquez', email: 'rvelasquez@cbtl.com.ph', phone: '0917-555-8833', address: 'BGC Corporate Center, Taguig', city: 'Taguig', created_by: SEED_CREATED_BY, created_at: '2026-05-02T08:05:00', modified_by: SEED_MODIFIED_BY, modified_at: '2026-05-02T08:05:00' },
  { id: 'CST-006', name: 'Wildflour Café + Bakery Group', contact_person: 'Ana Lorenzana', email: 'alorenzana@wildflour.com.ph', phone: '02-8856-7600', address: 'Net Lima Bldg, 4th Ave, BGC', city: 'Taguig', created_by: SEED_CREATED_BY, created_at: '2026-05-02T08:10:00', modified_by: SEED_MODIFIED_BY, modified_at: '2026-05-02T08:10:00' },
  { id: 'CST-007', name: 'Generika Drugstore Head Office', contact_person: 'Manuel Lopez', email: 'mlopez@generika.com.ph', phone: '0922-332-1111', address: 'Alabang-Zapote Road', city: 'Muntinlupa', created_by: SEED_CREATED_BY, created_at: '2026-05-03T08:00:00', modified_by: SEED_MODIFIED_BY, modified_at: '2026-05-03T08:00:00' },
  { id: 'CST-008', name: 'Zubuchon Inc. - Manila Branch Office', contact_person: 'Lars Ramirez', email: 'lramirez@zubuchon.com', phone: '0919-440-2020', address: 'Talisay St, Yakal', city: 'Makati', created_by: SEED_CREATED_BY, created_at: '2026-05-03T08:05:00', modified_by: SEED_MODIFIED_BY, modified_at: '2026-05-03T08:05:00' },
  { id: 'CST-009', name: 'Rose Pharmacy Cebu Supply Depot', contact_person: 'Francisca Go', email: 'f.go@rosepharmacy.com', phone: '032-234-9911', address: 'Mandaue Reclamation Area', city: 'Cebu', created_by: SEED_CREATED_BY, created_at: '2026-05-03T08:10:00', modified_by: SEED_MODIFIED_BY, modified_at: '2026-05-03T08:10:00' },
  { id: 'CST-010', name: 'Chowking Foods Corp. - South Manila Area', contact_person: 'Dante Torres', email: 'dtorres@chowking.com.ph', phone: '0917-771-4040', address: 'Roxas Blvd, Malate', city: 'Manila', created_by: SEED_CREATED_BY, created_at: '2026-05-04T08:00:00', modified_by: SEED_MODIFIED_BY, modified_at: '2026-05-04T08:00:00' },
  { id: 'CST-011', name: 'Davao POS Merchant Association', contact_person: 'Roberto Duterte', email: 'davao.merchants@gmail.com', phone: '082-224-8831', address: 'C.M. Recto Ave', city: 'Davao', created_by: SEED_CREATED_BY, created_at: '2026-05-04T08:05:00', modified_by: SEED_MODIFIED_BY, modified_at: '2026-05-04T08:05:00' },
  { id: 'CST-012', name: 'Army Navy Burger Burrito PH', contact_person: 'Nicanor Reyes', email: 'nreyes@armynavy.com.ph', phone: '02-8333-2222', address: 'Polaris St, Makati', city: 'Makati', created_by: SEED_CREATED_BY, created_at: '2026-05-04T08:10:00', modified_by: SEED_MODIFIED_BY, modified_at: '2026-05-04T08:10:00' },
  { id: 'CST-013', name: 'Conti\'s Bakeshop & Restaurant', contact_person: 'Carla Conti', email: 'carlaconti@contis.com.ph', phone: '0915-442-9900', address: 'President\'s Avenue, BF Homes', city: 'Parañaque', created_by: SEED_CREATED_BY, created_at: '2026-05-05T08:00:00', modified_by: SEED_MODIFIED_BY, modified_at: '2026-05-05T08:00:00' },
  { id: 'CST-014', name: 'Max\'s Restaurant Group Inc.', contact_person: 'Jose Maximo', email: 'jmaximo@maxsgroup.com', phone: '02-8784-9000', address: 'Tomas Morato Ave', city: 'Quezon City', created_by: SEED_CREATED_BY, created_at: '2026-05-05T08:05:00', modified_by: SEED_MODIFIED_BY, modified_at: '2026-05-05T08:05:00' },
  { id: 'CST-015', name: 'Mary Grace Cafe Head Office', contact_person: 'Grace Dimacali', email: 'grace@marygracecafe.com', phone: '0917-111-5555', address: 'Pasig City Industrial Zone', city: 'Pasig', created_by: SEED_CREATED_BY, created_at: '2026-05-05T08:10:00', modified_by: SEED_MODIFIED_BY, modified_at: '2026-05-05T08:10:00' }
];

// 5. Delivery Records — the ONE unified list, filtered by `category` to power
//    Deliveries / RMA / Accounting Collection / Procurement Pick-up / Sales Orders screens.
export const initialDeliveryRecords: DeliveryRecord[] = [
  {
    id: 'REC-4001', company_name: 'Army Navy Burger Burrito PH', customer_id: 'CST-012',
    priority: '2 - Moderate', reference: 'SAP-88231', remarks: 'Deliver before lunch service rush.',
    status: 'Scheduled', vehicle: 'Truck-A (6-Wheeler)', area: 'Makati', driver: 'Lando Navarro', driver_assistants: ['Jayson Reyes'],
    account_manager: 'P. Soriano', delivery_date: '2026-07-14', category: 'Deliveries', item_type: 'Medium Item', is_draft: 'No',
    date_time: '2026-07-14T09:00:00', item_description: '3x Omni Scanner (UTK-SCN-2D), 5x Wireless Scanner (UTK-SCN-HND)', attachments: [],
    email_notification_sent: false,
    created_by: 'M. Reyes (Sales Coordinator)', created_at: '2026-07-08T10:12:00', modified_by: 'M. Reyes (Sales Coordinator)', modified_at: '2026-07-08T10:12:00', output_actions_log: []
  },
  {
    id: 'REC-4002', company_name: 'The Coffee Bean & Tea Leaf (CBTL PH)', customer_id: 'CST-005',
    priority: '3 - High', reference: 'SAP-88245', remarks: 'Client requests call 30 mins before arrival.',
    status: 'Pending', vehicle: 'Van-01 (L300)', area: 'Taguig', driver: 'Lando Navarro', driver_assistants: [],
    account_manager: 'D. Macaraeg', delivery_date: '2026-07-14', category: 'Deliveries', item_type: 'Small Item', is_draft: 'No',
    date_time: '2026-07-14T13:00:00', item_description: '5x Compact 8" Tablet, 5x Mobile Printer, 10x 58mm Paper Rolls', attachments: [],
    email_notification_sent: false,
    created_by: 'M. Reyes (Sales Coordinator)', created_at: '2026-07-08T11:00:00', modified_by: 'M. Reyes (Sales Coordinator)', modified_at: '2026-07-08T11:00:00', output_actions_log: []
  },
  {
    id: 'REC-4003', company_name: 'Rose Pharmacy Cebu Supply Depot', customer_id: 'CST-009',
    priority: '1 - Low', reference: 'SAP-88012', remarks: '',
    status: 'Delivered', vehicle: 'Truck-B (10-Wheeler)', area: 'Muntinlupa', driver: 'Manny Santos', driver_assistants: ['Bong Alvarez'],
    account_manager: 'F. Valenzuela', delivery_date: '2026-07-02', category: 'Deliveries', item_type: 'Medium Item', is_draft: 'No',
    date_time: '2026-07-02T10:00:00', item_description: '5x 80mm Thermal Paper Rolls (UTK-ACC-ROLL)', attachments: [],
    email_notification_sent: true,
    created_by: 'M. Reyes (Sales Coordinator)', created_at: '2026-06-28T09:00:00', modified_by: 'R. Pagkalinawan (Logistics) on behalf of Ronald de la Cruz', modified_at: '2026-07-02T14:32:00', output_actions_log: []
  },
  {
    id: 'REC-4004', company_name: 'Davao POS Merchant Association', customer_id: 'CST-011',
    priority: '2 - Moderate', reference: 'SAP-88099', remarks: 'Confirm receiving dock access code with guard.',
    status: 'On-Hold', vehicle: '(None)', area: 'Cavite', driver: '', driver_assistants: [],
    account_manager: 'R. Pagkalinawan', delivery_date: '2026-07-16', category: 'Deliveries', item_type: 'Large / Pallet', is_draft: 'No',
    date_time: '2026-07-16T08:00:00', item_description: '4x 80mm Thermal Printer, 4x RJ11 Cash Drawer', attachments: [],
    email_notification_sent: false,
    created_by: 'M. Reyes (Sales Coordinator)', created_at: '2026-07-09T08:30:00', modified_by: 'M. Reyes (Sales Coordinator)', modified_at: '2026-07-11T16:05:00', output_actions_log: []
  },
  {
    id: 'REC-4005', company_name: 'Jollibee Foods Corp. - Quezon City Cluster', customer_id: 'CST-001',
    priority: '3 - High', reference: 'SAP-88301', remarks: 'Large rollout, confirm truck bay reservation.',
    status: 'Scheduled', vehicle: 'Truck-A (6-Wheeler)', area: 'Quezon City', driver: 'Manny Santos', driver_assistants: ['Ricky Mendoza'],
    account_manager: 'P. Soriano', delivery_date: '2026-07-15', category: 'Deliveries', item_type: 'Large / Pallet', is_draft: 'No',
    date_time: '2026-07-15T07:30:00', item_description: '10x Premium 10" Tablet, 10x 360-Degree stand', attachments: [],
    email_notification_sent: false,
    created_by: 'M. Reyes (Sales Coordinator)', created_at: '2026-07-09T09:00:00', modified_by: 'M. Reyes (Sales Coordinator)', modified_at: '2026-07-09T09:00:00', output_actions_log: []
  },
  {
    id: 'REC-4006', company_name: 'Mary Grace Cafe Head Office', customer_id: 'CST-015',
    priority: '2 - Moderate', reference: 'SAP-88144', remarks: '',
    status: 'Rescheduled', vehicle: 'Van-01 (L300)', area: 'Pasig', driver: 'Ronald de la Cruz', driver_assistants: [],
    account_manager: 'D. Macaraeg', delivery_date: '2026-07-17', category: 'Deliveries', item_type: 'Small Item', is_draft: 'No',
    date_time: '2026-07-17T10:00:00', item_description: '2x Premium 10" Tablet, 10x Active Stylus Pen', attachments: [],
    email_notification_sent: false,
    created_by: 'M. Reyes (Sales Coordinator)', created_at: '2026-07-09T09:30:00', modified_by: 'M. Reyes (Sales Coordinator)', modified_at: '2026-07-12T11:00:00', output_actions_log: []
  },

  // --- RMA (Returns / Pull-out) ---
  {
    id: 'REC-4101', company_name: 'Generika Drugstore Head Office', customer_id: 'CST-007',
    priority: '2 - Moderate', reference: 'SAP-RMA-2201', remarks: 'Unit displaying dead pixel line, swap for replacement.',
    status: 'Scheduled', vehicle: 'Motorcycle-01 (Express)', area: 'Muntinlupa', driver: 'Lando Navarro', driver_assistants: [],
    account_manager: 'F. Valenzuela', delivery_date: '2026-07-15', category: 'RMA', item_type: 'Small Item', is_draft: 'No',
    date_time: '2026-07-15T11:00:00', item_description: '1x UTK-PRN-TH80 defective unit pull-out, replacement drop-off', attachments: [],
    email_notification_sent: false,
    created_by: 'M. Reyes (Sales Coordinator)', created_at: '2026-07-10T13:00:00', modified_by: 'M. Reyes (Sales Coordinator)', modified_at: '2026-07-10T13:00:00', output_actions_log: []
  },
  {
    id: 'REC-4102', company_name: 'Zubuchon Inc. - Manila Branch Office', customer_id: 'CST-008',
    priority: '1 - Low', reference: 'SAP-RMA-2199', remarks: 'Customer reports drawer lock jammed.',
    status: 'Pending', vehicle: '(None)', area: 'Makati', driver: '', driver_assistants: [],
    account_manager: 'R. Pagkalinawan', delivery_date: '2026-07-18', category: 'RMA', item_type: 'Small Item', is_draft: 'No',
    date_time: '2026-07-18T14:00:00', item_description: '1x UTK-DRW-MED cash drawer return for inspection', attachments: [],
    email_notification_sent: false,
    created_by: 'M. Reyes (Sales Coordinator)', created_at: '2026-07-11T08:15:00', modified_by: 'M. Reyes (Sales Coordinator)', modified_at: '2026-07-11T08:15:00', output_actions_log: []
  },
  {
    id: 'REC-4103', company_name: 'Conti\'s Bakeshop & Restaurant', customer_id: 'CST-013',
    priority: '3 - High', reference: 'SAP-RMA-2210', remarks: 'Urgent — customer escalation, expedite pull-out.',
    status: 'On-Hold', vehicle: '(None)', area: 'Manila', driver: '', driver_assistants: [],
    account_manager: 'F. Valenzuela', delivery_date: '2026-07-14', category: 'RMA', item_type: 'Medium Item', is_draft: 'No',
    date_time: '2026-07-14T15:30:00', item_description: '2x UTK-TAB08 tablets, screen unresponsive complaint', attachments: [],
    email_notification_sent: false,
    created_by: 'M. Reyes (Sales Coordinator)', created_at: '2026-07-11T09:00:00', modified_by: 'D. Macaraeg (TASS)', modified_at: '2026-07-13T10:00:00', output_actions_log: []
  },
  {
    id: 'REC-4104', company_name: 'Wildflour Café + Bakery Group', customer_id: 'CST-006',
    priority: '2 - Moderate', reference: 'SAP-RMA-2150', remarks: '',
    status: 'Delivered', vehicle: 'Motorcycle-01 (Express)', area: 'Taguig', driver: 'Ronald de la Cruz', driver_assistants: [],
    account_manager: 'P. Soriano', delivery_date: '2026-07-05', category: 'RMA', item_type: 'Small Item', is_draft: 'No',
    date_time: '2026-07-05T10:00:00', item_description: '1x UTK-SCN-HND replacement swapped on-site', attachments: [],
    email_notification_sent: true,
    created_by: 'M. Reyes (Sales Coordinator)', created_at: '2026-07-02T09:00:00', modified_by: 'R. Pagkalinawan (Logistics) on behalf of Ronald de la Cruz', modified_at: '2026-07-05T12:10:00', output_actions_log: []
  },

  // --- Accounting Collection ---
  {
    id: 'REC-4201', company_name: 'SM Retail Inc. - Department Store Division', customer_id: 'CST-003',
    priority: '2 - Moderate', reference: 'SAP-COLL-3301', remarks: 'Collect signed billing statement and check payment.',
    status: 'Scheduled', vehicle: 'Motorcycle-01 (Express)', area: 'Pasig', driver: 'Lando Navarro', driver_assistants: [],
    account_manager: 'F. Valenzuela', delivery_date: '2026-07-15', category: 'Accounting Collection', item_type: 'Small Item', is_draft: 'No',
    date_time: '2026-07-15T09:00:00', item_description: 'Collection of billing statement + PDC for Invoice INV-5521', attachments: [],
    email_notification_sent: false, amount: 78500.00,
    created_by: 'D. Macaraeg (TASS)', created_at: '2026-07-09T10:00:00', modified_by: 'D. Macaraeg (TASS)', modified_at: '2026-07-09T10:00:00', output_actions_log: []
  },
  {
    id: 'REC-4202', company_name: 'Mercury Drug Corporation - Head Office', customer_id: 'CST-002',
    priority: '1 - Low', reference: 'SAP-COLL-3288', remarks: '',
    status: 'Pending', vehicle: '(None)', area: 'Makati', driver: '', driver_assistants: [],
    account_manager: 'F. Valenzuela', delivery_date: '2026-07-17', category: 'Accounting Collection', item_type: 'Small Item', is_draft: 'No',
    date_time: '2026-07-17T13:00:00', item_description: 'Collection of official receipt acknowledgement for Invoice INV-5498', attachments: [],
    email_notification_sent: false, amount: 25000.00,
    created_by: 'D. Macaraeg (TASS)', created_at: '2026-07-10T08:00:00', modified_by: 'D. Macaraeg (TASS)', modified_at: '2026-07-10T08:00:00', output_actions_log: []
  },
  {
    id: 'REC-4203', company_name: 'Chowking Foods Corp. - South Manila Area', customer_id: 'CST-010',
    priority: '2 - Moderate', reference: 'SAP-COLL-3270', remarks: 'Verified — funds cleared.',
    status: 'Delivered', vehicle: 'Motorcycle-01 (Express)', area: 'Manila', driver: 'Manny Santos', driver_assistants: [],
    account_manager: 'D. Macaraeg', delivery_date: '2026-07-08', category: 'Accounting Collection', item_type: 'Small Item', is_draft: 'No',
    date_time: '2026-07-08T09:00:00', item_description: 'Collection completed for Invoice INV-5410', attachments: [],
    email_notification_sent: true, amount: 143750.00,
    created_by: 'D. Macaraeg (TASS)', created_at: '2026-07-03T09:00:00', modified_by: 'R. Pagkalinawan (Logistics) on behalf of Manny Santos', modified_at: '2026-07-08T15:00:00', output_actions_log: []
  },
  {
    id: 'REC-4204', company_name: 'Potato Corner Franchise Group (Manila)', customer_id: 'CST-004',
    priority: '3 - High', reference: 'SAP-COLL-3320', remarks: 'Account past due 45 days, prioritize.',
    status: 'Rescheduled', vehicle: '(None)', area: 'Manila', driver: '', driver_assistants: [],
    account_manager: 'F. Valenzuela', delivery_date: '2026-07-16', category: 'Accounting Collection', item_type: 'Small Item', is_draft: 'No',
    date_time: '2026-07-16T14:00:00', item_description: 'Collection of overdue balance for Invoice INV-5540', attachments: [],
    email_notification_sent: false, amount: 112000.00,
    created_by: 'D. Macaraeg (TASS)', created_at: '2026-07-11T11:00:00', modified_by: 'D. Macaraeg (TASS)', modified_at: '2026-07-12T09:00:00', output_actions_log: []
  },

  // --- Procurement Pick-up ---
  {
    id: 'REC-4301', company_name: 'TechVantage Manila Distribution', customer_id: 'CST-001',
    priority: '2 - Moderate', reference: 'SAP-PU-9001', remarks: 'Pick up 50 units of UTK-TAB10 from supplier warehouse.',
    status: 'Scheduled', vehicle: 'Truck-A (6-Wheeler)', area: 'Manila', driver: 'Ronald de la Cruz', driver_assistants: ['Ricky Mendoza'],
    account_manager: 'R. Pagkalinawan', delivery_date: '2026-07-14', category: 'Procurement Pick-up', item_type: 'Large / Pallet', is_draft: 'No',
    date_time: '2026-07-14T08:00:00', item_description: 'Pick-up 50x UTK-TAB10 from TechVantage Manila Distribution', attachments: [],
    email_notification_sent: false,
    created_by: 'M. Reyes (Sales Coordinator)', created_at: '2026-07-06T09:00:00', modified_by: 'M. Reyes (Sales Coordinator)', modified_at: '2026-07-06T09:00:00', output_actions_log: []
  },
  {
    id: 'REC-4302', company_name: 'PhilElectronics Manufacturing Inc.', customer_id: 'CST-002',
    priority: '1 - Low', reference: 'SAP-PU-9002', remarks: '',
    status: 'Pending', vehicle: '(None)', area: 'Manila', driver: '', driver_assistants: [],
    account_manager: 'R. Pagkalinawan', delivery_date: '2026-07-19', category: 'Procurement Pick-up', item_type: 'Medium Item', is_draft: 'No',
    date_time: '2026-07-19T09:00:00', item_description: 'Pick-up 100x UTK-STD-ROT metal stands', attachments: [],
    email_notification_sent: false,
    created_by: 'M. Reyes (Sales Coordinator)', created_at: '2026-07-07T09:30:00', modified_by: 'M. Reyes (Sales Coordinator)', modified_at: '2026-07-07T09:30:00', output_actions_log: []
  },
  {
    id: 'REC-4303', company_name: 'Solder & Chip Solutions QC', customer_id: 'CST-004',
    priority: '2 - Moderate', reference: 'SAP-PU-8990', remarks: 'Received in full, logged into Zone C bins.',
    status: 'Delivered', vehicle: 'Truck-B (10-Wheeler)', area: 'Quezon City', driver: 'Lando Navarro', driver_assistants: ['Bong Alvarez'],
    account_manager: 'R. Pagkalinawan', delivery_date: '2026-07-03', category: 'Procurement Pick-up', item_type: 'Large / Pallet', is_draft: 'No',
    date_time: '2026-07-03T08:00:00', item_description: 'Pick-up 20x UTK-DRW-HVY cash drawers', attachments: [],
    email_notification_sent: true,
    created_by: 'M. Reyes (Sales Coordinator)', created_at: '2026-06-29T09:00:00', modified_by: 'R. Pagkalinawan (Logistics) on behalf of Lando Navarro', modified_at: '2026-07-03T13:00:00', output_actions_log: []
  },
  {
    id: 'REC-4304', company_name: 'Papercraft Press Manila', customer_id: 'CST-005',
    priority: '1 - Low', reference: 'SAP-PU-9010', remarks: 'Supplier requested reschedule due to production delay.',
    status: 'On-Hold', vehicle: '(None)', area: 'Manila', driver: '', driver_assistants: [],
    account_manager: 'R. Pagkalinawan', delivery_date: '2026-07-20', category: 'Procurement Pick-up', item_type: 'Large / Pallet', is_draft: 'No',
    date_time: '2026-07-20T10:00:00', item_description: 'Pick-up 50x boxes of 80mm thermal paper rolls', attachments: [],
    email_notification_sent: false,
    created_by: 'M. Reyes (Sales Coordinator)', created_at: '2026-07-08T09:00:00', modified_by: 'R. Pagkalinawan (Sales Coordinator)', modified_at: '2026-07-13T09:00:00', output_actions_log: []
  },

  // --- Sales Orders ---
  {
    id: 'REC-4401', company_name: 'The Coffee Bean & Tea Leaf (CBTL PH)', customer_id: 'CST-005',
    priority: '2 - Moderate', reference: 'SAP-SO-2012', remarks: 'B2B order — 3 line items, confirm delivery slot.',
    status: 'Scheduled', vehicle: 'Van-01 (L300)', area: 'Taguig', driver: 'Manny Santos', driver_assistants: [],
    account_manager: 'D. Macaraeg', delivery_date: '2026-07-16', category: 'Sales Orders', item_type: 'Medium Item', is_draft: 'No',
    date_time: '2026-07-16T10:00:00', item_description: '5x Compact 8" Tablet, 5x Mobile Printer, 10x 58mm Paper Rolls', attachments: [],
    email_notification_sent: false,
    created_by: 'M. Reyes (Sales Coordinator)', created_at: '2026-07-08T14:00:00', modified_by: 'M. Reyes (Sales Coordinator)', modified_at: '2026-07-08T14:00:00', output_actions_log: []
  },
  {
    id: 'REC-4402', company_name: 'Davao POS Merchant Association', customer_id: 'CST-011',
    priority: '2 - Moderate', reference: 'SAP-SO-2013', remarks: '',
    status: 'Pending', vehicle: '(None)', area: 'Manila', driver: '', driver_assistants: [],
    account_manager: 'R. Pagkalinawan', delivery_date: '2026-07-18', category: 'Sales Orders', item_type: 'Medium Item', is_draft: 'No',
    date_time: '2026-07-18T11:00:00', item_description: '4x 80mm Thermal Printer, 4x RJ11 Cash Drawer', attachments: [],
    email_notification_sent: false,
    created_by: 'M. Reyes (Sales Coordinator)', created_at: '2026-07-09T10:00:00', modified_by: 'M. Reyes (Sales Coordinator)', modified_at: '2026-07-09T10:00:00', output_actions_log: []
  },
  {
    id: 'REC-4403', company_name: 'Mary Grace Cafe Head Office', customer_id: 'CST-015',
    priority: '1 - Low', reference: 'SAP-SO-2015', remarks: 'Invoice fully paid and closed.',
    status: 'Delivered', vehicle: 'Truck-A (6-Wheeler)', area: 'Pasig', driver: 'Ronald de la Cruz', driver_assistants: ['Jayson Reyes'],
    account_manager: 'D. Macaraeg', delivery_date: '2026-07-06', category: 'Sales Orders', item_type: 'Small Item', is_draft: 'No',
    date_time: '2026-07-06T09:00:00', item_description: '2x Premium 10" Tablet, 10x Active Stylus Pen', attachments: [],
    email_notification_sent: true,
    created_by: 'M. Reyes (Sales Coordinator)', created_at: '2026-07-02T09:00:00', modified_by: 'R. Pagkalinawan (Logistics) on behalf of Ronald de la Cruz', modified_at: '2026-07-06T16:00:00', output_actions_log: []
  }
];

// ─── Supplier Master (seed data) ─────────────────────────────────────────────

export const initialSuppliers: Supplier[] = [
  {
    id: 'SUP-001', name: 'TechVantage Manila Distribution',
    contact_person: 'Ariel Santos', email: 'ariel@techvantage.ph', phone: '+63 2 8888 1001',
    address: '45 Tuazon Ave, Quezon City', city: 'Quezon City',
    category: 'Electronics',
    created_by: 'Admin', created_at: '2025-01-10T08:00:00',
    modified_by: 'Admin', modified_at: '2025-01-10T08:00:00'
  },
  {
    id: 'SUP-002', name: 'MetalWorks Fabrication Inc.',
    contact_person: 'Carlo Reyes', email: 'carlo@metalworks.ph', phone: '+63 2 8777 2002',
    address: '18 Macapagal Blvd, Pasay', city: 'Pasay',
    category: 'Hardware',
    created_by: 'Admin', created_at: '2025-01-15T08:00:00',
    modified_by: 'Admin', modified_at: '2025-01-15T08:00:00'
  },
  {
    id: 'SUP-003', name: 'PaperTrail Consumables Co.',
    contact_person: 'Liza Cruz', email: 'liza@papertrail.ph', phone: '+63 2 8666 3003',
    address: '7 EDSA North, Caloocan', city: 'Caloocan',
    category: 'Consumables',
    created_by: 'Admin', created_at: '2025-02-01T08:00:00',
    modified_by: 'Admin', modified_at: '2025-02-01T08:00:00'
  },
  {
    id: 'SUP-004', name: 'BoxRight Packaging Solutions',
    contact_person: 'Mark Villanueva', email: 'mark@boxright.ph', phone: '+63 2 8555 4004',
    address: '22 Industrial Rd, Valenzuela', city: 'Valenzuela',
    category: 'Packaging',
    created_by: 'Admin', created_at: '2025-02-10T08:00:00',
    modified_by: 'Admin', modified_at: '2025-02-10T08:00:00'
  },
  {
    id: 'SUP-005', name: 'Globalink Freight & Logistics',
    contact_person: 'Nina Bautista', email: 'nina@globalink.ph', phone: '+63 2 8444 5005',
    address: '100 Port Area, Manila', city: 'Manila',
    category: 'Services',
    created_by: 'Admin', created_at: '2025-03-01T08:00:00',
    modified_by: 'Admin', modified_at: '2025-03-01T08:00:00'
  },
];
