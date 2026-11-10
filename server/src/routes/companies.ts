import { Router, type Request, type Response } from 'express';
import { prisma } from '../db';
import { requireResource, requireAuth, requireRole } from '../middleware/auth';
import { asyncRoute } from '../middleware/asyncRoute';
import {
  DirectoryInputError, directoryWrite, normalizedDirectoryName, body, has, displayName, optionalText, requiredText, optionalId,
  flag, expectedVersion, companyInclude, companyDto, companyAudit, assertSapAvailable, assignableAccountManager, uniqueViolationMessage,
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
  const input = body(req.body, ['name', 'sap_number', 'address', 'contact_person', 'default_account_manager_id']);
  const name = displayName(input.name, 'Company name', 200);
  const sapNumber = requiredText(input.sap_number, 'SAP number', 50);
  const address = optionalText(input.address, 'Address', 1000);
  const contactPerson = optionalText(input.contact_person, 'Contact person', 200);
  const requestedAm = has(input, 'default_account_manager_id') ? optionalId(input.default_account_manager_id, 'Default Account Manager') : null;
  const created = await directoryWrite(async tx => {
    await assertSapAvailable(tx, sapNumber);
    const defaultAccountManagerId = requestedAm ? await assignableAccountManager(tx, requestedAm) : null;
    const row = await tx.company.create({ data: { name, normalizedName: await normalizedDirectoryName(tx, name), sapNumber, address,
      contactPerson, defaultAccountManagerId }, include: companyInclude });
    await tx.auditLog.create({ data: { recordId: row.id, recordType: 'Company', action: 'CREATE', changedById: req.user!.id,
      previousValue: null, newValue: JSON.stringify(companyAudit(row)) } });
    return row;
  });
  res.status(201).json(companyDto(created));
}));

router.patch('/:id', ...manage('WRITE'), handler(async (req, res) => {
  const input = body(req.body, ['name', 'sap_number', 'address', 'contact_person', 'default_account_manager_id', 'is_active', 'expected_version']);
  const version = expectedVersion(input.expected_version);
  const name = has(input, 'name') ? displayName(input.name, 'Company name', 200) : undefined;
  const sapNumber = has(input, 'sap_number') ? requiredText(input.sap_number, 'SAP number', 50) : undefined;
  const address = has(input, 'address') ? optionalText(input.address, 'Address', 1000) : undefined;
  const contactPerson = has(input, 'contact_person') ? optionalText(input.contact_person, 'Contact person', 200) : undefined;
  const requestedAm = has(input, 'default_account_manager_id') ? optionalId(input.default_account_manager_id, 'Default Account Manager') : undefined;
  const isActive = has(input, 'is_active') ? flag(input.is_active, 'is_active') : undefined;
  if ([name, sapNumber, address, contactPerson, requestedAm, isActive].every(value => value === undefined)) throw new DirectoryInputError('Nothing to change');
  const updated = await directoryWrite(async tx => {
    const previous = await tx.company.findUnique({ where: { id: req.params.id }, include: companyInclude });
    if (!previous) throw new DirectoryInputError('Company not found', 404);
    if (previous.version !== version) throw new DirectoryInputError('This company was changed by someone else. Refresh and try again.', 409);
    if (sapNumber !== undefined && sapNumber !== previous.sapNumber) await assertSapAvailable(tx, sapNumber, previous.id);
    const defaultAccountManagerId = requestedAm === undefined || requestedAm === previous.defaultAccountManagerId ? undefined
      : requestedAm === null ? null : await assignableAccountManager(tx, requestedAm, previous.defaultAccountManagerId);
    const data = {
      ...(name !== undefined && name !== previous.name ? { name, normalizedName: await normalizedDirectoryName(tx, name) } : {}),
      ...(sapNumber !== undefined && sapNumber !== previous.sapNumber ? { sapNumber } : {}),
      ...(address !== undefined && address !== previous.address ? { address } : {}),
      ...(contactPerson !== undefined && contactPerson !== previous.contactPerson ? { contactPerson } : {}),
      ...(defaultAccountManagerId !== undefined ? { defaultAccountManagerId } : {}),
      ...(isActive !== undefined && isActive !== previous.isActive ? { isActive } : {}),
    };
    if (!Object.keys(data).length) return previous;
    const row = await tx.company.update({ where: { id: previous.id }, data: { ...data, version: { increment: 1 } }, include: companyInclude });
    await tx.auditLog.create({ data: { recordId: row.id, recordType: 'Company', action: 'UPDATE', changedById: req.user!.id,
      previousValue: JSON.stringify(companyAudit(previous)), newValue: JSON.stringify(companyAudit(row)) } });
    return row;
  });
  res.json(companyDto(updated));
}));

export default router;
