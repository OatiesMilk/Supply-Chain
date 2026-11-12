import type { AuthUser } from '../middleware/auth';
import { legacyCapabilities, POLICY_CATEGORIES, POLICY_SCREENS, type LegacyGrant, type PolicyRole } from './permissionCatalog';
import { permissionSnapshot } from './permissions';
import { canCreateCategory, canCreatePolicyCategory, canReadRecord, canReadPolicyRecord, canWriteCategory, canWritePolicyCategory, CATEGORY_SCREEN, readableCategories, readablePolicyCategories, writePathForCategory } from './recordAccess';
import type { EffectivePermissionSnapshot } from './permissionEvaluator';
import { canAccessInventoryTransactions, canAccessPolicyInventoryTransactions, canAccessPolicyTransactions, canAccessTransactions } from './transactionAccess';

export interface RehearsalAccount {
  id: string;
  role: PolicyRole;
  isActive: boolean;
  permissions: LegacyGrant[];
  driverProfile?: { id: string; type: string; isActive: boolean } | null;
}
export interface RehearsalDifference {
  account: string;
  key: string;
  before: boolean;
  after: boolean;
  classification: 'ACCESS_EXPANSION' | 'COMPATIBILITY_REGRESSION' | 'DRIVER_LINK_REQUIRED' | 'INACTIVE_ACCOUNT_FAIL_CLOSED';
}

/** Read-only shadow oracle. Navigation/category behavior comes from the actual
 * legacy helpers; the frozen catalog supplies operation and lookup decisions.
 * Every new Allow fails the gate, including changes to a previously hidden
 * screen. Only the two explicit, fail-closed tightenings below are exempted. */
export function comparePermissionRehearsal(account: RehearsalAccount, snapshot: EffectivePermissionSnapshot) {
  const legacy = permissionSnapshot(account.role, account.permissions);
  const user = { ...legacy, id: account.id, name: 'Rehearsal', email: 'fixture@example.test', role: account.role,
    driverProfileId: account.driverProfile?.type === 'DRIVER' ? account.driverProfile.id : null } as AuthUser;
  const differences: RehearsalDifference[] = [];
  let comparisons = 0;
  const linkedProfile = account.driverProfile?.type === 'DRIVER' && account.driverProfile.isActive ? account.driverProfile.id : null;
  const compare = (key: string, before: boolean, after: boolean, identityDependent = false) => {
    comparisons++;
    if (before === after) return;
    let classification: RehearsalDifference['classification'] = after ? 'ACCESS_EXPANSION' : 'COMPATIBILITY_REGRESSION';
    if (!after && !key.startsWith('SNAPSHOT:') && !account.isActive && snapshot.errors.length === 1 && snapshot.errors[0] === 'Account is inactive') classification = 'INACTIVE_ACCOUNT_FAIL_CLOSED';
    else if (!after && snapshot.valid && account.role === 'DRIVER' && !linkedProfile && !snapshot.driverProfileId && identityDependent) classification = 'DRIVER_LINK_REQUIRED';
    differences.push({ account: account.id, key, before, after, classification });
  };
  compare('SNAPSHOT:ACCOUNT', true, snapshot.userId === account.id && snapshot.role === account.role);
  compare('SNAPSHOT:VALID', account.isActive, snapshot.valid);
  compare('SNAPSHOT:DRIVER_ID', true, snapshot.driverProfileId === (account.role === 'DRIVER' && account.isActive ? linkedProfile : null));
  for (const screen of POLICY_SCREENS) compare(`NAVIGATION:${screen}`, legacy.effectiveScreens.includes(screen), snapshot.effectiveScreens.includes(screen));
  for (const [key, before] of legacyCapabilities(account.role, legacy.effectiveScreens, account.permissions)) {
    compare(key, before === 'ALLOW', snapshot.decisions[key]?.allowed === true, key.startsWith('CATEGORY:') || key.startsWith('RESOURCE:'));
  }
  for (const resource of Object.keys(snapshot.capabilities.resources)) {
    const before = legacy.resources.includes(resource as typeof legacy.resources[number])
      || resource === 'transactions' && account.role === 'DRIVER' && canAccessTransactions(user);
    compare(`LOOKUP:${resource}:READ`, before, snapshot.resources.includes(resource as typeof snapshot.resources[number]), true);
  }
  compare('TRANSACTIONS:READ', canAccessTransactions(user), canAccessPolicyTransactions(snapshot), true);
  compare('INVENTORY_TRANSACTIONS:READ', canAccessInventoryTransactions(user), canAccessPolicyInventoryTransactions(snapshot), true);
  // Independent category oracle exercises aggregate/scheduling entry points.
  const categories = readableCategories(user);
  for (const path of ['records', 'main', 'dashboard', 'calendar', 'driver', 'driver_board', 'driver_dashboard'] as const) {
    const available = path === 'records' || legacy.effectiveScreens.includes(path);
    for (const category of POLICY_CATEGORIES) compare(`PATH:${path}:${category}:READ`, available && categories.includes(category),
      readablePolicyCategories(snapshot, path).includes(category), true);
  }
  for (const category of POLICY_CATEGORIES) {
    const write = canWriteCategory(user, category);
    const selected = writePathForCategory(snapshot, category);
    compare(`WRITE_PATH:${category}`, write, !!selected && canWritePolicyCategory(snapshot, category, selected), true);
    for (const path of ['records', CATEGORY_SCREEN[category], 'main', 'dashboard', 'calendar', 'driver', 'driver_board', 'driver_dashboard'] as const) {
      const available = path === 'records' || legacy.effectiveScreens.includes(path);
      const editor = path === 'records' || [CATEGORY_SCREEN[category], 'calendar', 'driver', 'driver_board', 'driver_dashboard'].includes(path);
      compare(`PATH:${path}:${category}:WRITE`, available && editor && write, canWritePolicyCategory(snapshot, category, path), true);
      compare(`PATH:${path}:${category}:CREATE`, available && editor && account.role !== 'DRIVER' && canCreateCategory(user, category),
        canCreatePolicyCategory(snapshot, category, path), true);
    }
  }
  for (const category of POLICY_CATEGORIES) for (const assignment of ['own', 'other', 'unassigned'] as const) for (const draft of [false, true]) {
    // RMA transport is separately gated by the approved movement adapter; the
    // frozen migration baseline grants Driver no RMA category at all.
    const row = { category, driverId: assignment === 'own' ? user.driverProfileId : assignment === 'other' ? 'other-driver' : null,
      draft, status: 'SCHEDULED' as const, rmaMovement: 'INTERNAL_TRANSFER' };
    compare(`RECORD:${category}:${assignment}:${draft ? 'draft' : 'saved'}`, canReadRecord(user, row), canReadPolicyRecord(snapshot, row), true);
  }
  return { account: account.id, role: account.role, comparisons, valid: snapshot.valid,
    differences, expansions: differences.filter(d => d.classification === 'ACCESS_EXPANSION'),
    regressions: differences.filter(d => d.classification === 'COMPATIBILITY_REGRESSION'),
    intentionalTightening: differences.filter(d => d.classification === 'DRIVER_LINK_REQUIRED' || d.classification === 'INACTIVE_ACCOUNT_FAIL_CLOSED') };
}
