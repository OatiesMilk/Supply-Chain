import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import { listDrivers, createDriver, updateDriver, deleteDriver } from '../controllers/drivers.controller';

const router = Router();

router.get('/', requireAuth, listDrivers);

// Create a driver — Logistics + Admin only
router.post('/', requireAuth, requireRole('LOGISTICS', 'ADMIN'), createDriver);

// Update a driver — Logistics + Admin only
router.put('/:id', requireAuth, requireRole('LOGISTICS', 'ADMIN'), updateDriver);

// Delete a driver — Logistics + Admin only
router.delete('/:id', requireAuth, requireRole('LOGISTICS', 'ADMIN'), deleteDriver);

export default router;
