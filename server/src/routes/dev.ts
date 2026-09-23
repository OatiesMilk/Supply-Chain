import { Router } from 'express';
import { runSeed } from '../../prisma/seed';
import { requireAuth, requireRole } from '../middleware/auth';

const router = Router();

// Dev-only convenience endpoint backing the frontend's "Reset Demo Data" button.
// Guarded with Admin role check and strictly disabled in production environments.
router.post('/reset-seed', requireAuth, requireRole('ADMIN'), async (_req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'Endpoint disabled in production environment' });
  }

  try {
    await runSeed(true);
    res.json({ ok: true });
  } catch (err) {
    console.error('Reset seed failed:', err);
    res.status(500).json({ error: 'Failed to reset seed data' });
  }
});

export default router;
