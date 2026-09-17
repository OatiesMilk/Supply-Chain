import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import { listSuppliers, createSupplier } from '../controllers/suppliers.controller';

const router = Router();

router.get('/', requireAuth, listSuppliers);

// Every role may create a Supplier except TASS.
router.post('/', requireAuth, requireRole('SALES_COORDINATOR', 'LOGISTICS', 'ADMIN', 'DRIVER'), createSupplier);

export default router;
