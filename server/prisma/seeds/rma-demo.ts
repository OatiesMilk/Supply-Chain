import type { Prisma } from '@prisma/client';
import { RMA_CATEGORY_META, syncLegacyContactSnapshot, type RmaCategory, type RmaSlipPrefix } from '../../src/services/rmaRules';
import { formatRmaReference } from '../../src/services/rmaReference';
import type { RmaMovement } from '../../src/services/rmaMovement';

/**
 * Canonical curated RMA demo set (REC-4101..REC-4115), shared by the local
 * full seed (seed.ts) and the guarded staging RMA demo refresh
 * (seed-staging-rma-demo.ts). Every row is built to pass the current server
 * RMA rules; server/tests/rmaSeedValidation.test.ts runs each one through them.
 *
 * Delivery dates and completed-history timestamps are fixed in 2026-04..2026-07.
 * Open-stage timestamps (submission, transport start/completion, receipt) are
 * relative to `now`, so they are always in the past and keep the dashboard aging
 * queue deterministic: aging rows are 10-12 days old, other open rows ~2 days.
 */

/** Preferred seeded Driver/Helper profile names (prisma/seeds/drivers.ts). */
export const RMA_DEMO_PEOPLE = {
  D1: 'Manny Santos', D2: 'Ronald de la Cruz', D3: 'Lando Navarro',
  A2: 'Bong Alvarez', A3: 'Ricky Mendoza',
} as const;

/**
 * Company names (prisma/seeds/accounts.ts COMPANIES) of the keys used below.
 * Kept here so the staging loader never imports the seed account module, which
 * loads the database client. The PostgreSQL rehearsal checks they still match.
 */
export const RMA_DEMO_COMPANY_NAMES: Readonly<Record<string, string>> = {
  jollibee: 'Jollibee Foods Corp. - Quezon City Cluster',
  mercury: 'Mercury Drug Corporation - Head Office',
  cbtl: 'The Coffee Bean & Tea Leaf (CBTL PH)',
  chowking: 'Chowking Foods Corp. - South Manila Area',
  mcdo: "McDonald's Philippines (Golden Arches Dev't Corp)",
  kfc: 'KFC Philippines (Lotte GRS Philippines Inc.)',
  potatocorner: 'Potato Corner Franchise Group (Manila)',
  gerrys: "Gerry's Grill Restaurant Group Inc.",
  maxs: "Max's Restaurant Group Inc.",
  armynavy: 'Army Navy Burger Burrito PH',
  serenitea: 'Serenitea Milktea House (Manila HQ)',
  smretail: 'SM Retail Inc. - Department Store Division',
  generika: 'Generika Drugstore Head Office',
  rosepharmacy: 'Rose Pharmacy (Medilink Health Corp.)',
  watsons: 'Watsons Personal Care Stores PH',
};

type TransportStatus ='PENDING' | 'IN_TRANSIT' | 'COMPLETED';
type Status = 'ACCOMPLISHED' | 'SCHEDULED' | 'PENDING' | 'ON_HOLD' | 'RESCHEDULED';
export interface RmaDemoContact { name: string; phone?: string; email?: string }
export interface RmaDemoItem {
  sku: string; quantity: number; unitType: 'Unit' | 'Item';
  serialNumber?: string; newSerialNumber?: string; defectiveSerialNumber?: string;
  purchaseDate?: string; salesOrderNo?: string; accessories?: string;
  problemDescription?: string; repairNote?: string; statusTag?: string;
}
/** Open-stage times, in hours before `now`. */
interface RelativeStages { submitted: number; started?: number; transportCompleted?: number; received?: number }
/** Completed history, as Manila (+08:00) ISO timestamps. */
interface FixedStages { submitted: string; started?: string; transportCompleted?: string; received: string; completed: string }

