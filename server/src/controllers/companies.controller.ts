import { Request, Response } from 'express';
import { prisma } from '../db';

export async function listCompanies(_req: Request, res: Response) {
  const companies = await prisma.company.findMany({ orderBy: { name: 'asc' } });
  res.json(
    companies.map(c => ({
      id: c.id,
      name: c.name,
      sap_number: c.sapNumber,
      address: c.address,
      contact_person: c.contactPerson,
      created_at: c.createdAt
    }))
  );
}

export async function createCompany(req: Request, res: Response) {
  const { name, sap_number, address, contact_person } = req.body ?? {};
  if (!name) return res.status(400).json({ error: 'name is required' });

  const created = await prisma.company.create({
    data: {
      name,
      sapNumber: sap_number ?? '',
      address: address ?? '',
      contactPerson: contact_person ?? ''
    }
  });
  res.status(201).json({
    id: created.id,
    name: created.name,
    sap_number: created.sapNumber,
    address: created.address,
    contact_person: created.contactPerson,
    created_at: created.createdAt
  });
}
