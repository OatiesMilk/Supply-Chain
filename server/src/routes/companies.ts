import { Router, type Request, type Response } from 'express';
import { prisma } from '../db';
import { requireResource, requireAuth, requireRole } from '../middleware/auth';
import { asyncRoute } from '../middleware/asyncRoute';
import {
  DirectoryInputError, directoryWrite, normalizedDirectoryName, body, has, displayName, optionalText, flag, expectedVersion,
  companyInclude, companyDto, companyAudit, parseSapNumbers, parseAccountManagerIds, assertSapsAvailable, assignableAccountManagers,
  legacyDefaultAccountManagerId, uniqueViolationMessage,
} from '../services/accountDirectory';

const router = Router();
const handler = (work: (req: Request, res: Response) => Promise<unknown>) => asyncRoute(async (req, res) => {
  try { return await work(req, res); }
  catch (error) {
    if (error instanceof DirectoryInputError) return res.status(error.status).json({ error: error.message });
    const unique = uniqueViolationMessage(error);
    if (unique) return res.status(409).json({ error: unique.replace('A record', 'A company') });
    throw error;
  }
});
// Company management is Admin-only (it was Sales Coordinator + Admin with no UI).
const manage = (action: 'CREATE' | 'WRITE') =>
  [requireAuth, requireResource('companies', action), requireResource('admin', 'WRITE'), requireRole('ADMIN')];

/** All companies with is_active, so records linked to an inactive company still resolve. */
router.get('/', requireAuth, requireResource('companies'), handler(async (req, res) => {
  const companies = await prisma.company.findMany({ where: req.query.active === 'true' ? { isActive: true } : {},
    orderBy: [{ name: 'asc' }, { id: 'asc' }], include: companyInclude });
  res.json(companies.map(companyDto));
}));

router.post('/', ...manage('CREATE'), handler(async (req, res) => {
  const input = body(req.body, ['name', 'sap_number', 'sap_numbers', 'address', 'contact_person', 'default_account_manager_id', 'account_manager_ids']);
  const name = displayName(input.name, 'Company name', 200);
  // Walk-in clients may have no SAP number yet (Sec 5.1); enterprise clients several (Sec 5.2).
  const sapNumbers = parseSapNumbers(input) ?? [];
  const address = optionalText(input.address, 'Address', 1000);
  const contactPerson = optionalText(input.contact_person, 'Contact person', 200);
  const amIds = parseAccountManagerIds(input) ?? [];
  const created = await directoryWrite(async tx => {
    const keys = await assertSapsAvailable(tx, sapNumbers);
    const managers = await assignableAccountManagers(tx, amIds);
    const row = await tx.company.create({ data: { name, normalizedName: await normalizedDirectoryName(tx, name), sapNumber: sapNumbers[0] ?? '',
      address, contactPerson, defaultAccountManagerId: legacyDefaultAccountManagerId(managers),
      sapNumbers: { create: sapNumbers.map((sapNumber, position) => ({ sapNumber, normalizedNumber: keys[position], position })) },
      accountManagers: { create: managers.map(am => ({ accountManagerId: am.id })) } }, include: companyInclude });
    await tx.auditLog.create({ data: { recordId: row.id, recordType: 'Company', action: 'CREATE', changedById: req.user!.id,
      previousValue: null, newValue: JSON.stringify(companyAudit(row)) } });
    return row;
  });
  res.status(201).json(companyDto(created));
}));

const sameList = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((value, index) => value === b[index]);
const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every(value => b.includes(value));

router.patch('/:id', ...manage('WRITE'), handler(async (req, res) => {
  const input = body(req.body, ['name', 'sap_number', 'sap_numbers', 'address', 'contact_person', 'default_account_manager_id',
    'account_manager_ids', 'is_active', 'expected_version']);
  const version = expectedVersion(input.expected_version);
  const name = has(input, 'name') ? displayName(input.name, 'Company name', 200) : undefined;
  const sapNumbers = parseSapNumbers(input);
  const address = has(input, 'address') ? optionalText(input.address, 'Address', 1000) : undefined;
  const contactPerson = has(input, 'contact_person') ? optionalText(input.contact_person, 'Contact person', 200) : undefined;
  const amIds = parseAccountManagerIds(input);
  const isActive = has(input, 'is_active') ? flag(input.is_active, 'is_active') : undefined;
  if ([name, sapNumbers, address, contactPerson, amIds, isActive].every(value => value === undefined)) throw new DirectoryInputError('Nothing to change');
  const updated = await directoryWrite(async tx => {
    const previous = await tx.company.findUnique({ where: { id: req.params.id }, include: companyInclude });
    if (!previous) throw new DirectoryInputError('Company not found', 404);
    if (previous.version !== version) throw new DirectoryInputError('This company was changed by someone else. Refresh and try again.', 409);
    const before = companyDto(previous);
    const retainedIds = before.account_managers.map(am => am.id);
    // Order and casing are part of the list, so a reorder or re-case is a change.
    const sapChange = sapNumbers !== undefined && !sameList(sapNumbers, before.sap_numbers) ? sapNumbers : undefined;
    const amChange = amIds !== undefined && !sameSet(amIds, retainedIds) ? amIds : undefined;
    const keys = sapChange ? await assertSapsAvailable(tx, sapChange, previous.id) : [];
    const managers = amChange ? await assignableAccountManagers(tx, amChange, retainedIds) : [];
    const data = {
      ...(name !== undefined && name !== previous.name ? { name, normalizedName: await normalizedDirectoryName(tx, name) } : {}),
      ...(sapChange ? { sapNumber: sapChange[0] ?? '',
        sapNumbers: { create: sapChange.map((sapNumber, position) => ({ sapNumber, normalizedNumber: keys[position], position })) } } : {}),
      ...(address !== undefined && address !== previous.address ? { address } : {}),
      ...(contactPerson !== undefined && contactPerson !== previous.contactPerson ? { contactPerson } : {}),
      ...(amChange ? { defaultAccountManagerId: legacyDefaultAccountManagerId(managers),
        accountManagers: { create: managers.map(am => ({ accountManagerId: am.id })) } } : {}),
      ...(isActive !== undefined && isActive !== previous.isActive ? { isActive } : {}),
    };
    if (!Object.keys(data).length) return previous;
    // Replace child rows first so a reorder/re-case never conflicts with this company's own unique keys.
    if (sapChange) await tx.companySapNumber.deleteMany({ where: { companyId: previous.id } });
    if (amChange) await tx.companyAccountManager.deleteMany({ where: { companyId: previous.id } });
    const row = await tx.company.update({ where: { id: previous.id }, data: { ...data, version: { increment: 1 } }, include: companyInclude });
    await tx.auditLog.create({ data: { recordId: row.id, recordType: 'Company', action: 'UPDATE', changedById: req.user!.id,
      previousValue: JSON.stringify(companyAudit(previous)), newValue: JSON.stringify(companyAudit(row)) } });
    return row;
  });
  res.json(companyDto(updated));
}));

export default router;
