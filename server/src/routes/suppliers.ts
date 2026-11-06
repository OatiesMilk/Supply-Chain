import { Router, type Request, type Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { requireScreen, requireResource, requireAuth, requireRole, requireAction } from '../middleware/auth';
import { asyncRoute } from '../middleware/asyncRoute';
import { SupplierInputError, supplierWrite, textField, expectedVersion, categoryIds, categoryDto,
  supplierDto, supplierInclude, categorySnapshot, selectedCategories, normalizedCategoryName } from '../services/supplierCategories';

const router = Router();
const supplierHandler = (handler: (req: Request, res: Response) => Promise<unknown>) => asyncRoute(async (req, res) => {
  try { return await handler(req, res); }
  catch (error) {
    if (error instanceof SupplierInputError) return res.status(error.status).json({ error: error.message });
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return res.status(409).json({ error: 'A category with this name already exists, including inactive categories.' });
    }
    throw error;
  }
});
const manage = [requireAuth, requireResource('suppliers', 'WRITE'), requireScreen('suppliers'),
  requireAction('SCREEN', 'suppliers', 'WRITE'), requireRole('ADMIN')];

router.get('/', requireAuth, requireResource('suppliers'), supplierHandler(async (_req, res) => {
  const suppliers = await prisma.supplier.findMany({ orderBy: { name: 'asc' }, include: supplierInclude });
  res.json(suppliers.map(supplierDto));
}));
router.get('/categories', requireAuth, requireResource('suppliers'), supplierHandler(async (_req, res) => {
  res.json((await prisma.supplierCategory.findMany({ orderBy: { name: 'asc' } })).map(categoryDto));
}));
router.post('/categories', ...manage, supplierHandler(async (req, res) => {
  const name = textField(req.body?.name, 'Category name', true, 120);
  const created = await supplierWrite(async tx => {
    const category = await tx.supplierCategory.create({ data: { name, normalizedName: await normalizedCategoryName(tx, name) } });
    await tx.auditLog.create({ data: { recordId: category.id, recordType: 'SupplierCategory', action: 'CREATE',
      changedById: req.user!.id, previousValue: null, newValue: JSON.stringify(categoryDto(category)) } });
    return category;
  });
  res.status(201).json(categoryDto(created));
}));
router.patch('/categories/:id', ...manage, supplierHandler(async (req, res) => {
  const version = expectedVersion(req.body?.expected_version);
  const name = req.body?.name === undefined ? undefined : textField(req.body.name, 'Category name', true, 120);
  const isActive = req.body?.is_active;
  if (isActive !== undefined && typeof isActive !== 'boolean') throw new SupplierInputError('is_active must be boolean');
  if (name === undefined && isActive === undefined) throw new SupplierInputError('A category change is required');
  const updated = await supplierWrite(async tx => {
    const previous = await tx.supplierCategory.findUnique({ where: { id: req.params.id } });
    if (!previous) throw new SupplierInputError('Category not found', 404);
    if (previous.version !== version) throw new SupplierInputError('Category changed. Refresh before editing again.', 409);
    if ((name === undefined || name === previous.name) && (isActive === undefined || isActive === previous.isActive)) return previous;
    const category = await tx.supplierCategory.update({ where: { id: previous.id }, data: {
      ...(name === undefined ? {} : { name, normalizedName: await normalizedCategoryName(tx, name) }),
      ...(isActive === undefined ? {} : { isActive }), version: { increment: 1 },
    } });
    await tx.auditLog.create({ data: { recordId: category.id, recordType: 'SupplierCategory', action: 'UPDATE',
      changedById: req.user!.id, previousValue: JSON.stringify(categoryDto(previous)), newValue: JSON.stringify(categoryDto(category)) } });
    return category;
  });
  res.json(categoryDto(updated));
}));

router.post('/', requireAuth, requireResource('suppliers', 'CREATE'), requireScreen('suppliers'),
  requireAction('SCREEN', 'suppliers', 'WRITE'), requireRole('SALES_COORDINATOR', 'LOGISTICS', 'ADMIN', 'DRIVER'), supplierHandler(async (req, res) => {
    const body = req.body ?? {};
    const name = textField(body.name, 'Supplier name', true);
    const details = { contactPerson: textField(body.contact_person, 'Contact person'), email: textField(body.email, 'Email'),
      phone: textField(body.phone, 'Phone'), address: textField(body.address, 'Address', false, 1000), city: textField(body.city, 'City') };
    if (body.category_ids !== undefined && body.category !== undefined) throw new SupplierInputError('Use category_ids or legacy category, not both');
    // Compatibility for existing API callers: a single known active label only.
    const ids = body.category_ids === undefined ? undefined : categoryIds(body.category_ids);
    const legacy = ids ? undefined : textField(body.category, 'Category', true, 120);
    const created = await supplierWrite(async tx => {
      const legacyCategory = legacy ? await tx.supplierCategory.findUnique({ where: { normalizedName: await normalizedCategoryName(tx, legacy) } }) : undefined;
      if (!ids && !legacyCategory) throw new SupplierInputError('Select an existing active category');
      const categories = await selectedCategories(tx, ids ?? [legacyCategory!.id]);
      const supplier = await tx.supplier.create({ data: {
        name, ...details, category: categories.map(category => category.name).join('; '),
        categories: { create: categories.map(category => ({ categoryId: category.id })) },
        createdById: req.user!.id, modifiedById: req.user!.id,
      }, include: supplierInclude });
      const dto = supplierDto(supplier);
      await tx.auditLog.create({ data: { recordId: supplier.id, recordType: 'Supplier', action: 'CREATE', changedById: req.user!.id,
        previousValue: null, newValue: JSON.stringify({ name: dto.name, contact_person: dto.contact_person, email: dto.email,
          phone: dto.phone, address: dto.address, city: dto.city, category: dto.category, categories: categorySnapshot(categories) }) } });
      return dto;
    });
    res.status(201).json(created);
  }));

router.put('/:id/categories', ...manage, supplierHandler(async (req, res) => {
  const ids = categoryIds(req.body?.category_ids), version = expectedVersion(req.body?.expected_version);
  const updated = await supplierWrite(async tx => {
    const previous = await tx.supplier.findUnique({ where: { id: req.params.id }, include: supplierInclude });
    if (!previous) throw new SupplierInputError('Supplier not found', 404);
    if (previous.version !== version) throw new SupplierInputError('Supplier changed. Refresh before editing again.', 409);
    const retained = previous.categories.map(link => link.categoryId);
    const categories = await selectedCategories(tx, ids, retained);
    if (ids.length === retained.length && ids.every(id => retained.includes(id))) return supplierDto(previous);
    const supplier = await tx.supplier.update({ where: { id: previous.id }, data: {
      category: categories.map(category => category.name).join('; '),
      categories: { deleteMany: {}, create: categories.map(category => ({ categoryId: category.id })) },
      version: { increment: 1 }, modifiedById: req.user!.id,
    }, include: supplierInclude });
    await tx.auditLog.create({ data: { recordId: supplier.id, recordType: 'Supplier', action: 'UPDATE', changedById: req.user!.id,
      previousValue: JSON.stringify({ categories: categorySnapshot(previous.categories.map(link => link.category)) }),
      newValue: JSON.stringify({ categories: categorySnapshot(categories) }) } });
    return supplierDto(supplier);
  });
  res.json(updated);
}));

export default router;
