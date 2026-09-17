import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import {
  listRecords,
  getStatusHistoryCounts,
  getRecord,
  getRecordAudit,
  getRecordRemarks,
  createRecord,
  updateRecord,
  updateRecordStatus,
  verifyCollection,
  deleteRecord,
  getRecordComments,
  createRecordComment
} from '../controllers/records.controller';

const router = Router();

router.get('/', requireAuth, listRecords);

// Must be before /:id to avoid "status-history-counts" matching as an ID
router.get('/status-history-counts', requireAuth, getStatusHistoryCounts);

router.get('/:id', requireAuth, getRecord);

router.get('/:id/audit', requireAuth, getRecordAudit);

// Append-only remarks history
router.get('/:id/remarks', requireAuth, getRecordRemarks);

// Create - Sales Coordinator only.
// SoD: Sales Coordinator cannot assign drivers; driver assignment is Logistics-only.
router.post('/', requireAuth, requireRole('SALES_COORDINATOR', 'LOGISTICS'), createRecord);

// Full update - ADMIN added alongside LOGISTICS for linked collection management.
// SoD: only LOGISTICS/ADMIN may set driver/vehicle/driverAssistant/linkedCollectionId.
router.put('/:id', requireAuth, requireRole('SALES_COORDINATOR', 'LOGISTICS', 'ADMIN', 'DRIVER', 'TASS'), updateRecord);

// Status change — Logistics, Sales Coordinator, Admin, and Driver (own records).
// This is also the sole path that fires the ACCOMPLISHED automated trigger.
router.patch('/:id/status', requireAuth, requireRole('SALES_COORDINATOR', 'LOGISTICS', 'ADMIN', 'DRIVER', 'TASS'), updateRecordStatus);

// Collection verification - TASS only, for ACCOUNTING_COLLECTION records that are ACCOMPLISHED.
router.patch('/:id/verify-collection', requireAuth, requireRole('TASS'), verifyCollection);

// Soft delete only - never hard-delete, per spec.
router.delete('/:id', requireAuth, requireRole('SALES_COORDINATOR'), deleteRecord);

// ── Comments ──────────────────────────────────────────────────────────────────
router.get('/:id/comments', requireAuth, getRecordComments);
router.post('/:id/comments', requireAuth, createRecordComment);

export default router;
