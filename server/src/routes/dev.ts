import { Router } from 'express';
import { runSeed } from '../../prisma/seed';
import { requireAuth, requireResource, requireRole } from '../middleware/auth';
import { canResetLocalDemo } from '../services/localDemoReset';

const router = Router();

// The former anonymous public-seed and public-seed-uat endpoints are removed.
router.get('/reset-capability', requireAuth, requireResource('admin'), requireRole('ADMIN'), (req, res) => {
  res.json({ enabled: canResetLocalDemo(req) });
});

router.post('/reset-seed', requireAuth, requireResource('admin'), requireRole('ADMIN'), async (req, res) => {
  if (!canResetLocalDemo(req)) {
    return res.status(403).json({ error: 'Demo reset is available only on a verified local disposable database' });
  }
  try {
    await runSeed(true);
    res.json({ ok: true });
  } catch (error) {
    console.error('Local demo reset failed:', error);
    res.status(500).json({ error: 'Failed to reset local demo data' });
  }
});

export default router;
