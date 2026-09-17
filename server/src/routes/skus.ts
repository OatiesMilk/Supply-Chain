import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import {
  listSkus,
  getSku,
  getSkuAudit,
  updateSku,
  createSku,
  adjustSkuStock
} from '../controllers/skus.controller';

const router = Router();

// GET /api/skus — All roles, returns all products with inventory
router.get('/', requireAuth, listSkus);

// GET /api/skus/:id — All roles, returns single product + inventory + last 20 transactions
router.get('/:id', requireAuth, getSku);

// GET /api/skus/:id/audit — Admin only
router.get('/:id/audit', requireAuth, requireRole('ADMIN'), getSkuAudit);

// PUT /api/skus/:id — Admin only, update product fields
router.put('/:id', requireAuth, requireRole('ADMIN'), updateSku);

// POST /api/skus — Admin only, create product + inventory row
router.post('/', requireAuth, requireRole('ADMIN'), createSku);

// POST /api/skus/:id/adjust — Admin + Logistics, stock adjustment
router.post('/:id/adjust', requireAuth, requireRole('ADMIN', 'LOGISTICS'), adjustSkuStock);

export default router;
