import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import {
  listUsers,
  createUser,
  updateUser,
  deactivateUser,
  activateUser,
  getUserPermissions,
  putUserPermissions
} from '../controllers/users.controller';

const router = Router();

// User management — ADMIN only.
router.get('/', requireAuth, requireRole('ADMIN'), listUsers);

// Create user — ADMIN only.
router.post('/', requireAuth, requireRole('ADMIN'), createUser);

// Update user details — ADMIN only.
router.patch('/:id', requireAuth, requireRole('ADMIN'), updateUser);

// Soft-deactivate a user — ADMIN only. Deactivated users cannot log in.
router.patch('/:id/deactivate', requireAuth, requireRole('ADMIN'), deactivateUser);

// Reactivate a user — ADMIN only.
router.patch('/:id/activate', requireAuth, requireRole('ADMIN'), activateUser);

// GET /users/:id/permissions — ADMIN only
router.get('/:id/permissions', requireAuth, requireRole('ADMIN'), getUserPermissions);

// PUT /users/:id/permissions — ADMIN only. Full replacement.
router.put('/:id/permissions', requireAuth, requireRole('ADMIN'), putUserPermissions);

export default router;
