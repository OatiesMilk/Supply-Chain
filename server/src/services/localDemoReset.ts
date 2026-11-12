import type { Request } from 'express';
import { assertDisposableSeedTarget } from '../../prisma/seed-safety';

export function canResetLocalDemo(req: Request): boolean {
  try {
    assertDisposableSeedTarget();
  } catch {
    return false;
  }
  // Do not trust proxy-controlled headers to prove the client is local.
  return ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress || '') &&
    !req.headers['x-forwarded-for'] && !req.headers.forwarded;
}
