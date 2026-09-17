import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import { listCustomers, createCustomer } from '../controllers/customers.controller';

const router = Router();

router.get('/', requireAuth, listCustomers);

// Every role may create a Customer except TASS.
router.post('/', requireAuth, requireRole('SALES_COORDINATOR', 'LOGISTICS', 'ADMIN', 'DRIVER'), createCustomer);

export default router;