export interface RmaDemoSpec {
  id: string; companyKey: string; priority: '1 - Low' | '2 - Moderate' | '3 - High';
  legacySapReference: string; remarks: string; status: Status;
  area: string; accountManager: string; deliveryDate: string; itemType: 'Small Item' | 'Unit';
  itemDescription: string; rmaType: RmaCategory; isInternalTransfer?: boolean;
  rmaMovement: RmaMovement; rmaTransportStatus: TransportStatus | null;
  /** Only on Logistics transport rows that have a Driver assigned. */
  driver?: string; assistant?: string; vehicle?: string; transportReceivedBy?: string;
  recipient?: string;
  caseNumber: string; serviceSlipNo?: string; clientRemarks: string; internalLogisticsRemarks?: string;
  contacts: RmaDemoContact[]; items: RmaDemoItem[];
  stages: RelativeStages | FixedStages;
}

const { D1, D2, D3, A2, A3 } = RMA_DEMO_PEOPLE;

export const RMA_DEMO_SPECS: readonly RmaDemoSpec[] = [
  // ── Completed (ACCOMPLISHED) ───────────────────────────────────────────────
  {
    id: 'REC-4101', companyKey: 'jollibee', priority: '3 - High', legacySapReference: 'SAP-RMA-3001',
    remarks: 'Pull-out UTK-PRN-TH80 dead pixel — replacement delivered same visit.', status: 'ACCOMPLISHED',
    area: 'Quezon City - Fairview', accountManager: 'P. Soriano', deliveryDate: '2026-04-18', itemType: 'Small Item',
    itemDescription: '1x UTK-PRN-TH80 defective pull-out + 1x replacement drop-off',
    rmaType: 'Pull Out Slip', rmaMovement: 'LOGISTICS_TRANSPORT', rmaTransportStatus: 'COMPLETED',
    driver: D1, vehicle: 'Motorcycle-01 (Express)', transportReceivedBy: 'Maria Dela Cruz', recipient: 'TASS Bench - Ana Cruz',
    caseNumber: 'CAS-31401-A1B2C3', clientRemarks: 'SAP#12019301', internalLogisticsRemarks: 'Call before going.',
    contacts: [{ name: 'Maria Dela Cruz', phone: '+639171234567' }],
    items: [{ sku: 'UTK-PRN-TH80 Thermal Printer', quantity: 1, unitType: 'Unit', serialNumber: 'TH80-SN-0001', purchaseDate: '2025-11-03',
      salesOrderNo: '12019301', accessories: 'Power Adaptor', problemDescription: 'Dead pixel on print head', statusTag: 'For Pull Out' }],
    stages: { submitted: '2026-04-17T10:00:00+08:00', started: '2026-04-18T09:00:00+08:00', transportCompleted: '2026-04-18T11:30:00+08:00',
      received: '2026-04-18T15:00:00+08:00', completed: '2026-04-19T10:00:00+08:00' },
  },
  {
    // E2E contract (e2e/seeded/rma-form-fields.spec.ts): keep these RTC form values unchanged.
    id: 'REC-4102', companyKey: 'mcdo', priority: '3 - High', legacySapReference: 'SAP-RMA-3020',
    remarks: 'Screen crack on 2 units — covered by 12-month warranty.', status: 'ACCOMPLISHED',
    area: 'Makati CBD', accountManager: 'D. Macaraeg', deliveryDate: '2026-05-02', itemType: 'Small Item',
    itemDescription: '2x UTK-TAB10 cracked screen pull-out, 2x replacements',
    rmaType: 'Return to Customer Slip', rmaMovement: 'LOGISTICS_TRANSPORT', rmaTransportStatus: 'COMPLETED',
    driver: D2, assistant: A3, vehicle: 'Van-01 (L300)', transportReceivedBy: 'Alvin Gatus', recipient: 'Alvin Gatus',
    caseNumber: 'CAS-31417-Y4Y6Z3', serviceSlipNo: 'SS#60142', clientRemarks: 'SAP#12019325',
    internalLogisticsRemarks: 'Note: with collection of Php2,000.00 cash. Please bring CR.',
    contacts: [{ name: 'Alvin Gatus', phone: '+639989765266' }, { name: 'Raymond Oliva' }, { name: 'Jefferson Sualog' }],
    items: [
      { sku: 'UTK-TAB10 Tablet', quantity: 1, unitType: 'Unit', newSerialNumber: 'TAB10-NEW-7781', defectiveSerialNumber: 'TAB10-DEF-5512',
        purchaseDate: '2025-08-14', salesOrderNo: '12019325', repairNote: 'Replacement unit', statusTag: 'UNIT REPAIRED/FOR DELIVERY' },
      { sku: 'Power Adaptor', quantity: 1, unitType: 'Item', statusTag: 'For Return' },
    ],
    stages: { submitted: '2026-05-01T09:30:00+08:00', started: '2026-05-02T08:45:00+08:00', transportCompleted: '2026-05-02T12:10:00+08:00',
      received: '2026-05-02T16:00:00+08:00', completed: '2026-05-04T11:00:00+08:00' },
  },
  {
    id: 'REC-4103', companyKey: 'mercury', priority: '2 - Moderate', legacySapReference: 'SAP-RMA-3045',
    remarks: 'Scanner non-responsive after firmware update. Returned to supplier for exchange.', status: 'ACCOMPLISHED',
    area: 'Makati CBD', accountManager: 'F. Valenzuela', deliveryDate: '2026-05-20', itemType: 'Small Item',
    itemDescription: '1x UTK-SCN-2D non-responsive, supplier exchange completed',
    rmaType: 'Return to Supplier Slip', rmaMovement: 'SUPPLIER_COLLECTION', rmaTransportStatus: null,
    caseNumber: 'CAS-31422-M3N4P5', clientRemarks: 'SAP#12019340', internalLogisticsRemarks: 'Supplier courier collects from the TASS bench.',
    contacts: [{ name: 'Gabriel Sy', phone: '+639178880045', email: 'gabriel.sy@example.com' }],
    items: [{ sku: 'UTK-SCN-2D 2D Barcode Scanner', quantity: 1, unitType: 'Unit', serialNumber: 'SCN2D-SN-4410', purchaseDate: '2025-12-02',
      salesOrderNo: '12019340', problemDescription: 'Unresponsive after firmware 3.2 update', statusTag: 'For Return' }],
    stages: { submitted: '2026-05-19T14:00:00+08:00', received: '2026-05-20T10:15:00+08:00', completed: '2026-05-22T09:00:00+08:00' },
  },
  {
    id: 'REC-4104', companyKey: 'smretail', priority: '2 - Moderate', legacySapReference: 'SAP-RMA-3060',
    remarks: 'Advance replacement for a drawer with a broken lock from Bicutan store.', status: 'ACCOMPLISHED',
    area: 'Parañaque', accountManager: 'P. Soriano', deliveryDate: '2026-06-05', itemType: 'Unit',
    itemDescription: '1x UTK-DRW-MED advance replacement, defective drawer collected',
    rmaType: 'Advance Replacement Slip', rmaMovement: 'LOGISTICS_TRANSPORT', rmaTransportStatus: 'COMPLETED',
    driver: D1, assistant: A2, vehicle: 'Van-01 (L300)', transportReceivedBy: 'Veronica Co', recipient: 'Veronica Co',
    caseNumber: 'CAS-31430-R7S8T9', clientRemarks: 'SAP#12019355', internalLogisticsRemarks: 'Ground-floor loading bay only.',
    contacts: [{ name: 'Veronica Co', phone: '+639175550123' }],
    items: [{ sku: 'UTK-DRW-MED Cash Drawer', quantity: 1, unitType: 'Unit', newSerialNumber: 'DRW-NEW-2208', defectiveSerialNumber: 'DRW-DEF-1907',
      purchaseDate: '2025-10-21', salesOrderNo: '12019355', problemDescription: 'Lock mechanism broken', statusTag: 'For Pull Out' }],
    stages: { submitted: '2026-06-04T09:00:00+08:00', started: '2026-06-05T08:30:00+08:00', transportCompleted: '2026-06-05T13:20:00+08:00',
      received: '2026-06-05T17:00:00+08:00', completed: '2026-06-08T10:30:00+08:00' },
  },
  {
    id: 'REC-4105', companyKey: 'chowking', priority: '2 - Moderate', legacySapReference: 'SAP-RMA-3080',
    remarks: 'LTE router received at the TASS bench for diagnostics — factory reset done.', status: 'ACCOMPLISHED',
    area: 'Manila - Malate', accountManager: 'D. Macaraeg', deliveryDate: '2026-06-20', itemType: 'Small Item',
    itemDescription: '1x UTK-LTE-RTR received for diagnostics',
    rmaType: 'Receiving Slip', rmaMovement: 'INTERNAL_NO_DRIVER', rmaTransportStatus: null,
    caseNumber: 'CAS-31438-U1V2W3', clientRemarks: 'SAP#12019370',
    contacts: [{ name: 'Dante Torres', phone: '+639173331122' }],
    items: [{ sku: 'UTK-LTE-RTR LTE Router', quantity: 1, unitType: 'Unit', serialNumber: 'LTE-SN-8821', purchaseDate: '2026-01-15',
      salesOrderNo: '12019370', problemDescription: 'Connectivity drops every few hours', repairNote: 'Factory reset and firmware reflash', statusTag: 'For Return' }],
    stages: { submitted: '2026-06-19T15:00:00+08:00', received: '2026-06-20T11:00:00+08:00', completed: '2026-06-21T16:00:00+08:00' },
  },
  // ── Open: Logistics requests, in transit, awaiting receipt / completion ────
  {
    id: 'REC-4106', companyKey: 'cbtl', priority: '2 - Moderate', legacySapReference: 'SAP-RMA-3100',
    remarks: 'Internal transfer of a demo card reader to the BGC branch office.', status: 'SCHEDULED',
    area: 'BGC (Taguig)', accountManager: 'D. Macaraeg', deliveryDate: '2026-07-17', itemType: 'Small Item',
    itemDescription: '1x UTK-CARD-RDR internal transfer',
    rmaType: 'Transfer Out Slip', isInternalTransfer: true, rmaMovement: 'LOGISTICS_TRANSPORT', rmaTransportStatus: 'PENDING',
    caseNumber: 'CAS-31455-K9L8M7', clientRemarks: 'Internal transfer - BGC office', internalLogisticsRemarks: 'Hand over to the branch admin only.',
    contacts: [{ name: 'Regine Velasquez', phone: '+639176660987' }],
    items: [{ sku: 'UTK-CARD-RDR NFC Card Reader', quantity: 1, unitType: 'Unit', serialNumber: 'NFC-SN-3301', statusTag: 'For Pick Up' }],
    stages: { submitted: 48 },
  },
  {
    id: 'REC-4107', companyKey: 'kfc', priority: '2 - Moderate', legacySapReference: 'SAP-RMA-3115',
    remarks: 'Returning 2 repaired mobile printers that were not holding charge.', status: 'SCHEDULED',
    area: 'Ortigas Center (Pasig)', accountManager: 'P. Soriano', deliveryDate: '2026-07-18', itemType: 'Small Item',
    itemDescription: '2x UTK-PRN-TH58 battery replacement return',
    rmaType: 'Return to Customer Slip', rmaMovement: 'LOGISTICS_TRANSPORT', rmaTransportStatus: 'IN_TRANSIT',
    driver: D3, vehicle: 'Motorcycle-01 (Express)',
    caseNumber: 'CAS-31460-Q2W3E4', serviceSlipNo: 'SS#60177', clientRemarks: 'SAP#12019388', internalLogisticsRemarks: 'Deliver before 3 PM store cut-off.',
    contacts: [{ name: 'Liza Manalo', phone: '+639174440011' }, { name: 'Paolo Ramos', email: 'paolo.ramos@example.com' }],
    items: [{ sku: 'UTK-PRN-TH58 Mobile Printer', quantity: 2, unitType: 'Unit', newSerialNumber: 'TH58-NEW-0412', defectiveSerialNumber: 'TH58-DEF-0398',
      purchaseDate: '2025-09-30', salesOrderNo: '12019388', repairNote: 'Battery pack replaced', statusTag: 'UNIT REPAIRED/FOR DELIVERY' }],
    stages: { submitted: 50, started: 3 },
  },
  {
    id: 'REC-4108', companyKey: 'generika', priority: '1 - Low', legacySapReference: 'SAP-RMA-3130',
    remarks: 'Tablet with ghost-touch display pulled out; driver has handed it over.', status: 'SCHEDULED',
    area: 'Muntinlupa - Alabang', accountManager: 'A. Santos', deliveryDate: '2026-07-19', itemType: 'Small Item',
    itemDescription: '1x UTK-TAB08 ghost-touch display fault — pull-out',
    rmaType: 'Pull Out Slip', rmaMovement: 'LOGISTICS_TRANSPORT', rmaTransportStatus: 'COMPLETED',
    driver: D1, vehicle: 'Motorcycle-01 (Express)', transportReceivedBy: 'Manuel Lopez',
    caseNumber: 'CAS-31468-Z5X6C7', clientRemarks: 'SAP#12019402', internalLogisticsRemarks: 'Call before going.',
    contacts: [{ name: 'Manuel Lopez', phone: '+639172220456' }],
    items: [{ sku: 'UTK-TAB08 Compact Tablet', quantity: 1, unitType: 'Unit', serialNumber: 'TAB08-SN-6620', purchaseDate: '2026-02-11',
      salesOrderNo: '12019402', problemDescription: 'Ghost touches on the lower screen edge', statusTag: 'For Pull Out' }],
    stages: { submitted: 52, started: 30, transportCompleted: 27 },
  },
  {
    id: 'REC-4109', companyKey: 'watsons', priority: '1 - Low', legacySapReference: 'SAP-RMA-3145',
    remarks: 'Advance replacement of an RFID reader; waiting for a Driver assignment.', status: 'SCHEDULED',
    area: 'Pasay', accountManager: 'C. Lim', deliveryDate: '2026-07-20', itemType: 'Small Item',
    itemDescription: '1x UTK-RFID-RDR advance replacement',
    rmaType: 'Advance Replacement Slip', rmaMovement: 'LOGISTICS_TRANSPORT', rmaTransportStatus: 'PENDING',
    caseNumber: 'CAS-31472-B8N9M0', clientRemarks: 'SAP#12019417',
    contacts: [{ name: 'Carla Lim', phone: '+639179990321' }],
    items: [{ sku: 'UTK-RFID-RDR RFID Reader', quantity: 1, unitType: 'Unit', newSerialNumber: 'RFID-NEW-1150', defectiveSerialNumber: 'RFID-DEF-0987',
      purchaseDate: '2025-12-19', salesOrderNo: '12019417', problemDescription: 'Fobs not scanning', statusTag: 'For Pull Out' }],
    stages: { submitted: 46 },
  },
  {
    id: 'REC-4110', companyKey: 'potatocorner', priority: '2 - Moderate', legacySapReference: 'SAP-RMA-3160',
    remarks: 'Repaired VFD display delivered back to the client; final completion pending.', status: 'PENDING',
    area: 'Mandaluyong', accountManager: 'C. Lim', deliveryDate: '2026-07-18', itemType: 'Small Item',
    itemDescription: '1x UTK-DISP-VFD repaired unit return',
    rmaType: 'Return to Customer Slip', rmaMovement: 'LOGISTICS_TRANSPORT', rmaTransportStatus: 'COMPLETED',
    driver: D2, vehicle: 'Van-01 (L300)', transportReceivedBy: 'Joanna Reyes',
    caseNumber: 'CAS-31479-H1J2K3', serviceSlipNo: 'SS#60191', clientRemarks: 'SAP#12019431', internalLogisticsRemarks: 'Use the mall service entrance.',
    contacts: [{ name: 'Joanna Reyes', phone: '+639170001234' }],
    items: [{ sku: 'UTK-DISP-VFD Customer Display', quantity: 1, unitType: 'Unit', newSerialNumber: 'VFD-NEW-3345', defectiveSerialNumber: 'VFD-DEF-3120',
      purchaseDate: '2025-07-07', salesOrderNo: '12019431', repairNote: 'Display board replaced after power surge', statusTag: 'UNIT REPAIRED/FOR DELIVERY' }],
    stages: { submitted: 54, started: 40, transportCompleted: 36, received: 30 },
  },
  {
    id: 'REC-4111', companyKey: 'gerrys', priority: '1 - Low', legacySapReference: 'SAP-RMA-3175',
    remarks: 'Wireless scanners dropped off at the TASS bench by the client.', status: 'PENDING',
    area: 'Quezon City - Diliman', accountManager: 'P. Soriano', deliveryDate: '2026-07-19', itemType: 'Small Item',
    itemDescription: '2x UTK-SCN-HND wireless drop — diagnostic receipt',
    rmaType: 'Receiving Slip', rmaMovement: 'INTERNAL_NO_DRIVER', rmaTransportStatus: null,
    caseNumber: 'CAS-31483-L4K5J6', clientRemarks: 'SAP#12019446',
    contacts: [{ name: 'Gerardo Lim', phone: '+639171112233' }],
    items: [{ sku: 'UTK-SCN-HND Handheld Scanner', quantity: 2, unitType: 'Unit', serialNumber: 'SCNH-SN-7781', purchaseDate: '2026-03-02',
      salesOrderNo: '12019446', problemDescription: 'Drops Wi-Fi after store network change', statusTag: 'For Return' }],
    stages: { submitted: 47, received: 20 },
  },
  {
    id: 'REC-4112', companyKey: 'rosepharmacy', priority: '2 - Moderate', legacySapReference: 'SAP-RMA-3190',
    remarks: 'LTE router for supplier re-provisioning; supplier collection pending.', status: 'PENDING',
    area: 'Cebu City', accountManager: 'F. Valenzuela', deliveryDate: '2026-07-20', itemType: 'Small Item',
    itemDescription: '1x UTK-LTE-RTR ISP config issue — return to supplier',
    rmaType: 'Return to Supplier Slip', rmaMovement: 'SUPPLIER_COLLECTION', rmaTransportStatus: null,
    caseNumber: 'CAS-31488-P7O8I9', clientRemarks: 'SAP#12019460', internalLogisticsRemarks: 'Supplier to bring RMA authorization form.',
    contacts: [{ name: 'Rosalie Uy', phone: '+639327770654' }],
    items: [{ sku: 'UTK-LTE-RTR LTE Router', quantity: 1, unitType: 'Unit', serialNumber: 'LTE-SN-9014', purchaseDate: '2026-04-09',
      salesOrderNo: '12019460', problemDescription: 'Cannot connect to new ISP', statusTag: 'For Return' }],
    stages: { submitted: 45 },
  },
  // ── Open: on hold / rescheduled (two are aging) ─────────────────────────────
  {
    id: 'REC-4113', companyKey: 'maxs', priority: '3 - High', legacySapReference: 'SAP-RMA-3200',
    remarks: 'On hold — awaiting client-submitted inspection report before pull-out.', status: 'ON_HOLD',
    area: 'Quezon City - Fairview', accountManager: 'R. Pagkalinawan', deliveryDate: '2026-07-12', itemType: 'Small Item',
    itemDescription: '1x UTK-TAB10 system freeze — awaiting incident report',
    rmaType: 'Pull Out Slip', rmaMovement: 'LOGISTICS_TRANSPORT', rmaTransportStatus: 'PENDING',
    caseNumber: 'CAS-31491-U2Y3T4', clientRemarks: 'SAP#12019475', internalLogisticsRemarks: 'Do not dispatch until TASS releases the hold.',
    contacts: [{ name: 'Teresa Gomez', phone: '+639178884567' }],
    items: [{ sku: 'UTK-TAB10 Premium Tablet', quantity: 1, unitType: 'Unit', serialNumber: 'TAB10-SN-2290', purchaseDate: '2025-06-18',
      salesOrderNo: '12019475', problemDescription: 'System freezes during checkout', statusTag: 'For Pull Out' }],
    stages: { submitted: 12 * 24 },
  },
  {
    id: 'REC-4114', companyKey: 'armynavy', priority: '1 - Low', legacySapReference: 'SAP-RMA-3215',
    remarks: 'Loose mounting joint — client unsure if installation damage.', status: 'ON_HOLD',
    area: 'Makati CBD', accountManager: 'A. Santos', deliveryDate: '2026-07-14', itemType: 'Small Item',
    itemDescription: '2x UTK-STD-ROT loose pivot joint',
    rmaType: 'Transfer Out Slip', rmaMovement: 'INTERNAL_NO_DRIVER', rmaTransportStatus: null,
    caseNumber: 'CAS-31494-E5R6T7', clientRemarks: 'SAP#12019489',
    contacts: [{ name: 'Benjie Navarro', phone: '+639176543210' }],
    items: [{ sku: 'UTK-STD-ROT Rotating Stand', quantity: 2, unitType: 'Item', serialNumber: 'STD-SN-5512',
      problemDescription: 'Pivot joint loose after install', statusTag: 'For Pick Up' }],
    stages: { submitted: 44 },
  },
  {
    id: 'REC-4115', companyKey: 'serenitea', priority: '1 - Low', legacySapReference: 'SAP-RMA-3230',
    remarks: 'Client store closed for renovation this week — pull-out rescheduled.', status: 'RESCHEDULED',
    area: 'Pasig - Kapitolyo', accountManager: 'C. Lim', deliveryDate: '2026-07-10', itemType: 'Small Item',
    itemDescription: '1x UTK-PRN-TH58 battery issue — pull-out rescheduled',
    rmaType: 'Pull Out Slip', rmaMovement: 'LOGISTICS_TRANSPORT', rmaTransportStatus: 'PENDING',
    caseNumber: 'CAS-31497-Q8W9E0', clientRemarks: 'SAP#12019503', internalLogisticsRemarks: 'Confirm store reopening date first.',
    contacts: [{ name: 'Sheila Tan', phone: '+639175553344' }],
    items: [{ sku: 'UTK-PRN-TH58 Mobile Printer', quantity: 1, unitType: 'Unit', serialNumber: 'TH58-SN-1180', purchaseDate: '2025-11-27',
      salesOrderNo: '12019503', problemDescription: 'Battery drains within 2 hours', statusTag: 'For Pull Out' }],
    stages: { submitted: 10 * 24 + 6 },
  },
];

