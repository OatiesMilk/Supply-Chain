import { Request, Response } from 'express';
import { prisma } from '../db';

export async function listCustomers(_req: Request, res: Response) {
  const customers = await prisma.customer.findMany({ orderBy: { name: 'asc' } });
  res.json(
    customers.map(c => ({
      id: c.id,
      name: c.name,
      contact_person: c.contactPerson,
      email: c.email,
      phone: c.phone,
      address: c.address,
      city: c.city,
      created_by: c.createdBy,
      created_at: c.createdAt,
      modified_by: c.modifiedBy,
      modified_at: c.modifiedAt
    }))
  );
}

export async function createCustomer(req: Request, res: Response) {
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
    created_by: created.createdBy,
    created_at: created.createdAt,
    modified_by: created.modifiedBy,
    modified_at: created.modifiedAt
  });
}
