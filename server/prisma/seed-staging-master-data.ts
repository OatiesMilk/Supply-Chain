import type { PrismaClient } from '@prisma/client';
import { assertStagingSeedTarget, StagingSeedError } from './staging-seed-safety';
import { lockDriverDirectory } from '../src/services/driverDirectory';
import { localDirectoryKey } from '../src/services/accountDirectory';

/**
 * Adds a small set of demo master data to the confirmed staging database so
 * record forms (and Auto Fill) have companies and Logistics has Driver/Helper
 * profiles to assign. Records are intentionally not created.
 * Add-only: rows use fixed ids, so existing rows are skipped and never changed.
 * Default is a read-only preview; --apply also needs STAGING_MASTER_DATA_APPROVED=true.
 */
const COMPANY_PREFIX = 'STG-MD-COMPANY-';
const PROFILE_PREFIX = 'STG-MD-PROFILE-';

export const MASTER_COMPANIES = [
  { key: 'jollibee', name: 'Jollibee Foods Corp. - Quezon City Cluster', sapNumber: 'SAP-CO-0001', address: '12 E. Rodriguez Jr. Ave, Quezon City', contactPerson: 'Theresa Alajar' },
  { key: 'mercury', name: 'Mercury Drug Corporation - Head Office', sapNumber: 'SAP-CO-0002', address: '7 Jupiter St. Cor. Makati Ave, Makati', contactPerson: 'Gabriel Sy' },
  { key: 'cbtl', name: 'The Coffee Bean & Tea Leaf (CBTL PH)', sapNumber: 'SAP-CO-0003', address: 'BGC Corporate Center, Taguig', contactPerson: 'Regine Velasquez' },
  { key: 'chowking', name: 'Chowking Foods Corp. - South Manila Area', sapNumber: 'SAP-CO-0004', address: 'Roxas Blvd, Malate, Manila', contactPerson: 'Dante Torres' },
  { key: 'mcdo', name: "McDonald's Philippines (Golden Arches Dev't Corp)", sapNumber: 'SAP-CO-0006', address: '6/F Citibank Center, Paseo de Roxas, Makati', contactPerson: 'Loretta Santos' },
  { key: 'shakeys', name: "Shakey's Pizza Asia Pacific Inc.", sapNumber: 'SAP-CO-0007', address: '3/F The Podium, Ortigas Center, Mandaluyong', contactPerson: 'Benedicto Cruz' },
  { key: 'smretail', name: 'SM Retail Inc. - Department Store Division', sapNumber: 'SAP-CO-0023', address: 'SM City Bicutan, Parañaque', contactPerson: 'Veronica Co' },
  { key: 'puregold', name: 'Puregold Price Club Inc.', sapNumber: 'SAP-CO-0025', address: '900 Romualdez St, Paco, Manila', contactPerson: 'Manny Mendoza' },
  { key: 'generika', name: 'Generika Drugstore Head Office', sapNumber: 'SAP-CO-0028', address: 'Alabang-Zapote Road, Muntinlupa', contactPerson: 'Manuel Lopez' },
  { key: 'boscoffee', name: "Bo's Coffee Club Inc.", sapNumber: 'SAP-CO-0020', address: 'Cardinal Rosales Ave, Cebu Business Park, Cebu', contactPerson: 'Steve Benitez' },
] as const;

// Coverage uses canonical area names, matching prisma/seeds/drivers.ts.
export const MASTER_PROFILES = [
  { key: 'lando-navarro', name: 'Lando Navarro', type: 'DRIVER', areas: ['Makati CBD', 'BGC (Taguig)', 'Ortigas Corridor'] },
  { key: 'manny-santos', name: 'Manny Santos', type: 'DRIVER', areas: ['Quezon City - Fairview', 'Quezon City - Balintawak', 'Quezon City - Diliman', 'Marikina', 'Caloocan'] },
  { key: 'ronald-dela-cruz', name: 'Ronald de la Cruz', type: 'DRIVER', areas: ['Manila - Binondo', 'Manila - Ermita', 'Parañaque', 'Pasay', 'Muntinlupa - Alabang'] },
  { key: 'jayson-reyes', name: 'Jayson Reyes', type: 'ASSISTANT', areas: [] },
  { key: 'bong-alvarez', name: 'Bong Alvarez', type: 'ASSISTANT', areas: [] },
  { key: 'ricky-mendoza', name: 'Ricky Mendoza', type: 'ASSISTANT', areas: [] },
] as const;

export function assertStagingMasterDataTarget(env: NodeJS.ProcessEnv = process.env, options: { apply?: boolean } = {}) {
  // Same target confirmation as the staging seed, without its source-data approval.
  const target = assertStagingSeedTarget(env);
  if (options.apply === true && env.STAGING_MASTER_DATA_APPROVED !== 'true') {
    throw new StagingSeedError('Staging master data refused: --apply requires STAGING_MASTER_DATA_APPROVED=true after review of the preview.');
  }
  return target;
}

