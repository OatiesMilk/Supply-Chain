import { Router } from 'express';
import { prisma } from '../db';
import { requireScreen, requireResource, requireAuth, requireRole } from '../middleware/auth';
import { asyncRoute } from '../middleware/asyncRoute';

const router = Router();

router.get('/', requireAuth, requireResource('suppliers'), async (_req, res) => {
  const suppliers = await prisma.supplier.findMany({ 
    orderBy: { name: 'asc' },
    include: { createdBy: true, modifiedBy: true }
  });
  res.json(
    suppliers.map(s => ({
      id: s.id,
      name: s.name,
      contact_person: s.contactPerson,
      email: s.email,
      phone: s.phone,
      address: s.address,
      city: s.city,
      category: s.category,
      created_by: s.createdBy.name,
      created_at: s.createdAt,
      modified_by: s.modifiedBy.name,
      modified_at: s.modifiedAt
    }))
  );
});

router.post('/', requireAuth, requireResource('suppliers', 'CREATE'), requireScreen('suppliers'), requireRole('SALES_COORDINATOR', 'LOGISTICS', 'ADMIN', 'DRIVER'), asyncRoute(async (req, res) => {
  const { name, contact_person, email, phone, address, city, category } = req.body ?? {};
  if (!name || !category) return res.status(400).json({ error: 'name and category are required' });

  const created = await prisma.$transaction(async tx => {
    const supplier = await tx.supplier.create({
      data: {
        name,
        contactPerson: contact_person ?? '',
        email: email ?? '',
        phone: phone ?? '',
        address: address ?? '',
        city: city ?? '',
        category,
        createdById: req.user!.id,
        modifiedById: req.user!.id,
        modifiedAt: new Date()
      },
      include: { createdBy: true, modifiedBy: true }
    });

    await tx.auditLog.create({
      data: {
        recordId: supplier.id,
        recordType: 'Supplier',
        action: 'CREATE',
        changedById: req.user!.id,
        previousValue: null,
        newValue: JSON.stringify({
          name: supplier.name,
          contact_person: supplier.contactPerson,
          email: supplier.email,
          phone: supplier.phone,
          address: supplier.address,
          city: supplier.city,
          category: supplier.category,
        }),
      },
    });

    return supplier;
  });
  res.status(201).json({
    id: created.id,
    name: created.name,
    contact_person: created.contactPerson,
    email: created.email,
    phone: created.phone,
    address: created.address,
    city: created.city,
    category: created.category,
    created_by: created.createdBy.name,
    created_at: created.createdAt,
    modified_by: created.modifiedBy.name,
    modified_at: created.modifiedAt
  });
}));

export default router;
