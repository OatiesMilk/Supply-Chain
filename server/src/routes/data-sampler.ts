import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import { getModuleCounts, generateSampleRecords, resetData } from '../controllers/data-sampler.controller';

const router = Router();

router.get('/counts', requireAuth, requireRole('ADMIN'), getModuleCounts);
router.post('/generate', requireAuth, requireRole('ADMIN'), generateSampleRecords);
router.post('/reset', requireAuth, requireRole('ADMIN'), resetData);

export default router;
