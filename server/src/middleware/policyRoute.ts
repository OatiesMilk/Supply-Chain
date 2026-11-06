import type { Request, Response, NextFunction } from 'express';
import { asyncRoute } from './asyncRoute';
import { PolicyManagementError } from '../services/permissionManagement';

export function policyRoute(handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) {
  return asyncRoute(async (req, res, next) => {
    try { await handler(req, res, next); }
    catch (error) {
      if (error instanceof PolicyManagementError) {
        res.status(error.status).json({ error: error.message, ...(error.details ? { details: error.details } : {}) });
        return;
      }
      throw error;
    }
  });
}
