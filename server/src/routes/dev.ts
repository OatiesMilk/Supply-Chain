import { Router } from 'express';
import { runSeed } from '../../prisma/seed';

const router = Router();

// Dev-only convenience endpoint backing the frontend's "Reset Demo Data"
// button now that persistence is server-side. Truncates and re-runs the seed
// script. Intentionally has no RBAC guard beyond requiring the app to be
// running - this endpoint is for local demo resets, not production use.
router.post('/reset-seed', async (_req, res) => {
  try {
    await runSeed(true);
    res.json({ ok: true });
  } catch (err) {
    console.error('Reset seed failed:', err);
    res.status(500).json({ error: 'Failed to reset seed data' });
  }
});

export default router;
