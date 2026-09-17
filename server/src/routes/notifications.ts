import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import {
  listNotifications,
  getUnreadCount,
  markAllRead,
  markOneRead,
  sendNotificationEmail
} from '../controllers/notifications.controller';

const router = Router();

router.get('/', requireAuth, listNotifications);
router.get('/unread-count', requireAuth, getUnreadCount);
router.patch('/read-all', requireAuth, markAllRead);
router.patch('/:id/read', requireAuth, markOneRead);
router.post('/send-email', requireAuth, sendNotificationEmail);

export default router;
