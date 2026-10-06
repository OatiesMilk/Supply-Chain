import { Router } from 'express';
import { prisma } from '../db';
import { requireResource, requireAuth, requireRole } from '../middleware/auth';

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
router.post('/', requireAuth, requireResource('customers'), requireRole('SALES_COORDINATOR', 'LOGISTICS', 'ADMIN', 'DRIVER'), async (req, res) => {
  const { name, contact_person, email, phone, address, city } = req.body ?? {};
  if (!name) return res.status(400).json({ error: 'name is required' });

  const created = await prisma.customer.create({
    data: {
      name,
      contactPerson: contact_person ?? '',
      email: email ?? '',
      phone: phone ?? '',
      address: address ?? '',
      city: city ?? '',
      createdById: req.user!.id,
      modifiedById: req.user!.id,
      modifiedAt: new Date()
    },
    include: { createdBy: true, modifiedBy: true }
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
});

export default router;
