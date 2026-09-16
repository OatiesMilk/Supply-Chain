import { Router } from 'express';
import { runSeed } from '../../prisma/seed';
import { requireAuth, requireRole } from '../middleware/auth';

const router = Router();

const IS_PROD = process.env.NODE_ENV === 'production';

// Dev-only convenience endpoint backing the frontend's "Reset Demo Data"
// button now that persistence is server-side. Truncates and re-runs the seed
// script. Requires an authenticated Admin, and is disabled entirely in
// production - this is for local/staging demo resets, never a live database.
router.post('/reset-seed', requireAuth, requireRole('ADMIN'), async (_req, res) => {
  if (IS_PROD) {
    return res.status(403).json({ error: 'Demo reset is disabled in production' });
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
