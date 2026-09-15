import { Router } from 'express';
import { prisma } from '../db';
import { requireAuth, requireRole } from '../middleware/auth';

const router = Router();

router.get('/', requireAuth, async (_req, res) => {
  const suppliers = await prisma.supplier.findMany({ orderBy: { name: 'asc' } });
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
      created_by: s.createdBy,
      created_at: s.createdAt,
      modified_by: s.modifiedBy,
      modified_at: s.modifiedAt
    }))
  );
});

// Every role may create a Supplier except TASS.
router.post('/', requireAuth, requireRole('SALES_COORDINATOR', 'LOGISTICS', 'ADMIN', 'DRIVER'), async (req, res) => {
  const { name, contact_person, email, phone, address, city, category } = req.body ?? {};
  if (!name) return res.status(400).json({ error: 'name is required' });

  const validCategories = ['Hardware', 'Consumables', 'Electronics', 'Packaging', 'Services'];
  if (category && !validCategories.includes(category)) {
    return res.status(400).json({ error: `category must be one of: ${validCategories.join(', ')}` });
  }

  const created = await prisma.supplier.create({
    data: {
      name,
      contactPerson: contact_person ?? '',
      email: email ?? '',
      phone: phone ?? '',
      address: address ?? '',
      city: city ?? '',
      category: category ?? 'Services',
      createdBy: req.user!.name,
      modifiedBy: req.user!.name,
      modifiedAt: new Date()
    }
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
    created_by: created.createdBy,
    created_at: created.createdAt,
    modified_by: created.modifiedBy,
    modified_at: created.modifiedAt
  });
});

export default router;