export async function runStagingMasterDataSeed(db: PrismaClient, options: { apply?: boolean } = {}, env: NodeJS.ProcessEnv = process.env) {
  const apply = options.apply === true;
  const target = assertStagingMasterDataTarget(env, options); // Before any read.
  const identity = await db.$queryRaw<Array<{ database: string }>>`SELECT current_database() AS database`;
  if (identity[0]?.database !== target.database) throw new StagingSeedError('Staging master data refused: connected database does not match confirmation.');

  return db.$transaction(async tx => {
    if (apply) await lockDriverDirectory(tx);
    const admin = await tx.user.findUnique({ where: { email: target.adminEmail } });
    if (!admin || admin.role !== 'ADMIN' || !admin.isActive) throw new StagingSeedError('Staging master data requires an existing active Admin.');

    const companyIds = MASTER_COMPANIES.map(c => COMPANY_PREFIX + c.key);
    const profileIds = MASTER_PROFILES.map(p => PROFILE_PREFIX + p.key);
    const existingCompanies = new Set((await tx.company.findMany({ where: { id: { in: companyIds } }, select: { id: true } })).map(r => r.id));
    const existingProfiles = new Set((await tx.driver.findMany({ where: { id: { in: profileIds } }, select: { id: true } })).map(r => r.id));
    // Name clashes with rows someone already added by hand are skipped, not duplicated.
    const takenCompanyNames = new Set((await tx.company.findMany({ select: { name: true } })).map(r => r.name.trim().toLowerCase()));
    const takenProfileNames = new Set((await tx.driver.findMany({ select: { name: true } })).map(r => r.name.trim().toLowerCase()));

    const companies = MASTER_COMPANIES.filter(c => !existingCompanies.has(COMPANY_PREFIX + c.key) && !takenCompanyNames.has(c.name.toLowerCase()));
    const profiles = MASTER_PROFILES.filter(p => !existingProfiles.has(PROFILE_PREFIX + p.key) && !takenProfileNames.has(p.name.toLowerCase()));
    const result = {
      mode: apply ? 'applied' : 'dry-run',
      companies: { create: companies.map(c => c.name), skip: MASTER_COMPANIES.length - companies.length },
      profiles: { create: profiles.map(p => `${p.name} (${p.type === 'DRIVER' ? 'Driver' : 'Helper'})`), skip: MASTER_PROFILES.length - profiles.length },
    };
    if (!apply) return result;

    for (const c of companies) {
      const id = COMPANY_PREFIX + c.key;
      const data = { name: c.name, sapNumber: c.sapNumber, address: c.address, contactPerson: c.contactPerson };
      await tx.company.create({ data: { id, ...data, normalizedName: localDirectoryKey(c.name) } });
      await tx.auditLog.create({ data: { recordId: id, recordType: 'Company', action: 'CREATE', changedById: admin.id, previousValue: null, newValue: JSON.stringify({ source: 'staging-master-data-v1', ...data }) } });
    }
    for (const p of profiles) {
      const id = PROFILE_PREFIX + p.key;
      const data = { name: p.name, type: p.type, coverageAreas: JSON.stringify(p.areas), isActive: true };
      await tx.driver.create({ data: { id, ...data, createdBy: admin.name, modifiedBy: admin.name } });
      await tx.auditLog.create({ data: { recordId: id, recordType: 'Driver', action: 'CREATE', changedById: admin.id, previousValue: null, newValue: JSON.stringify({ source: 'staging-master-data-v1', ...data }) } });
    }
    return result;
  }, { maxWait: 10_000, timeout: 60_000 });
}

if (require.main === module) {
  // The DB singleton is imported only after the target guard succeeds.
  void (async () => {
    const dotenv = await import('dotenv'); dotenv.config();
    if (process.argv.slice(2).some(arg => arg !== '--apply')) throw new StagingSeedError('Usage: seed:staging:master-data [--apply]; default is read-only preview.');
    const apply = process.argv.includes('--apply');
    assertStagingMasterDataTarget(process.env, { apply });
    const { prisma } = await import('../src/db.js');
    try {
      console.log(JSON.stringify(await runStagingMasterDataSeed(prisma, { apply }), null, 2));
    } finally { await prisma.$disconnect(); }
  })().catch((error: unknown) => {
    // Never print raw DB errors or connection strings.
    const code = typeof error === 'object' && error !== null && 'code' in error &&
      typeof error.code === 'string' && /^P[0-9]{4}$/.test(error.code) ? ` (${error.code})` : '';
    console.error(error instanceof StagingSeedError ? error.message
      : `Staging master data seed stopped${code}. Nothing was partially written; check staging counts before retrying.`);
    process.exitCode = 1;
  });
}
