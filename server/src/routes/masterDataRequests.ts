import { Router, type Request, type Response } from 'express';
import { prisma } from '../db';
import { requireAuth, requireRole, requireResource, requireAction } from '../middleware/auth';
import { asyncRoute } from '../middleware/asyncRoute';
import {
  MasterDataRequestError, requestErrorResponse, canReadMasterDataRequests, canSubmitMasterDataRequest, listMasterDataRequests, getMasterDataRequest,
  parseSubmitInput, parseApproveInput, parseRejectInput, submitMasterDataRequest, approveMasterDataRequest, rejectMasterDataRequest,
} from '../services/masterDataRequests';

/** In-app Company & Supplier addition requests (Sec 5.4): TASS submits, ADMIN reviews. */
const router = Router();
const handler = (work: (req: Request, res: Response) => Promise<unknown>) => asyncRoute(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try { return await work(req, res); }
  catch (error) {
    const mapped = requestErrorResponse(error);
    if (mapped) return res.status(mapped.status).json(mapped.body);
    throw error;
  }
});
const readable = (req: Request) => {
  if (!canReadMasterDataRequests(req.user!)) throw new MasterDataRequestError(403, 'Addition requests are not available for this account.');
};
const review = [requireAuth, requireRole('ADMIN'), requireResource('admin', 'WRITE'), requireAction('SCREEN', 'admin', 'WRITE')];

router.get('/', requireAuth, requireRole('TASS', 'ADMIN'), handler(async (req, res) => {
  readable(req);
  res.json(await listMasterDataRequests(prisma, req.user!, req.query as Record<string, unknown>));
}));

router.get('/:id', requireAuth, requireRole('TASS', 'ADMIN'), handler(async (req, res) => {
  readable(req);
  res.json(await getMasterDataRequest(prisma, req.user!, req.params.id));
}));

router.post('/', requireAuth, requireRole('TASS'), handler(async (req, res) => {
  const input = parseSubmitInput(req.body);
  // Checked again inside the transaction against the freshly loaded account.
  if (!canSubmitMasterDataRequest(req.user!, input.entityType)) throw new MasterDataRequestError(403, 'Submitting addition requests is not permitted for this account.');
  res.status(201).json(await submitMasterDataRequest(prisma, req.user!.id, input));
}));

router.post('/:id/approve', ...review, handler(async (req, res) => {
  res.json(await approveMasterDataRequest(prisma, req.user!.id, req.params.id, parseApproveInput(req.body)));
}));

router.post('/:id/reject', ...review, handler(async (req, res) => {
  res.json(await rejectMasterDataRequest(prisma, req.user!.id, req.params.id, parseRejectInput(req.body)));
}));

export default router;
