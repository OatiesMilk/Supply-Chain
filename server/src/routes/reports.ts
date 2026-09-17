import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import { getDailyStatusHistory, getSummary } from '../controllers/reports.controller';

const router = Router();

router.get('/daily-status-history', requireAuth, requireRole('LOGISTICS', 'ADMIN'), getDailyStatusHistory);
router.get('/summary', requireAuth, requireRole('LOGISTICS', 'ADMIN'), getSummary);

export default router;
