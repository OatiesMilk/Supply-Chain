import { prisma } from '../src/db';
import bcrypt from 'bcryptjs';

import { seedAccounts, COMPANIES, CUSTOMERS, SUPPLIERS } from './seeds/accounts';
import { seedDrivers } from './seeds/drivers';





import { seedUsers, USERS } from './seeds/users';

const PRODUCTS = [
  { legacyId: 'PRD-001', skuCode: 'UTK-TAB10',    name: 'Utak Premium 10" POS Tablet',              category: 'A', unitCost: 8500, unitPrice: 14999, reorderPoint: 15, description: 'High-performance 10-inch Android tablet pre-configured with Utak POS launcher. Eye-safe display with anti-shatter screen.',                                              createdAt: new Date('2026-06-01T09:00:00') },
  { legacyId: 'PRD-002', skuCode: 'UTK-TAB08',    name: 'Utak Compact 8" POS Tablet',               category: 'A', unitCost: 5200, unitPrice: 9499,  reorderPoint: 20, description: 'Compact 8-inch high-durability tablet optimized for handheld waiter ordering and quick-service checkout.',                                                               createdAt: new Date('2026-06-01T09:05:00') },
  { legacyId: 'PRD-003', skuCode: 'UTK-STD-ROT',  name: 'Utak 360-Degree Rotating Metal Stand',     category: 'B', unitCost: 1200, unitPrice: 2499,  reorderPoint: 30, description: 'Heavy duty, premium aluminum alloy tablet stand with dual joints and a 360-degree rotating base.',                                                                        createdAt: new Date('2026-06-01T09:10:00') },
  { legacyId: 'PRD-004', skuCode: 'UTK-STD-FXD',  name: 'Utak Fixed Angled Steel Stand',            category: 'B', unitCost: 800,  unitPrice: 1699,  reorderPoint: 25, description: 'Solid heavy-gauge steel stand with fixed 45-degree angle. Secured counter-mounting holes.',                                                                                createdAt: new Date('2026-06-01T09:15:00') },
  { legacyId: 'PRD-005', skuCode: 'UTK-PRN-TH80', name: 'Utak 80mm Thermal Receipt Printer (USB/LAN)', category: 'A', unitCost: 3200, unitPrice: 5999, reorderPoint: 12, description: 'Auto-cutter thermal receipt printer, printing speed of 250mm/s. Triple-interface connectivity.',                                                                       createdAt: new Date('2026-06-02T09:00:00') },
  { legacyId: 'PRD-006', skuCode: 'UTK-PRN-TH58', name: 'Utak 58mm Mobile Bluetooth Printer',       category: 'B', unitCost: 1400, unitPrice: 2999,  reorderPoint: 15, description: 'Handheld 58mm rechargeable battery-powered thermal printer for mobile billing and deliveries.',                                                                           createdAt: new Date('2026-06-02T09:05:00') },
  { legacyId: 'PRD-007', skuCode: 'UTK-DRW-HVY',  name: 'Utak Heavy Duty RJ11 Cash Drawer',         category: 'B', unitCost: 1800, unitPrice: 3499,  reorderPoint: 10, description: 'Full-steel cash drawer, 5 bills / 8 coins slots, RJ11 cable for direct printer-driven automatic open.',                                                                   createdAt: new Date('2026-06-02T09:10:00') },
  { legacyId: 'PRD-008', skuCode: 'UTK-DRW-MED',  name: 'Utak Compact 4-Bill Cash Drawer',          category: 'B', unitCost: 1300, unitPrice: 2499,  reorderPoint: 15, description: 'Compact space-saving cash drawer with 4 bill slots and durable steel construction.',                                                                                       createdAt: new Date('2026-06-02T09:15:00') },
  { legacyId: 'PRD-009', skuCode: 'UTK-SCN-2D',   name: 'Utak Omni-directional 2D Barcode Scanner', category: 'A', unitCost: 2500, unitPrice: 4799,  reorderPoint: 10, description: 'Hands-free presentation desktop scanner. High-speed scanning of 1D/2D digital screen barcodes.',                                                                          createdAt: new Date('2026-06-03T09:00:00') },
  { legacyId: 'PRD-010', skuCode: 'UTK-SCN-HND',  name: 'Utak Handheld Wireless Barcode Scanner',   category: 'B', unitCost: 1500, unitPrice: 2999,  reorderPoint: 15, description: 'Ergonomic handheld laser scanner with 2.4G wireless USB dongle. Ranges up to 50 meters.',                                                                                 createdAt: new Date('2026-06-03T09:05:00') },
  { legacyId: 'PRD-011', skuCode: 'UTK-STY-PEN',  name: 'Utak Active Stylus Pen (Capacitive)',      category: 'C', unitCost: 450,  unitPrice: 999,   reorderPoint: 50, description: 'Active fine-tip rechargeable stylus for seamless order taking and signature capture on POS tablets.',                                                                      createdAt: new Date('2026-06-03T09:10:00') },
  { legacyId: 'PRD-012', skuCode: 'UTK-STY-PAS',  name: 'Utak Passive Stylus Pen (5-Pack)',         category: 'C', unitCost: 150,  unitPrice: 399,   reorderPoint: 40, description: 'High-durability rubber tipped passive styluses, perfect for rough commercial kitchen environments.',                                                                        createdAt: new Date('2026-06-03T09:15:00') },
  { legacyId: 'PRD-013', skuCode: 'UTK-ACC-PWR',  name: 'Utak 5-in-1 POS Hub & Power Adapter',     category: 'C', unitCost: 500,  unitPrice: 1199,  reorderPoint: 20, description: 'Integrated USB-C adapter supplying reliable continuous power + 4 high-speed USB ports for accessories.',                                                                   createdAt: new Date('2026-06-04T09:00:00') },
  { legacyId: 'PRD-014', skuCode: 'UTK-ACC-ROLL', name: '80mmx70mm Thermal Paper Rolls (Box of 50)', category: 'C', unitCost: 650,  unitPrice: 1200,  reorderPoint: 40, description: 'High-grade bright white BPA-free thermal receipt rolls. Suitable for kitchen printers.',                                                                                  createdAt: new Date('2026-06-04T09:05:00') },
  { legacyId: 'PRD-015', skuCode: 'UTK-ACC-ROLL58', name: '58mmx40mm Thermal Paper Rolls (Box of 100)', category: 'C', unitCost: 550, unitPrice: 1050, reorderPoint: 30, description: 'Premium BPA-free mini thermal rolls for portable handheld systems and delivery printers.',                                                                            createdAt: new Date('2026-06-04T09:10:00') },
  { legacyId: 'PRD-016', skuCode: 'UTK-LTE-RTR',  name: 'Utak 4G/LTE Backup Network Router',       category: 'A', unitCost: 2100, unitPrice: 3999,  reorderPoint: 8,  description: 'Industrial failover router. Seamlessly routes cloud database sync over LTE SIM if wired Internet drops.',                                                                  createdAt: new Date('2026-06-05T09:00:00') },
  { legacyId: 'PRD-017', skuCode: 'UTK-KBD-BT',   name: 'Utak Slim Bluetooth POS Keyboard',         category: 'C', unitCost: 350,  unitPrice: 799,   reorderPoint: 25, description: 'Ultra-slim splash-resistant Bluetooth keyboard for fast inventory audits and database lookup at checkout.',                                                                 createdAt: new Date('2026-06-05T09:05:00') },
  { legacyId: 'PRD-018', skuCode: 'UTK-DISP-VFD', name: 'Utak 2-Line VFD Customer Pole Display',   category: 'B', unitCost: 2200, unitPrice: 4299,  reorderPoint: 10, description: 'High-visibility fluorescent pole display showing items and total amount to customers.',                                                                                    createdAt: new Date('2026-06-05T09:10:00') },
  { legacyId: 'PRD-019', skuCode: 'UTK-CARD-RDR', name: 'Utak Contactless NFC & Card Reader',       category: 'A', unitCost: 1900, unitPrice: 3599,  reorderPoint: 12, description: 'NFC card terminal supporting digital e-wallets, loyalty card scans, and cashier login cards.',                                                                            createdAt: new Date('2026-06-06T09:00:00') },
  { legacyId: 'PRD-020', skuCode: 'UTK-RFID-TAG', name: 'Utak RFID Key Fobs for Cashiers (10-Pack)', category: 'C', unitCost: 200, unitPrice: 499,   reorderPoint: 50, description: 'Secure tap-to-login RFID tags for retail staff. Fast operator switching on busy terminal shifts.',                                                                        createdAt: new Date('2026-06-06T09:05:00') }
];

