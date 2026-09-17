import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { getStats } from '../controllers/dashboard.controller';

const router = Router();

router.get('/stats', requireAuth, getStats);

export default router;
