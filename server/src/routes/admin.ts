import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import { getAuditLog, getIntegrationStatus, sendTestEmail } from '../controllers/admin.controller';

const router = Router();

// Full audit log with pagination and optional filters — ADMIN only.
router.get('/audit-log', requireAuth, requireRole('ADMIN'), getAuditLog);

// ─── Integration diagnostics — ADMIN only ──────────────────────────────────
router.get('/integration-status', requireAuth, requireRole('ADMIN'), getIntegrationStatus);

// ─── Test email — ADMIN only ───────────────────────────────────────────────
router.post('/test-email', requireAuth, requireRole('ADMIN'), sendTestEmail);

export default router;
