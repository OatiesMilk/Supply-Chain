import { Router } from 'express';
import { prisma } from '../db';
import { requireResource, requireAuth, requireRole } from '../middleware/auth';
import { asyncRoute } from '../middleware/asyncRoute';
import { customerChanges, customerSnapshot, parseCustomerUpdate, parseCustomerCreate } from '../services/customerValidation';

const router = Router();

router.get('/', requireAuth, requireResource('customers'), async (_req, res) => {
  const customers = await prisma.customer.findMany({ 
    orderBy: { name: 'asc' },
    include: { createdBy: true, modifiedBy: true }
  });
  res.json(
    customers.map(c => ({
      id: c.id,
      name: c.name,
      contact_person: c.contactPerson,
      email: c.email,
      phone: c.phone,
      address: c.address,
      city: c.city,
      created_by: c.createdBy.name,
      created_at: c.createdAt,
      modified_by: c.modifiedBy.name,
      modified_at: c.modifiedAt
    }))
  );
});

// Every role may create a Customer except TASS.
router.post('/', requireAuth, requireResource('customers'), requireRole('SALES_COORDINATOR', 'LOGISTICS', 'ADMIN', 'DRIVER'), asyncRoute(async (req, res) => {
  const parsed = parseCustomerCreate(req.body);
  if ('error' in parsed) return res.status(400).json(parsed);
  const b = parsed.value!;

  // The creation is the first entry in the customer's audit trail.
  const created = await prisma.$transaction(async tx => {
    const customer = await tx.customer.create({
      data: {
        name: b.name!,
        contactPerson: b.contactPerson ?? '',
        email: b.email ?? '',
        phone: b.phone ?? '',
        address: b.address ?? '',
        city: b.city ?? '',
        createdById: req.user!.id,
        modifiedById: req.user!.id,
        modifiedAt: new Date()
      },
      include: { createdBy: true, modifiedBy: true }
    });
    await tx.auditLog.create({ data: {
      recordId: customer.id, recordType: 'Customer', action: 'CREATE', changedById: req.user!.id,
      previousValue: null,
      newValue: JSON.stringify(customerSnapshot(customer)),
    } });
    return customer;
  });
  res.status(201).json({
    id: created.id,
    name: created.name,
    contact_person: created.contactPerson,
    email: created.email,
    phone: created.phone,
    address: created.address,
    city: created.city,
    created_by: created.createdBy.name,
    created_at: created.createdAt,
    modified_by: created.modifiedBy.name,
    modified_at: created.modifiedAt
  });
}));

const CUSTOMER_EDITORS = ['SALES_COORDINATOR', 'LOGISTICS', 'ADMIN'] as const;

function serializeCustomer(c: any) {
  return {
    id: c.id,
    name: c.name,
    contact_person: c.contactPerson,
    email: c.email,
    phone: c.phone,
    address: c.address,
    city: c.city,
    created_by: c.createdBy.name,
    created_at: c.createdAt,
    modified_by: c.modifiedBy.name,
    modified_at: c.modifiedAt
  };
}

// Edit an existing Customer. A change reason is required and saved with the
// named actor in the audit log. expected_modified_at guards against
// overwriting someone else's newer save (optimistic concurrency).
router.put('/:id', requireAuth, requireResource('customers'), requireRole(...CUSTOMER_EDITORS), asyncRoute(async (req, res) => {
  const parsed = parseCustomerUpdate(req.body);
  if ('error' in parsed) return res.status(400).json(parsed);
  const { data, remarks, expectedModifiedAt } = parsed.value;

  const result = await prisma.$transaction(async tx => {
    const current = await tx.customer.findUnique({ where: { id: req.params.id } });
    if (!current) return { status: 404 as const };
    if (current.modifiedAt.getTime() !== new Date(expectedModifiedAt).getTime()) return { status: 409 as const };

    const before = customerSnapshot(current);
    if (!customerChanges(before, { ...before, ...data }).length) return { status: 422 as const };

    const { count } = await tx.customer.updateMany({
      where: { id: current.id, modifiedAt: current.modifiedAt },
      data: { ...data, modifiedById: req.user!.id },
    });
    if (count === 0) return { status: 409 as const };

    const updated = await tx.customer.findUniqueOrThrow({ where: { id: current.id }, include: { createdBy: true, modifiedBy: true } });
    await tx.auditLog.create({ data: {
      recordId: updated.id, recordType: 'Customer', action: 'UPDATE', changedById: req.user!.id,
      previousValue: JSON.stringify(before),
      newValue: JSON.stringify({ ...customerSnapshot(updated), remarks }),
    } });
    return { status: 200 as const, updated };
  });

  if (result.status === 404) return res.status(404).json({ error: 'Customer not found.' });
  if (result.status === 409) return res.status(409).json({ error: 'Someone else saved changes to this customer after you opened it. Reload to see the latest values, then make your edit again.' });
  if (result.status === 422) return res.status(400).json({ error: 'No changes to save.', fields: {} });
  res.json(serializeCustomer(result.updated));
}));

// Change history for one Customer, newest first.
router.get('/:id/audit', requireAuth, requireResource('customers'), requireRole(...CUSTOMER_EDITORS), asyncRoute(async (req, res) => {
  const entries = await prisma.auditLog.findMany({
    where: { recordId: req.params.id, recordType: 'Customer' },
    include: { changedBy: true },
    orderBy: { timestamp: 'desc' }
  });
  res.json(entries.map(e => {
    const previous = e.previousValue ? JSON.parse(e.previousValue) : null;
    const next = e.newValue ? JSON.parse(e.newValue) : null;
    return {
      id: e.id,
      action: e.action,
      changed_by: e.changedBy.name,
      timestamp: e.timestamp,
      remarks: typeof next?.remarks === 'string' ? next.remarks : '',
      changes: customerChanges(previous, next),
    };
  }));
}));

export default router;