const INVENTORY: Record<string, { warehouseLocation: string; onHandQty: number; allocatedQty: number }> = {
  'PRD-001': { warehouseLocation: 'BIN-A01', onHandQty: 48,  allocatedQty: 12 },
  'PRD-002': { warehouseLocation: 'BIN-A02', onHandQty: 12,  allocatedQty: 8  },
  'PRD-003': { warehouseLocation: 'BIN-B01', onHandQty: 85,  allocatedQty: 15 },
  'PRD-004': { warehouseLocation: 'BIN-B02', onHandQty: 42,  allocatedQty: 5  },
  'PRD-005': { warehouseLocation: 'BIN-A05', onHandQty: 24,  allocatedQty: 10 },
  'PRD-006': { warehouseLocation: 'BIN-A06', onHandQty: 8,   allocatedQty: 5  },
  'PRD-007': { warehouseLocation: 'BIN-C01', onHandQty: 18,  allocatedQty: 3  },
  'PRD-008': { warehouseLocation: 'BIN-C02', onHandQty: 5,   allocatedQty: 4  },
  'PRD-009': { warehouseLocation: 'BIN-D01', onHandQty: 22,  allocatedQty: 6  },
  'PRD-010': { warehouseLocation: 'BIN-D02', onHandQty: 14,  allocatedQty: 12 },
  'PRD-011': { warehouseLocation: 'BIN-E01', onHandQty: 120, allocatedQty: 30 },
  'PRD-012': { warehouseLocation: 'BIN-E02', onHandQty: 90,  allocatedQty: 10 },
  'PRD-013': { warehouseLocation: 'BIN-E05', onHandQty: 65,  allocatedQty: 15 },
  'PRD-014': { warehouseLocation: 'BIN-F01', onHandQty: 15,  allocatedQty: 5  },
  'PRD-015': { warehouseLocation: 'BIN-F02', onHandQty: 18,  allocatedQty: 0  },
  'PRD-016': { warehouseLocation: 'BIN-A10', onHandQty: 4,   allocatedQty: 2  },
  'PRD-017': { warehouseLocation: 'BIN-E06', onHandQty: 50,  allocatedQty: 12 },
  'PRD-018': { warehouseLocation: 'BIN-D05', onHandQty: 16,  allocatedQty: 4  },
  'PRD-019': { warehouseLocation: 'BIN-A12', onHandQty: 30,  allocatedQty: 8  },
  'PRD-020': { warehouseLocation: 'BIN-E08', onHandQty: 140, allocatedQty: 20 }
};

const TRANSACTIONS = [
  { legacyProductId: 'PRD-001', date: new Date('2026-06-15T09:00:00'), type: 'Goods Receipt', qtyChange: 50,   resultingBalance: 50,  reference: 'GRN-1001' },
  { legacyProductId: 'PRD-001', date: new Date('2026-06-18T14:30:00'), type: 'Sale',          qtyChange: -2,   resultingBalance: 48,  reference: 'REC-4001' },
  { legacyProductId: 'PRD-002', date: new Date('2026-06-15T09:15:00'), type: 'Goods Receipt', qtyChange: 20,   resultingBalance: 20,  reference: 'GRN-1001' },
  { legacyProductId: 'PRD-002', date: new Date('2026-06-20T11:00:00'), type: 'Sale',          qtyChange: -8,   resultingBalance: 12,  reference: 'REC-4002' },
  { legacyProductId: 'PRD-003', date: new Date('2026-06-16T10:00:00'), type: 'Goods Receipt', qtyChange: 100,  resultingBalance: 100, reference: 'GRN-1002' },
  { legacyProductId: 'PRD-003', date: new Date('2026-06-22T15:00:00'), type: 'Sale',          qtyChange: -15,  resultingBalance: 85,  reference: 'REC-4003' },
  { legacyProductId: 'PRD-004', date: new Date('2026-06-16T10:15:00'), type: 'Goods Receipt', qtyChange: 50,   resultingBalance: 50,  reference: 'GRN-1002' },
  { legacyProductId: 'PRD-004', date: new Date('2026-06-24T16:45:00'), type: 'Sale',          qtyChange: -5,   resultingBalance: 45,  reference: 'REC-4004' },
  { legacyProductId: 'PRD-004', date: new Date('2026-06-28T09:30:00'), type: 'Adjustment',    qtyChange: -3,   resultingBalance: 42,  reference: 'ADJ-881 (Damaged in Transit)' },
  { legacyProductId: 'PRD-005', date: new Date('2026-06-17T09:00:00'), type: 'Goods Receipt', qtyChange: 30,   resultingBalance: 30,  reference: 'GRN-1003' },
  { legacyProductId: 'PRD-005', date: new Date('2026-06-25T13:20:00'), type: 'Sale',          qtyChange: -6,   resultingBalance: 24,  reference: 'REC-4005' },
  { legacyProductId: 'PRD-006', date: new Date('2026-06-17T09:30:00'), type: 'Goods Receipt', qtyChange: 15,   resultingBalance: 15,  reference: 'GRN-1003' },
  { legacyProductId: 'PRD-006', date: new Date('2026-06-27T10:00:00'), type: 'Sale',          qtyChange: -7,   resultingBalance: 8,   reference: 'REC-4006' },
  { legacyProductId: 'PRD-007', date: new Date('2026-06-18T10:00:00'), type: 'Goods Receipt', qtyChange: 20,   resultingBalance: 20,  reference: 'GRN-1004' },
  { legacyProductId: 'PRD-007', date: new Date('2026-06-29T11:40:00'), type: 'Sale',          qtyChange: -2,   resultingBalance: 18,  reference: 'REC-4007' },
  { legacyProductId: 'PRD-008', date: new Date('2026-06-18T10:15:00'), type: 'Goods Receipt', qtyChange: 10,   resultingBalance: 10,  reference: 'GRN-1004' },
  { legacyProductId: 'PRD-008', date: new Date('2026-06-30T15:10:00'), type: 'Sale',          qtyChange: -5,   resultingBalance: 5,   reference: 'REC-4008' },
  { legacyProductId: 'PRD-014', date: new Date('2026-06-19T09:00:00'), type: 'Goods Receipt', qtyChange: 20,   resultingBalance: 20,  reference: 'GRN-1005' },
  { legacyProductId: 'PRD-014', date: new Date('2026-07-02T14:15:00'), type: 'Sale',          qtyChange: -5,   resultingBalance: 15,  reference: 'REC-4009' },
  { legacyProductId: 'PRD-016', date: new Date('2026-06-19T10:00:00'), type: 'Goods Receipt', qtyChange: 5,    resultingBalance: 5,   reference: 'GRN-1005' },
  { legacyProductId: 'PRD-016', date: new Date('2026-07-03T16:00:00'), type: 'Sale',          qtyChange: -1,   resultingBalance: 4,   reference: 'REC-4010' },
  { legacyProductId: 'PRD-011', date: new Date('2026-06-20T11:00:00'), type: 'Goods Receipt', qtyChange: 150,  resultingBalance: 150, reference: 'GRN-1006' }
];

async function seedSkus(salesUserId: string) {
  const idMap: Record<string, string> = {};
  for (const p of PRODUCTS) {
    const created = await prisma.product.create({
      data: {
        skuCode:      p.skuCode,
        name:         p.name,
        category:     p.category,
        unitCost:     p.unitCost,
        unitPrice:    p.unitPrice,
        reorderPoint: p.reorderPoint,
        description:  p.description,
        createdById:  salesUserId,
        modifiedById: salesUserId,
        createdAt:    p.createdAt,
        updatedAt:    p.createdAt
      }
    });
    idMap[p.legacyId] = created.id;
    const inv = INVENTORY[p.legacyId];
    if (inv) {
      await prisma.inventoryItem.create({
        data: {
          productId:         created.id,
          warehouseLocation: inv.warehouseLocation,
          onHandQty:         inv.onHandQty,
          allocatedQty:      inv.allocatedQty,
          updatedAt:         p.createdAt
        }
      });
    }
  }
  for (const t of TRANSACTIONS) {
    const productId = idMap[t.legacyProductId];
    if (!productId) continue;
    await prisma.inventoryTransaction.create({
      data: {
        productId,
        date:             t.date,
        type:             t.type,
        qtyChange:        t.qtyChange,
        resultingBalance: t.resultingBalance,
        reference:        t.reference,
        createdAt:        t.date
      }
    });
  }
  console.log(`SKU seed: ${PRODUCTS.length} products, ${PRODUCTS.length} inventory rows, ${TRANSACTIONS.length} transactions.`);
}



