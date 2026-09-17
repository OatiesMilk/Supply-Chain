import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import { listCompanies, createCompany } from '../controllers/companies.controller';

const router = Router();

router.get('/', requireAuth, listCompanies);
router.post('/', requireAuth, requireRole('SALES_COORDINATOR'), createCompany);

export default router;
