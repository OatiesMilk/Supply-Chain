import type { Request, Response, NextFunction, RequestHandler } from 'express';

// Express 4 does not automatically forward rejected async handlers.
export const asyncRoute = (handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => Promise.resolve().then(() => handler(req, res, next)).catch(next);
