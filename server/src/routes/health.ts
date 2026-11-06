import { Router } from 'express';
import { prisma } from '../db';
import { asyncRoute } from '../middleware/asyncRoute';

export const HEALTH_PATH = '/api/v1/health';

interface HealthOptions {
  checkDatabase?: () => PromiseLike<unknown>;
  env?: NodeJS.ProcessEnv;
}

/** Public readiness reveals only availability; Admin diagnostics remain protected. */
export function createHealthRouter({
  checkDatabase = () => prisma.$queryRaw`SELECT 1`,
  env = process.env,
}: HealthOptions = {}) {
  const router = Router();
  router.get('/', asyncRoute(async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    let healthy = true;
    try {
      await checkDatabase();
    } catch {
      // Driver/provider errors can contain infrastructure details or credentials.
      console.error('[health] Database readiness check failed');
      healthy = false;
    }

    if (env.NODE_ENV === 'production' && (!env.DATABASE_URL || !env.JWT_SECRET)) {
      healthy = false;
    }
    res.status(healthy ? 200 : 503).json({ ok: healthy });
  }));
  return router;
}

export default createHealthRouter();
