import { Router } from 'express';
import { runSeed } from '../../prisma/seed';
import { runUatSeed } from '../../prisma/seed-uat';
import { requireResource, requireAuth, requireRole } from '../middleware/auth';

const router = Router();

// Dev-only convenience endpoint backing the frontend's "Reset Demo Data" button.
// Guarded with Admin role check and strictly disabled in production environments.
router.post('/reset-seed', requireAuth, requireResource('admin'), requireRole('ADMIN'), async (_req, res) => {
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

// Public endpoint for demo seeding directly from the login page.
// Be careful: this allows unauthenticated database resets!
router.post('/public-seed', async (_req, res) => {
  try {
    await runSeed(true);
    res.json({ ok: true });
  } catch (err) {
    console.error('Public seed failed:', err);
    res.status(500).json({ error: 'Failed to reset seed data' });
  }
});

router.post('/public-seed-uat', async (_req, res) => {
  if (process.env.NODE_ENV === 'production' || process.env.UAT_SEED_ENABLED !== 'true') {
    return res.status(403).json({ error: 'UAT seed is disabled in this environment' });
  }

  try {
    const result = await runUatSeed();
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('UAT seed failed:', err);
    res.status(500).json({ error: 'Failed to prepare UAT data' });
  }
});

export default router;