export async function runSeed(force = false) {
  const userCount = await prisma.user.count();

  if (userCount > 0 && !force) {
    const adminExists = await prisma.user.findUnique({ where: { email: 'admin@microgenesis.com' } });
    if (!adminExists) {
      const hashed = await bcrypt.hash('admin123', 10);
      await prisma.user.create({
        data: { name: 'System Admin', email: 'admin@microgenesis.com', password: hashed, role: 'ADMIN', isActive: true }
      });
      console.log('Seed partial: admin@microgenesis.com added to existing database.');
    } else {
      console.log(`Seed skipped — database already has ${userCount} user(s).`);
    }
    const productCount = await prisma.product.count();
    if (productCount === 0) {
      const salesUser = await prisma.user.findUnique({ where: { email: 'sales@microgenesis.com' } });
      if (salesUser) await seedSkus(salesUser.id);
    }
    const customerCount = await prisma.customer.count();
    if (customerCount === 0) {
      const a = await prisma.user.findUnique({ where: { email: 'admin@microgenesis.com' } });
      if (a) await seedAccounts(a.id);
    }
    return;
  }

  // Full clear (always on force=true, or when DB is empty)
  await prisma.remarkLog.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.userPermission.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.notificationLog.deleteMany();
  await prisma.dailyStatusSnapshot.deleteMany();
  await prisma.inventoryTransaction.deleteMany();
  await prisma.inventoryItem.deleteMany();
  await prisma.product.deleteMany();
  await prisma.deliveryRecord.deleteMany();
  await prisma.company.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.supplier.deleteMany();
  await prisma.driver.deleteMany();
  await prisma.user.deleteMany();

  // ── Users ──────────────────────────────────────────────────────────────────
  const users = await seedUsers();

  // ── Companies ──────────────────────────────────────────────────────────────
  const { companies } = await seedAccounts(users['ADMIN'].id);
  console.log(`Customer/Supplier seed: ${CUSTOMERS.length} customers, ${SUPPLIERS.length} suppliers.`);

  // ── Drivers ────────────────────────────────────────────────────────────────
  await seedDrivers(prisma, users['ADMIN'].name);

  const sales     = users['SALES_COORDINATOR'];
  const logistics = users['LOGISTICS'];

  // ── Delivery Records ───────────────────────────────────────────────────────
  // Drivers available
  const D1 = 'Manny Santos';
  const D2 = 'Ronald de la Cruz';
  const D3 = 'Lando Navarro';
  const A1 = 'Jayson Reyes';
  const A2 = 'Bong Alvarez';
  const A3 = 'Ricky Mendoza';

  const records = [
    // ── DELIVERY — ACCOMPLISHED (8) ──────────────────────────────────────────
    { id: 'REC-4001', companyKey: 'jollibee',     priority: '3 - High',     reference: 'SAP-88501', remarks: 'Deliver to commissary bay 3. Coordinate with PIC Eduardo.',              status: 'ACCOMPLISHED', vehicle: 'Truck-A (6-Wheeler)',        area: 'Quezon City - Fairview',   driver: D1, driverAssistants: A1 ? JSON.stringify([A1]) : '[]', accountManager: 'P. Soriano',    deliveryDate: '2026-04-10', category: 'DELIVERY',              itemType: 'Large / Pallet', draft: false, dateAndTime: '2026-04-10T08:00:00', itemDescription: '10x UTK-TAB10, 10x UTK-STD-ROT, 10x UTK-PRN-TH80', collectionVerified: false, createdBy: sales, modifiedBy: logistics },
    { id: 'REC-4002', companyKey: 'mcdo',          priority: '3 - High',     reference: 'SAP-88530', remarks: 'Deliver to receiving dock B. Call site manager 30 mins prior.',          status: 'ACCOMPLISHED', vehicle: 'Truck-B (10-Wheeler)',        area: 'Makati CBD',               driver: D2, driverAssistants: A2 ? JSON.stringify([A2]) : '[]', accountManager: 'D. Macaraeg',   deliveryDate: '2026-04-15', category: 'DELIVERY',              itemType: 'Large / Pallet', draft: false, dateAndTime: '2026-04-15T09:00:00', itemDescription: '20x UTK-PRN-TH80, 20x UTK-DRW-HVY, 20x UTK-ACC-ROLL', collectionVerified: false, createdBy: sales, modifiedBy: logistics },
    { id: 'REC-4003', companyKey: 'mercury',       priority: '2 - Moderate', reference: 'SAP-88560', remarks: '',                                                                       status: 'ACCOMPLISHED', vehicle: 'Van-01 (L300)',               area: 'BGC (Taguig)',             driver: D3, driverAssistants: A3 ? JSON.stringify([A3]) : '[]', accountManager: 'F. Valenzuela', deliveryDate: '2026-04-22', category: 'DELIVERY',              itemType: 'Medium Item',    draft: false, dateAndTime: '2026-04-22T10:00:00', itemDescription: '15x UTK-SCN-2D, 15x UTK-RFID-TAG', collectionVerified: false, createdBy: sales, modifiedBy: logistics },
    { id: 'REC-4004', companyKey: 'smretail',      priority: '3 - High',     reference: 'SAP-88612', remarks: 'Full SM Bicutan POS rollout. Requires ground-floor unloading.',          status: 'ACCOMPLISHED', vehicle: 'Truck-A (6-Wheeler)',        area: 'Parañaque',                driver: D1, driverAssistants: A1 ? JSON.stringify([A1]) : '[]', accountManager: 'P. Soriano',    deliveryDate: '2026-05-05', category: 'DELIVERY',              itemType: 'Large / Pallet', draft: false, dateAndTime: '2026-05-05T08:00:00', itemDescription: '8x UTK-TAB10, 8x UTK-STD-ROT, 8x UTK-CARD-RDR, 8x UTK-DISP-VFD', collectionVerified: false, createdBy: sales, modifiedBy: logistics },
    { id: 'REC-4005', companyKey: 'shakeys',       priority: '2 - Moderate', reference: 'SAP-88645', remarks: 'Deliver to Podium back entrance.',                                       status: 'ACCOMPLISHED', vehicle: 'Van-01 (L300)',               area: 'Ortigas Center (Pasig)',   driver: D2, driverAssistants: A3 ? JSON.stringify([A3]) : '[]', accountManager: 'R. Pagkalinawan', deliveryDate: '2026-05-12', category: 'DELIVERY',            itemType: 'Medium Item',    draft: false, dateAndTime: '2026-05-12T10:00:00', itemDescription: '5x UTK-PRN-TH80, 5x UTK-DRW-HVY, 5x UTK-SCN-HND', collectionVerified: false, createdBy: sales, modifiedBy: logistics },
    { id: 'REC-4006', companyKey: 'chowking',      priority: '2 - Moderate', reference: 'SAP-88680', remarks: 'Deliver to South Manila cluster depot.',                                 status: 'ACCOMPLISHED', vehicle: 'Truck-B (10-Wheeler)',        area: 'Manila - Ermita',          driver: D3, driverAssistants: A2 ? JSON.stringify([A2]) : '[]', accountManager: 'D. Macaraeg',   deliveryDate: '2026-05-20', category: 'DELIVERY',              itemType: 'Large / Pallet', draft: false, dateAndTime: '2026-05-20T08:30:00', itemDescription: '12x UTK-TAB08, 12x UTK-PRN-TH58, 12x UTK-STD-FXD', collectionVerified: false, createdBy: sales, modifiedBy: logistics },
    { id: 'REC-4007', companyKey: 'puregold',      priority: '2 - Moderate', reference: 'SAP-88710', remarks: '',                                                                       status: 'ACCOMPLISHED', vehicle: 'Van-01 (L300)',               area: 'Manila - Binondo',         driver: D1, driverAssistants: A1 ? JSON.stringify([A1]) : '[]', accountManager: 'F. Valenzuela', deliveryDate: '2026-06-03', category: 'DELIVERY',              itemType: 'Medium Item',    draft: false, dateAndTime: '2026-06-03T09:00:00', itemDescription: '6x UTK-CARD-RDR, 6x UTK-RFID-TAG, 6x UTK-ACC-PWR', collectionVerified: false, createdBy: sales, modifiedBy: logistics },
    { id: 'REC-4008', companyKey: 'generika',      priority: '1 - Low',      reference: 'SAP-88755', remarks: 'Deliver to Alabang distribution center.',                                status: 'ACCOMPLISHED', vehicle: 'Truck-A (6-Wheeler)',        area: 'Muntinlupa - Alabang',     driver: D2, driverAssistants: A2 ? JSON.stringify([A2]) : '[]', accountManager: 'A. Santos',     deliveryDate: '2026-06-15', category: 'DELIVERY',              itemType: 'Large / Pallet', draft: false, dateAndTime: '2026-06-15T08:00:00', itemDescription: '4x UTK-LTE-RTR, 4x UTK-DRW-MED, 10x UTK-KBD-BT', collectionVerified: false, createdBy: sales, modifiedBy: logistics },

    // ── DELIVERY — SCHEDULED (6) ──────────────────────────────────────────────
    { id: 'REC-4009', companyKey: 'cbtl',          priority: '2 - Moderate', reference: 'SAP-88800', remarks: 'Delivery to BGC flagship store. Building access via Tower 1.',           status: 'SCHEDULED',    vehicle: 'Van-01 (L300)',               area: 'BGC (Taguig)',             driver: '',  driverAssistants: '[]',  accountManager: 'D. Macaraeg',   deliveryDate: '2026-07-17', category: 'DELIVERY',              itemType: 'Medium Item',    draft: false, dateAndTime: '2026-07-17T10:00:00', itemDescription: '3x UTK-TAB10, 3x UTK-STD-ROT, 3x UTK-PRN-TH80', collectionVerified: false, createdBy: sales, modifiedBy: sales },
    { id: 'REC-4010', companyKey: 'kfc',            priority: '3 - High',     reference: 'SAP-88820', remarks: 'KFC Ortigas cluster rollout — coordinate with mall management.',         status: 'SCHEDULED',    vehicle: 'Truck-A (6-Wheeler)',         area: 'Ortigas Center (Pasig)',   driver: '',  driverAssistants: '[]',  accountManager: 'P. Soriano',    deliveryDate: '2026-07-18', category: 'DELIVERY',              itemType: 'Large / Pallet', draft: false, dateAndTime: '2026-07-18T08:00:00', itemDescription: '8x UTK-PRN-TH80, 8x UTK-DRW-HVY, 8x UTK-SCN-2D', collectionVerified: false, createdBy: sales, modifiedBy: sales },
    { id: 'REC-4011', companyKey: 'manginasal',     priority: '2 - Moderate', reference: 'SAP-88840', remarks: 'QC Diliman cluster — 15-store simultaneous rollout.',                    status: 'SCHEDULED',    vehicle: 'Truck-B (10-Wheeler)',        area: 'Quezon City - Diliman',    driver: '',  driverAssistants: '[]',  accountManager: 'R. Pagkalinawan', deliveryDate: '2026-07-19', category: 'DELIVERY',            itemType: 'Large / Pallet', draft: false, dateAndTime: '2026-07-19T07:30:00', itemDescription: '15x UTK-TAB08, 15x UTK-ACC-ROLL, 15x UTK-STY-PEN', collectionVerified: false, createdBy: sales, modifiedBy: sales },
    { id: 'REC-4012', companyKey: 'potatocorner',   priority: '1 - Low',      reference: 'SAP-88855', remarks: 'Shaw Blvd franchise group — collect old hardware for trade-in.',         status: 'SCHEDULED',    vehicle: 'Van-01 (L300)',               area: 'Mandaluyong',              driver: '',  driverAssistants: '[]',  accountManager: 'C. Lim',        deliveryDate: '2026-07-20', category: 'DELIVERY',              itemType: 'Medium Item',    draft: false, dateAndTime: '2026-07-20T10:00:00', itemDescription: '10x UTK-SCN-HND, 10x UTK-STD-FXD, 5x UTK-ACC-PWR', collectionVerified: false, createdBy: sales, modifiedBy: sales },
    { id: 'REC-4013', companyKey: 'rosepharmacy',   priority: '2 - Moderate', reference: 'SAP-88870', remarks: 'Cebu Mandaue distribution hub. Overnight freight from Manila.',          status: 'SCHEDULED',    vehicle: 'Truck-A (6-Wheeler)',         area: 'Mandaue City, Cebu',       driver: '',  driverAssistants: '[]',  accountManager: 'F. Valenzuela', deliveryDate: '2026-07-21', category: 'DELIVERY',              itemType: 'Large / Pallet', draft: false, dateAndTime: '2026-07-21T09:00:00', itemDescription: '6x UTK-CARD-RDR, 6x UTK-RFID-TAG, 6x UTK-PRN-TH80', collectionVerified: false, createdBy: sales, modifiedBy: sales },
    { id: 'REC-4014', companyKey: 'robinsons',      priority: '1 - Low',      reference: 'SAP-88890', remarks: '',                                                                       status: 'SCHEDULED',    vehicle: 'Van-01 (L300)',               area: 'Manila - Ermita',          driver: '',  driverAssistants: '[]',  accountManager: 'A. Santos',     deliveryDate: '2026-07-22', category: 'DELIVERY',              itemType: 'Small Item',     draft: false, dateAndTime: '2026-07-22T11:00:00', itemDescription: '20x UTK-ACC-ROLL58, 20x UTK-STY-PAS', collectionVerified: false, createdBy: sales, modifiedBy: sales },

    // ── DELIVERY — PENDING (5) ────────────────────────────────────────────────
    { id: 'REC-4015', companyKey: 'watsons',        priority: '2 - Moderate', reference: 'SAP-88910', remarks: 'Awaiting warehouse slot confirmation from client.',                      status: 'PENDING',      vehicle: '(None)',                      area: 'Pasay',                    driver: '',  driverAssistants: '[]',  accountManager: 'D. Macaraeg',   deliveryDate: '2026-07-17', category: 'DELIVERY',              itemType: 'Medium Item',    draft: false, dateAndTime: '2026-07-17T10:00:00', itemDescription: '4x UTK-TAB10, 4x UTK-PRN-TH80, 4x UTK-DRW-HVY', collectionVerified: false, createdBy: sales, modifiedBy: sales },
    { id: 'REC-4016', companyKey: 'gerrys',         priority: '2 - Moderate', reference: 'SAP-88930', remarks: 'Client busy with audit. Delivery reschooleld to next available.',        status: 'PENDING',      vehicle: '(None)',                      area: 'Quezon City - Diliman',    driver: '',  driverAssistants: '[]',  accountManager: 'P. Soriano',    deliveryDate: '2026-07-18', category: 'DELIVERY',              itemType: 'Small Item',     draft: false, dateAndTime: '2026-07-18T14:00:00', itemDescription: '10x UTK-PRN-TH58, 10x UTK-STD-ROT', collectionVerified: false, createdBy: sales, modifiedBy: sales },
    { id: 'REC-4017', companyKey: 'maxs',           priority: '1 - Low',      reference: 'SAP-88945', remarks: '',                                                                       status: 'PENDING',      vehicle: '(None)',                      area: 'Quezon City - Fairview',   driver: '',  driverAssistants: '[]',  accountManager: 'R. Pagkalinawan', deliveryDate: '2026-07-19', category: 'DELIVERY',            itemType: 'Small Item',     draft: false, dateAndTime: '2026-07-19T10:00:00', itemDescription: '5x UTK-DISP-VFD, 5x UTK-KBD-BT', collectionVerified: false, createdBy: sales, modifiedBy: sales },
    { id: 'REC-4018', companyKey: 'serenitea',      priority: '2 - Moderate', reference: 'SAP-88960', remarks: 'Oranbo HQ receiving — confirm contact person on arrival.',               status: 'PENDING',      vehicle: '(None)',                      area: 'Pasig - Kapitolyo',        driver: '',  driverAssistants: '[]',  accountManager: 'C. Lim',        deliveryDate: '2026-07-20', category: 'DELIVERY',              itemType: 'Small Item',     draft: false, dateAndTime: '2026-07-20T11:00:00', itemDescription: '8x UTK-TAB08, 8x UTK-ACC-ROLL58, 8x UTK-STY-PEN', collectionVerified: false, createdBy: sales, modifiedBy: sales },
    { id: 'REC-4019', companyKey: 'boscoffee',      priority: '1 - Low',      reference: 'SAP-88975', remarks: 'Cebu City Bo\'s cluster. Coordinate with Visayas operations team.',     status: 'PENDING',      vehicle: '(None)',                      area: 'Cebu City',                driver: '',  driverAssistants: '[]',  accountManager: 'F. Valenzuela', deliveryDate: '2026-07-21', category: 'DELIVERY',              itemType: 'Small Item',     draft: false, dateAndTime: '2026-07-21T13:00:00', itemDescription: '3x UTK-CARD-RDR, 3x UTK-RFID-TAG, 3x UTK-PRN-TH58', collectionVerified: false, createdBy: sales, modifiedBy: sales },

    // ── DELIVERY — ON_HOLD (3) ────────────────────────────────────────────────
    { id: 'REC-4020', companyKey: 'pizzahut',       priority: '2 - Moderate', reference: 'SAP-88990', remarks: 'On hold — client warehouse undergoing renovation. Resume ETA: Jul 28.', status: 'ON_HOLD',      vehicle: '(None)',                      area: 'BGC (Taguig)',             driver: '',  driverAssistants: '[]',  accountManager: 'D. Macaraeg',   deliveryDate: '2026-07-10', category: 'DELIVERY',              itemType: 'Medium Item',    draft: false, dateAndTime: '2026-07-10T09:00:00', itemDescription: '6x UTK-TAB10, 6x UTK-STD-ROT', collectionVerified: false, createdBy: sales, modifiedBy: sales },
    { id: 'REC-4021', companyKey: 'armynavy',       priority: '3 - High',     reference: 'SAP-89005', remarks: 'Hold — awaiting billing dept clearance before delivery proceeds.',        status: 'ON_HOLD',      vehicle: '(None)',                      area: 'Makati CBD',               driver: '',  driverAssistants: '[]',  accountManager: 'A. Santos',     deliveryDate: '2026-07-12', category: 'DELIVERY',              itemType: 'Small Item',     draft: false, dateAndTime: '2026-07-12T10:00:00', itemDescription: '4x UTK-PRN-TH80, 4x UTK-DRW-MED', collectionVerified: false, createdBy: sales, modifiedBy: sales },
    { id: 'REC-4022', companyKey: 'seven11',        priority: '1 - Low',      reference: 'SAP-89020', remarks: 'Import documentation review pending — customs released items delayed.',   status: 'ON_HOLD',      vehicle: '(None)',                      area: 'Pasig - Kapitolyo',        driver: '',  driverAssistants: '[]',  accountManager: 'C. Lim',        deliveryDate: '2026-07-14', category: 'DELIVERY',              itemType: 'Large / Pallet', draft: false, dateAndTime: '2026-07-14T08:00:00', itemDescription: '20x UTK-STD-FXD, 20x UTK-KBD-BT', collectionVerified: false, createdBy: sales, modifiedBy: sales },

    // ── DELIVERY — RESCHEDULED (3) ────────────────────────────────────────────
    { id: 'REC-4023', companyKey: 'pancakehouse',   priority: '1 - Low',      reference: 'SAP-89040', remarks: 'Client rescheduled — building management blocked loading bay Jul 8.',    status: 'RESCHEDULED',  vehicle: '(None)',                      area: 'Quezon City - Diliman',    driver: '',  driverAssistants: '[]',  accountManager: 'P. Soriano',    deliveryDate: '2026-07-08', category: 'DELIVERY',              itemType: 'Small Item',     draft: false, dateAndTime: '2026-07-08T09:00:00', itemDescription: '5x UTK-TAB08, 5x UTK-PRN-TH58', collectionVerified: false, createdBy: sales, modifiedBy: sales },
    { id: 'REC-4024', companyKey: 'contis',         priority: '2 - Moderate', reference: 'SAP-89055', remarks: 'Client requested AM delivery but vehicle unavailable — rescheduled.',    status: 'RESCHEDULED',  vehicle: '(None)',                      area: 'Parañaque',                driver: '',  driverAssistants: '[]',  accountManager: 'R. Pagkalinawan', deliveryDate: '2026-07-09', category: 'DELIVERY',            itemType: 'Medium Item',    draft: false, dateAndTime: '2026-07-09T09:00:00', itemDescription: '3x UTK-PRN-TH80, 3x UTK-DRW-HVY', collectionVerified: false, createdBy: sales, modifiedBy: sales },
    { id: 'REC-4025', companyKey: 'marygrace',      priority: '2 - Moderate', reference: 'SAP-89070', remarks: 'Shangri-La loading bay blocked — rescheduled to Jul 23.',                status: 'RESCHEDULED',  vehicle: '(None)',                      area: 'Mandaluyong',              driver: '',  driverAssistants: '[]',  accountManager: 'D. Macaraeg',   deliveryDate: '2026-07-11', category: 'DELIVERY',              itemType: 'Small Item',     draft: false, dateAndTime: '2026-07-11T10:00:00', itemDescription: '8x UTK-SCN-HND, 8x UTK-STY-PEN', collectionVerified: false, createdBy: sales, modifiedBy: sales },

    // ── RMA — ACCOMPLISHED (5) ────────────────────────────────────────────────
    { id: 'REC-4101', companyKey: 'jollibee',       priority: '3 - High',     reference: 'SAP-RMA-3001', remarks: 'Pull-out UTK-PRN-TH80 dead pixel — replacement delivered same visit.',  status: 'ACCOMPLISHED', vehicle: 'Motorcycle-01 (Express)', area: 'Quezon City - Fairview',   driver: D1, driverAssistants: '[]',  accountManager: 'P. Soriano',    deliveryDate: '2026-04-18', category: 'RMA',                   itemType: 'Small Item',     draft: false, dateAndTime: '2026-04-18T11:00:00', itemDescription: '1x UTK-PRN-TH80 defective pull-out + 1x replacement drop-off', collectionVerified: false, createdBy: sales, modifiedBy: logistics },
    { id: 'REC-4102', companyKey: 'mcdo',           priority: '3 - High',     reference: 'SAP-RMA-3020', remarks: 'Screen crack on 2 units — covered by 12-month warranty.',              status: 'ACCOMPLISHED', vehicle: 'Van-01 (L300)',          area: 'Makati CBD',               driver: D2, driverAssistants: A3 ? JSON.stringify([A3]) : '[]', accountManager: 'D. Macaraeg',   deliveryDate: '2026-05-02', category: 'RMA',                   itemType: 'Small Item',     draft: false, dateAndTime: '2026-05-02T10:00:00', itemDescription: '2x UTK-TAB10 cracked screen pull-out, 2x replacements', collectionVerified: false, createdBy: sales, modifiedBy: logistics },
    { id: 'REC-4103', companyKey: 'mercury',        priority: '2 - Moderate', reference: 'SAP-RMA-3045', remarks: 'Scanner non-responsive after firmware update. Exchange unit.',          status: 'ACCOMPLISHED', vehicle: 'Motorcycle-01 (Express)', area: 'Makati CBD',               driver: D3, driverAssistants: '[]',  accountManager: 'F. Valenzuela', deliveryDate: '2026-05-20', category: 'RMA',                   itemType: 'Small Item',     draft: false, dateAndTime: '2026-05-20T13:00:00', itemDescription: '1x UTK-SCN-2D non-responsive, swap completed', collectionVerified: false, createdBy: sales, modifiedBy: logistics },
    { id: 'REC-4104', companyKey: 'smretail',       priority: '2 - Moderate', reference: 'SAP-RMA-3060', remarks: '3 drawers with broken locks from Bicutan store. Repair or replace.',   status: 'ACCOMPLISHED', vehicle: 'Van-01 (L300)',          area: 'Parañaque',                driver: D1, driverAssistants: A2 ? JSON.stringify([A2]) : '[]', accountManager: 'P. Soriano',    deliveryDate: '2026-06-05', category: 'RMA',                   itemType: 'Small Item',     draft: false, dateAndTime: '2026-06-05T10:00:00', itemDescription: '3x UTK-DRW-MED broken lock mechanism pull-out', collectionVerified: false, createdBy: sales, modifiedBy: logistics },
    { id: 'REC-4105', companyKey: 'chowking',       priority: '2 - Moderate', reference: 'SAP-RMA-3080', remarks: 'LTE router connectivity drops — factory reset and return.',             status: 'ACCOMPLISHED', vehicle: 'Motorcycle-01 (Express)', area: 'Manila - Malate',          driver: D2, driverAssistants: '[]',  accountManager: 'D. Macaraeg',   deliveryDate: '2026-06-20', category: 'RMA',                   itemType: 'Small Item',     draft: false, dateAndTime: '2026-06-20T14:00:00', itemDescription: '1x UTK-LTE-RTR connectivity issue — pull-out for diagnostics', collectionVerified: false, createdBy: sales, modifiedBy: logistics },

    // ── RMA — SCHEDULED (4) ───────────────────────────────────────────────────
    { id: 'REC-4106', companyKey: 'cbtl',           priority: '2 - Moderate', reference: 'SAP-RMA-3100', remarks: 'Card reader intermittent tap failures after 3 months use.',             status: 'SCHEDULED',    vehicle: 'Motorcycle-01 (Express)', area: 'BGC (Taguig)',             driver: '',  driverAssistants: '[]',  accountManager: 'D. Macaraeg',   deliveryDate: '2026-07-17', category: 'RMA',                   itemType: 'Small Item',     draft: false, dateAndTime: '2026-07-17T14:00:00', itemDescription: '1x UTK-CARD-RDR intermittent NFC failure — swap', collectionVerified: false, createdBy: sales, modifiedBy: sales },
    { id: 'REC-4107', companyKey: 'kfc',            priority: '2 - Moderate', reference: 'SAP-RMA-3115', remarks: '2 mobile printers not holding charge beyond 2 hours.',                  status: 'SCHEDULED',    vehicle: 'Van-01 (L300)',          area: 'Ortigas Center (Pasig)',   driver: '',  driverAssistants: '[]',  accountManager: 'P. Soriano',    deliveryDate: '2026-07-18', category: 'RMA',                   itemType: 'Small Item',     draft: false, dateAndTime: '2026-07-18T11:00:00', itemDescription: '2x UTK-PRN-TH58 battery degradation pull-out', collectionVerified: false, createdBy: sales, modifiedBy: sales },
    { id: 'REC-4108', companyKey: 'generika',       priority: '1 - Low',      reference: 'SAP-RMA-3130', remarks: 'Tablet display ghost touch reported by cashier team.',                  status: 'SCHEDULED',    vehicle: 'Motorcycle-01 (Express)', area: 'Muntinlupa - Alabang',     driver: '',  driverAssistants: '[]',  accountManager: 'A. Santos',     deliveryDate: '2026-07-19', category: 'RMA',                   itemType: 'Small Item',     draft: false, dateAndTime: '2026-07-19T13:00:00', itemDescription: '1x UTK-TAB08 ghost-touch display fault — pull-out', collectionVerified: false, createdBy: sales, modifiedBy: sales },
    { id: 'REC-4109', companyKey: 'watsons',        priority: '1 - Low',      reference: 'SAP-RMA-3145', remarks: '4 RFID fobs not scanning after 6 months. Batch replacement.',           status: 'SCHEDULED',    vehicle: 'Motorcycle-01 (Express)', area: 'Pasay',                    driver: '',  driverAssistants: '[]',  accountManager: 'C. Lim',        deliveryDate: '2026-07-20', category: 'RMA',                   itemType: 'Small Item',     draft: false, dateAndTime: '2026-07-20T14:00:00', itemDescription: '4x UTK-RFID-TAG defective batch pull-out', collectionVerified: false, createdBy: sales, modifiedBy: sales },

    // ── RMA — PENDING (3) ─────────────────────────────────────────────────────
    { id: 'REC-4110', companyKey: 'potatocorner',   priority: '2 - Moderate', reference: 'SAP-RMA-3160', remarks: 'VFD display showing garbled characters after power surge.',             status: 'PENDING',      vehicle: '(None)',                  area: 'Mandaluyong',              driver: '',  driverAssistants: '[]',  accountManager: 'C. Lim',        deliveryDate: '2026-07-18', category: 'RMA',                   itemType: 'Small Item',     draft: false, dateAndTime: '2026-07-18T14:00:00', itemDescription: '1x UTK-DISP-VFD garbled output after power surge', collectionVerified: false, createdBy: sales, modifiedBy: sales },
    { id: 'REC-4111', companyKey: 'gerrys',         priority: '1 - Low',      reference: 'SAP-RMA-3175', remarks: 'Wireless scanners dropped connection after QC store network change.',   status: 'PENDING',      vehicle: '(None)',                  area: 'Quezon City - Diliman',    driver: '',  driverAssistants: '[]',  accountManager: 'P. Soriano',    deliveryDate: '2026-07-19', category: 'RMA',                   itemType: 'Small Item',     draft: false, dateAndTime: '2026-07-19T11:00:00', itemDescription: '2x UTK-SCN-HND wireless drop — diagnostic pull-out', collectionVerified: false, createdBy: sales, modifiedBy: sales },
    { id: 'REC-4112', companyKey: 'rosepharmacy',   priority: '2 - Moderate', reference: 'SAP-RMA-3190', remarks: 'LTE router not connecting to new ISP. Possible config issue.',          status: 'PENDING',      vehicle: '(None)',                  area: 'Cebu City',                driver: '',  driverAssistants: '[]',  accountManager: 'F. Valenzuela', deliveryDate: '2026-07-20', category: 'RMA',                   itemType: 'Small Item',     draft: false, dateAndTime: '2026-07-20T10:00:00', itemDescription: '1x UTK-LTE-RTR ISP config issue — pull-out for re-provisioning', collectionVerified: false, createdBy: sales, modifiedBy: sales },

    // ── RMA — ON_HOLD (2) ─────────────────────────────────────────────────────
    { id: 'REC-4113', companyKey: 'maxs',           priority: '3 - High',     reference: 'SAP-RMA-3200', remarks: 'On hold — awaiting client-submitted inspection report before pull-out.', status: 'ON_HOLD',      vehicle: '(None)',                  area: 'Quezon City - Fairview',   driver: '',  driverAssistants: '[]',  accountManager: 'R. Pagkalinawan', deliveryDate: '2026-07-12', category: 'RMA',                 itemType: 'Small Item',     draft: false, dateAndTime: '2026-07-12T10:00:00', itemDescription: '1x UTK-TAB10 system freeze — awaiting incident report', collectionVerified: false, createdBy: sales, modifiedBy: sales },
    { id: 'REC-4114', companyKey: 'armynavy',       priority: '1 - Low',      reference: 'SAP-RMA-3215', remarks: 'Loose mounting joint — client unsure if installation damage.',           status: 'ON_HOLD',      vehicle: '(None)',                  area: 'Makati CBD',               driver: '',  driverAssistants: '[]',  accountManager: 'A. Santos',     deliveryDate: '2026-07-14', category: 'RMA',                   itemType: 'Small Item',     draft: false, dateAndTime: '2026-07-14T14:00:00', itemDescription: '2x UTK-STD-ROT loose pivot joint', collectionVerified: false, createdBy: sales, modifiedBy: sales },

    // ── RMA — RESCHEDULED (1) ─────────────────────────────────────────────────
    { id: 'REC-4115', companyKey: 'serenitea',      priority: '1 - Low',      reference: 'SAP-RMA-3230', remarks: 'Client store closed for renovation this week — rescheduled to Jul 24.', status: 'RESCHEDULED',  vehicle: '(None)',                  area: 'Pasig - Kapitolyo',        driver: '',  driverAssistants: '[]',  accountManager: 'C. Lim',        deliveryDate: '2026-07-10', category: 'RMA',                   itemType: 'Small Item',     draft: false, dateAndTime: '2026-07-10T11:00:00', itemDescription: '1x UTK-PRN-TH58 battery issue — pull-out rescheduled', collectionVerified: false, createdBy: sales, modifiedBy: sales },

    // ── ACCOUNTING COLLECTION — ACCOMPLISHED (4) ──────────────────────────────
    { id: 'REC-4201', companyKey: 'jollibee',       priority: '2 - Moderate', reference: 'SAP-COLL-4001', remarks: 'PDC collected. Original OR signed by Theresa Alajar.',                  status: 'ACCOMPLISHED', vehicle: 'Motorcycle-01 (Express)', area: 'Quezon City - Fairview',   driver: D1, driverAssistants: '[]',  accountManager: 'P. Soriano',    deliveryDate: '2026-04-25', category: 'ACCOUNTING_COLLECTION', itemType: 'Small Item',     draft: false, dateAndTime: '2026-04-25T10:00:00', itemDescription: 'Collection of OR + PDC for Invoice INV-5001 (₱148,000)', collectionVerified: false, createdBy: sales, modifiedBy: logistics },
    { id: 'REC-4202', companyKey: 'mcdo',           priority: '3 - High',     reference: 'SAP-COLL-4020', remarks: 'Check collected. Deposited same day.',                                   status: 'ACCOMPLISHED', vehicle: 'Motorcycle-01 (Express)', area: 'Makati CBD',               driver: D2, driverAssistants: '[]',  accountManager: 'D. Macaraeg',   deliveryDate: '2026-05-10', category: 'ACCOUNTING_COLLECTION', itemType: 'Small Item',     draft: false, dateAndTime: '2026-05-10T09:00:00', itemDescription: 'Collection of manager\'s check for Invoice INV-5120 (₱224,800)', collectionVerified: false, createdBy: sales, modifiedBy: logistics },
    { id: 'REC-4203', companyKey: 'mercury',        priority: '2 - Moderate', reference: 'SAP-COLL-4040', remarks: 'Billing statement collected. Payment to be remitted via bank.',          status: 'ACCOMPLISHED', vehicle: 'Motorcycle-01 (Express)', area: 'Makati CBD',               driver: D3, driverAssistants: '[]',  accountManager: 'F. Valenzuela', deliveryDate: '2026-06-08', category: 'ACCOUNTING_COLLECTION', itemType: 'Small Item',     draft: false, dateAndTime: '2026-06-08T09:00:00', itemDescription: 'Collection of billing statement + PDC for Invoice INV-5287', collectionVerified: false, createdBy: sales, modifiedBy: logistics },
    { id: 'REC-4204', companyKey: 'chowking',       priority: '2 - Moderate', reference: 'SAP-COLL-4060', remarks: 'Verified — funds cleared. Collection complete.',                         status: 'ACCOMPLISHED', vehicle: 'Motorcycle-01 (Express)', area: 'Manila - Malate',          driver: D1, driverAssistants: '[]',  accountManager: 'D. Macaraeg',   deliveryDate: '2026-07-08', category: 'ACCOUNTING_COLLECTION', itemType: 'Small Item',     draft: false, dateAndTime: '2026-07-08T09:00:00', itemDescription: 'Collection completed for Invoice INV-5410', collectionVerified: false, createdBy: sales, modifiedBy: logistics },

    // ── ACCOUNTING COLLECTION — SCHEDULED (3) ────────────────────────────────
    { id: 'REC-4205', companyKey: 'cbtl',           priority: '2 - Moderate', reference: 'SAP-COLL-4080', remarks: 'Collect signed billing statement + check for INV-5521.',               status: 'SCHEDULED',    vehicle: 'Motorcycle-01 (Express)', area: 'BGC (Taguig)',             driver: '',  driverAssistants: '[]',  accountManager: 'F. Valenzuela', deliveryDate: '2026-07-17', category: 'ACCOUNTING_COLLECTION', itemType: 'Small Item',     draft: false, dateAndTime: '2026-07-17T09:00:00', itemDescription: 'Collection of billing statement + PDC for Invoice INV-5521', collectionVerified: false, createdBy: sales, modifiedBy: sales },
    { id: 'REC-4206', companyKey: 'smretail',       priority: '3 - High',     reference: 'SAP-COLL-4095', remarks: 'Priority collection — large balance outstanding.',                       status: 'SCHEDULED',    vehicle: 'Motorcycle-01 (Express)', area: 'Parañaque',                driver: '',  driverAssistants: '[]',  accountManager: 'P. Soriano',    deliveryDate: '2026-07-18', category: 'ACCOUNTING_COLLECTION', itemType: 'Small Item',     draft: false, dateAndTime: '2026-07-18T10:00:00', itemDescription: 'Collection for Invoice INV-5530 (₱312,500)', collectionVerified: false, createdBy: sales, modifiedBy: sales },
    { id: 'REC-4207', companyKey: 'kfc',            priority: '2 - Moderate', reference: 'SAP-COLL-4110', remarks: 'Finance contact: Yolanda Bautista. Call 1 hour before.',                 status: 'SCHEDULED',    vehicle: 'Motorcycle-01 (Express)', area: 'Ortigas Center (Pasig)',   driver: '',  driverAssistants: '[]',  accountManager: 'R. Pagkalinawan', deliveryDate: '2026-07-19', category: 'ACCOUNTING_COLLECTION', itemType: 'Small Item',     draft: false, dateAndTime: '2026-07-19T09:00:00', itemDescription: 'Collection for Invoice INV-5545', collectionVerified: false, createdBy: sales, modifiedBy: sales },

    // ── ACCOUNTING COLLECTION — PENDING (2) ──────────────────────────────────
    { id: 'REC-4208', companyKey: 'watsons',        priority: '2 - Moderate', reference: 'SAP-COLL-4125', remarks: 'Finance team confirmed availability window 10AM-12NN.',                 status: 'PENDING',      vehicle: '(None)',                  area: 'Pasay',                    driver: '',  driverAssistants: '[]',  accountManager: 'D. Macaraeg',   deliveryDate: '2026-07-17', category: 'ACCOUNTING_COLLECTION', itemType: 'Small Item',     draft: false, dateAndTime: '2026-07-17T10:00:00', itemDescription: 'Collection of OR acknowledgement for Invoice INV-5560', collectionVerified: false, createdBy: sales, modifiedBy: sales },
    { id: 'REC-4209', companyKey: 'generika',       priority: '1 - Low',      reference: 'SAP-COLL-4140', remarks: '',                                                                        status: 'PENDING',      vehicle: '(None)',                  area: 'Muntinlupa - Alabang',     driver: '',  driverAssistants: '[]',  accountManager: 'A. Santos',     deliveryDate: '2026-07-18', category: 'ACCOUNTING_COLLECTION', itemType: 'Small Item',     draft: false, dateAndTime: '2026-07-18T10:00:00', itemDescription: 'Collection for Invoice INV-5572', collectionVerified: false, createdBy: sales, modifiedBy: sales },

    // ── ACCOUNTING COLLECTION — RESCHEDULED (1) ───────────────────────────────
    { id: 'REC-4210', companyKey: 'potatocorner',   priority: '3 - High',     reference: 'SAP-COLL-4155', remarks: 'Account 45+ days overdue. Rescheduled after client requested extension.',status: 'RESCHEDULED',  vehicle: '(None)',                  area: 'Mandaluyong',              driver: '',  driverAssistants: '[]',  accountManager: 'P. Soriano',    deliveryDate: '2026-07-14', category: 'ACCOUNTING_COLLECTION', itemType: 'Small Item',     draft: false, dateAndTime: '2026-07-14T09:00:00', itemDescription: 'Collection for overdue Invoice INV-5480', collectionVerified: false, createdBy: sales, modifiedBy: sales },

    // ── PROCUREMENT PICK-UP — ACCOMPLISHED (2) ────────────────────────────────
    { id: 'REC-4301', companyKey: 'techvantage',    priority: '3 - High',     reference: 'SAP-PU-9101', remarks: 'Full pallet — 50 units UTK-TAB10. Cold-storage bay 2.',                 status: 'ACCOMPLISHED', vehicle: 'Truck-A (6-Wheeler)',     area: 'Quezon City - Balintawak', driver: D1, driverAssistants: A1 ? JSON.stringify([A1]) : '[]', accountManager: 'R. Pagkalinawan', deliveryDate: '2026-04-20', category: 'PROCUREMENT_PICKUP',    itemType: 'Large / Pallet', draft: false, dateAndTime: '2026-04-20T07:00:00', itemDescription: 'Pick-up 50x UTK-TAB10 from TechVantage Manila Distribution', collectionVerified: false, createdBy: sales, modifiedBy: logistics },
    { id: 'REC-4302', companyKey: 'techvantage',    priority: '2 - Moderate', reference: 'SAP-PU-9120', remarks: 'Separate trucks needed for 2 SKUs. Coordinate with warehouse staff.',    status: 'ACCOMPLISHED', vehicle: 'Truck-B (10-Wheeler)',    area: 'Quezon City - Balintawak', driver: D2, driverAssistants: A2 ? JSON.stringify([A2]) : '[]', accountManager: 'R. Pagkalinawan', deliveryDate: '2026-05-15', category: 'PROCUREMENT_PICKUP',    itemType: 'Large / Pallet', draft: false, dateAndTime: '2026-05-15T07:30:00', itemDescription: 'Pick-up 100x UTK-STD-ROT + 50x UTK-ACC-ROLL', collectionVerified: false, createdBy: sales, modifiedBy: logistics },

    // ── PROCUREMENT PICK-UP — SCHEDULED (2) ──────────────────────────────────
    { id: 'REC-4303', companyKey: 'techvantage',    priority: '2 - Moderate', reference: 'SAP-PU-9140', remarks: 'Pick up replenishment batch for UTK-TAB08 low stock.',                   status: 'SCHEDULED',    vehicle: 'Truck-A (6-Wheeler)',     area: 'Quezon City - Balintawak', driver: '',  driverAssistants: '[]',  accountManager: 'R. Pagkalinawan', deliveryDate: '2026-07-17', category: 'PROCUREMENT_PICKUP',    itemType: 'Large / Pallet', draft: false, dateAndTime: '2026-07-17T07:00:00', itemDescription: 'Pick-up 30x UTK-TAB08 from TechVantage Manila Distribution', collectionVerified: false, createdBy: sales, modifiedBy: sales },
    { id: 'REC-4304', companyKey: 'techvantage',    priority: '2 - Moderate', reference: 'SAP-PU-9155', remarks: 'Thermal printer batch for July rollouts.',                                status: 'SCHEDULED',    vehicle: 'Truck-A (6-Wheeler)',     area: 'Quezon City - Balintawak', driver: '',  driverAssistants: '[]',  accountManager: 'R. Pagkalinawan', deliveryDate: '2026-07-22', category: 'PROCUREMENT_PICKUP',    itemType: 'Large / Pallet', draft: false, dateAndTime: '2026-07-22T07:00:00', itemDescription: 'Pick-up 50x UTK-PRN-TH80 from TechVantage Manila Distribution', collectionVerified: false, createdBy: sales, modifiedBy: sales },

    // ── PROCUREMENT PICK-UP — PENDING (1) ────────────────────────────────────
    { id: 'REC-4305', companyKey: 'techvantage',    priority: '1 - Low',      reference: 'SAP-PU-9170', remarks: 'Card reader restock — awaiting PO sign-off.',                            status: 'PENDING',      vehicle: '(None)',                  area: 'Quezon City - Balintawak', driver: '',  driverAssistants: '[]',  accountManager: 'R. Pagkalinawan', deliveryDate: '2026-07-25', category: 'PROCUREMENT_PICKUP',    itemType: 'Medium Item',    draft: false, dateAndTime: '2026-07-25T08:00:00', itemDescription: 'Pick-up 20x UTK-CARD-RDR from TechVantage Manila Distribution', collectionVerified: false, createdBy: sales, modifiedBy: sales },

    // ── SALES ORDERS — ACCOMPLISHED (2) ──────────────────────────────────────
    { id: 'REC-4401', companyKey: 'cbtl',           priority: '2 - Moderate', reference: 'SAP-SO-3001', remarks: 'B2B order fulfilled. Invoice INV-5001 raised.',                          status: 'ACCOMPLISHED', vehicle: 'Van-01 (L300)',          area: 'BGC (Taguig)',             driver: D1, driverAssistants: A1 ? JSON.stringify([A1]) : '[]', accountManager: 'D. Macaraeg',   deliveryDate: '2026-04-28', category: 'SALES_ORDERS',          itemType: 'Medium Item',    draft: false, dateAndTime: '2026-04-28T10:00:00', itemDescription: '5x UTK-TAB08, 5x UTK-PRN-TH58, 5x UTK-STD-FXD', collectionVerified: false, createdBy: sales, modifiedBy: logistics },
    { id: 'REC-4402', companyKey: 'gerrys',         priority: '2 - Moderate', reference: 'SAP-SO-3020', remarks: 'QC Tomas Morato cluster — 8 POS counters configured.',                   status: 'ACCOMPLISHED', vehicle: 'Truck-A (6-Wheeler)',    area: 'Quezon City - Diliman',    driver: D2, driverAssistants: A3 ? JSON.stringify([A3]) : '[]', accountManager: 'P. Soriano',    deliveryDate: '2026-05-22', category: 'SALES_ORDERS',          itemType: 'Large / Pallet', draft: false, dateAndTime: '2026-05-22T08:00:00', itemDescription: '8x UTK-PRN-TH80, 8x UTK-DRW-HVY, 8x UTK-SCN-2D', collectionVerified: false, createdBy: sales, modifiedBy: logistics },

    // ── SALES ORDERS — SCHEDULED (2) ─────────────────────────────────────────
    { id: 'REC-4403', companyKey: 'robinsons',      priority: '2 - Moderate', reference: 'SAP-SO-3040', remarks: 'Robinsons Ermita refurbish — confirm receiving contact before delivery.', status: 'SCHEDULED',    vehicle: 'Truck-A (6-Wheeler)',    area: 'Manila - Ermita',          driver: '',  driverAssistants: '[]',  accountManager: 'A. Santos',     deliveryDate: '2026-07-18', category: 'SALES_ORDERS',          itemType: 'Large / Pallet', draft: false, dateAndTime: '2026-07-18T09:00:00', itemDescription: '10x UTK-TAB10, 10x UTK-STD-ROT, 10x UTK-PRN-TH80', collectionVerified: false, createdBy: sales, modifiedBy: sales },
    { id: 'REC-4404', companyKey: 'puregold',       priority: '2 - Moderate', reference: 'SAP-SO-3055', remarks: '',                                                                        status: 'SCHEDULED',    vehicle: 'Truck-B (10-Wheeler)',   area: 'Manila - Binondo',         driver: '',  driverAssistants: '[]',  accountManager: 'F. Valenzuela', deliveryDate: '2026-07-20', category: 'SALES_ORDERS',          itemType: 'Large / Pallet', draft: false, dateAndTime: '2026-07-20T08:00:00', itemDescription: '15x UTK-PRN-TH80, 15x UTK-DRW-HVY, 15x UTK-SCN-HND', collectionVerified: false, createdBy: sales, modifiedBy: sales },

    // ── SALES ORDERS — PENDING (1) ───────────────────────────────────────────
    { id: 'REC-4405', companyKey: 'seven11',        priority: '1 - Low',      reference: 'SAP-SO-3070', remarks: 'High-volume consumables order for 7-Eleven Pasig cluster.',              status: 'PENDING',      vehicle: '(None)',                 area: 'Pasig - Kapitolyo',        driver: '',  driverAssistants: '[]',  accountManager: 'C. Lim',        deliveryDate: '2026-07-19', category: 'SALES_ORDERS',          itemType: 'Large / Pallet', draft: false, dateAndTime: '2026-07-19T10:00:00', itemDescription: '50x UTK-RFID-TAG, 50x UTK-ACC-ROLL, 30x UTK-STY-PAS', collectionVerified: false, createdBy: sales, modifiedBy: sales }
  ];

  for (const r of records) {
    const company = companies[r.companyKey];
    await prisma.deliveryRecord.create({
      data: {
        id:                 r.id,
        companyId:          company.id,
        priority:           r.priority,
        reference:          r.reference,
        remarks:            r.remarks,
        status:             r.status as any,
        vehicle:            r.vehicle,
        area:               r.area,
        driver:             r.driver,
        driverAssistants:    r.driverAssistants,
        accountManager:     r.accountManager,
        deliveryDate:       r.deliveryDate,
        category:           r.category as any,
        itemType:           r.itemType,
        draft:              r.draft,
        dateAndTime:        r.dateAndTime,
        itemDescription:    r.itemDescription,
        collectionVerified: r.collectionVerified,
        createdById:        r.createdBy.id,
        modifiedById:       r.modifiedBy.id
      }
    });
  }

  console.log(`Seed complete: ${USERS.length} users, ${COMPANIES.length} companies, ${records.length} delivery records.`);
  await seedSkus(sales.id);
}

if (require.main === module) {
  runSeed()
    .catch(e => { console.error(e); process.exit(1); })
    .finally(async () => { await prisma.$disconnect(); });
}
