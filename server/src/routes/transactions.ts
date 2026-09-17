import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { listTransactions, getTransaction } from '../controllers/transactions.controller';

const router = Router();

// ─── GET /api/transactions ────────────────────────────────────────────────────
router.get('/', requireAuth, listTransactions);

// ─── GET /api/transactions/:source/:id ───────────────────────────────────────
router.get('/:source/:id', requireAuth, getTransaction);

export default router;