export interface RmaDemoProfile { id: string; name: string }
export interface RmaDemoContext {
  companyIdFor(companyKey: string): string;
  /** An active Driver profile for an assigned transport row (seed: by name; staging: by name or cycled). */
  driverFor(preferredName: string): RmaDemoProfile;
  /** Helper display name, or null when no matching active helper exists. */
  assistantFor(preferredName: string): string | null;
  /** Creator and physical receiver (TASS preferred). Stored as a real User.id. */
  tassUserId: string;
  /** Modifier of rows a Driver/Logistics has touched (Logistics preferred). */
  logisticsUserId: string;
}
export interface RmaSequenceSync { prefix: RmaSlipPrefix; manilaDate: string; lastValue: number }
export type RmaDemoCreateData = Prisma.DeliveryRecordUncheckedCreateInput & {
  rmaContacts: { create: Array<{ position: number; name: string; phone: string | null; email: string | null }> };
  lineItems: { create: Array<Record<string, unknown> & { position: number; sku: string; quantity: number }> };
};

const HOUR = 3_600_000;
const isFixed = (stages: RmaDemoSpec['stages']): stages is FixedStages => typeof stages.submitted === 'string';

/** Builds the 15 curated RMAs and the slip counters they consume, in creation order. */
export function buildRmaDemoRecords(context: RmaDemoContext, now = new Date()): { records: RmaDemoCreateData[]; sequences: RmaSequenceSync[] } {
  const counters = new Map<string, RmaSequenceSync>();
  const at = (stage: string | number | undefined): Date | null =>
    stage === undefined ? null : typeof stage === 'string' ? new Date(stage) : new Date(now.getTime() - stage * HOUR);
  const records = RMA_DEMO_SPECS.map(spec => {
    const prefix = RMA_CATEGORY_META[spec.rmaType].prefix;
    const key = `${prefix}|${spec.deliveryDate}`;
    const counter = counters.get(key) ?? { prefix, manilaDate: spec.deliveryDate, lastValue: 0 };
    counter.lastValue += 1;
    counters.set(key, counter);
    const transport = spec.rmaMovement === 'LOGISTICS_TRANSPORT';
    const profile = spec.driver ? context.driverFor(spec.driver) : null;
    const assistant = spec.assistant ? context.assistantFor(spec.assistant) : null;
    const stages = spec.stages;
    const received = at(stages.received);
    const contacts = spec.contacts.map((c, position) => ({ position, name: c.name, phone: c.phone ?? null, email: c.email ?? null }));
    const record: RmaDemoCreateData = {
      id: spec.id, companyId: context.companyIdFor(spec.companyKey), category: 'RMA', draft: false,
      priority: spec.priority, reference: '', legacySapReference: spec.legacySapReference,
      rmaType: spec.rmaType, rmaReference: formatRmaReference(prefix, spec.deliveryDate, counter.lastValue),
      isInternalTransfer: spec.isInternalTransfer === true,
      remarks: spec.remarks, status: spec.status, area: spec.area, accountManager: spec.accountManager,
      deliveryDate: spec.deliveryDate, itemType: spec.itemType, itemDescription: spec.itemDescription,
      vehicle: profile ? spec.vehicle ?? '(None)' : '(None)',
      driver: profile?.name ?? '', driverId: profile?.id ?? null,
      driverAssistants: JSON.stringify(profile && assistant ? [assistant] : []),
      collectionVerified: false,
      submittedAt: at(stages.submitted),
      rmaMovement: spec.rmaMovement,
      rmaTransportStatus: transport ? spec.rmaTransportStatus : null,
      rmaTransportStartedAt: transport ? at(stages.started) : null,
      rmaTransportCompletedAt: transport ? at(stages.transportCompleted) : null,
      rmaTransportReceivedBy: transport && spec.rmaTransportStatus === 'COMPLETED' ? spec.transportReceivedBy ?? null : null,
      rmaReceivedAt: received,
      rmaReceivedBy: received ? context.tassUserId : null,
      rmaRecipient: received ? spec.recipient ?? null : null,
      rmaCompletedAt: isFixed(stages) ? new Date(stages.completed) : null,
      caseNumber: spec.caseNumber,
      serviceSlipNo: spec.rmaType === 'Return to Customer Slip' ? spec.serviceSlipNo ?? null : null,
      clientRemarks: spec.clientRemarks, internalLogisticsRemarks: spec.internalLogisticsRemarks ?? null,
      ...syncLegacyContactSnapshot(contacts),
      rmaContacts: { create: contacts },
      lineItems: { create: spec.items.map((item, position) => ({
        position, sku: item.sku, quantity: item.quantity, unitType: item.unitType,
        serialNumber: item.serialNumber ?? null, newSerialNumber: item.newSerialNumber ?? null, defectiveSerialNumber: item.defectiveSerialNumber ?? null,
        purchaseDate: item.purchaseDate ?? null, salesOrderNo: item.salesOrderNo ?? null, accessories: item.accessories ?? null,
        problemDescription: item.problemDescription ?? null, repairNote: item.repairNote ?? null, statusTag: item.statusTag ?? null,
      })) },
      createdById: context.tassUserId,
      modifiedById: profile ? context.logisticsUserId : context.tassUserId,
    };
    return record;
  });
  return { records, sequences: [...counters.values()] };
}

type RawExecutor = { $executeRaw: (query: TemplateStringsArray, ...values: unknown[]) => Promise<number> };
/**
 * Raises each (prefix, Manila date) slip counter to at least the seeded maximum.
 * High-water marks are never lowered, so later saves can never reuse a number.
 */
export async function syncRmaReferenceSequences(db: RawExecutor, sequences: readonly RmaSequenceSync[]): Promise<void> {
  for (const { prefix, manilaDate, lastValue } of sequences) {
    await db.$executeRaw`
      INSERT INTO "RmaReferenceSequence" ("prefix", "manilaDate", "lastValue")
      VALUES (${prefix}, ${manilaDate}, ${lastValue})
      ON CONFLICT ("prefix", "manilaDate")
      DO UPDATE SET "lastValue" = GREATEST("RmaReferenceSequence"."lastValue", EXCLUDED."lastValue")
    `;
  }
}
