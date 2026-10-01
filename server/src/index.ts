import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import morgan from 'morgan';
import path from 'path';
import fs from 'fs';
import { prisma } from './db';
import { notifyRole, notifyUser } from './services/inAppNotify';
import { sendMailReal, sendEmail } from './services/mailer';

import authRoutes from './routes/auth';
import recordsRoutes from './routes/records';
import companiesRoutes from './routes/companies';
import customersRoutes from './routes/customers';
import suppliersRoutes from './routes/suppliers';
import usersRoutes from './routes/users';
import dashboardRoutes from './routes/dashboard';
import adminRoutes from './routes/admin';
import skusRoutes from './routes/skus';
import transactionsRoutes from './routes/transactions';
import notificationsRoutes from './routes/notifications';
import devRoutes from './routes/dev';
import dataSamplerRoutes from './routes/data-sampler';
import reportsRoutes from './routes/reports';
import driversRoutes from './routes/drivers';
import { uploadErrorHandler } from './middleware/uploadErrors';

const app = express();
const PORT = Number(process.env.PORT) || 4000;
const IS_PROD = process.env.NODE_ENV === 'production';

// A rejected promise inside an `async (req, res) => {...}` route handler that
// never calls next(err) escapes Express entirely — Node then treats it as an
// unhandled rejection, which crashes the whole process by default (taking
// down every in-flight request for every user, not just the one that hit the
// bug). Log it instead of letting a single bad request kill the service.
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
});

// In dev, the Vite dev server (port 3000) proxies /api to here, so we need
// CORS to allow that cross-origin cookie. In production, Express serves the
// built frontend directly — same origin, so CORS is not needed.
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:3000';
app.use(cors({ origin: CLIENT_ORIGIN, credentials: true }));

app.use(morgan('dev'));
app.use(express.json());
app.use(cookieParser());

// Render polls this before routing live traffic to a new instance (see
// `healthCheckPath` in render.yaml), so it must actually verify the service
// can do its job, not just that the process is alive.
app.get('/api/health', async (_req, res) => {
  const checks: Record<string, string> = {};
  let healthy = true;

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = 'ok';
  } catch (err) {
    console.error('[health] database check failed', err);
    checks.database = 'unreachable';
    healthy = false;
  }

  checks.mailer =
    process.env.AZURE_CLIENT_ID && process.env.AZURE_CLIENT_SECRET && process.env.AZURE_TENANT_ID
      ? 'graph'
      : process.env.SMTP_HOST
        ? 'smtp'
        : 'mock';

  const missingEnv = ['DATABASE_URL', 'JWT_SECRET'].filter((key) => !process.env[key]);
  checks.environment = missingEnv.length === 0 ? 'ok' : `missing: ${missingEnv.join(', ')}`;
  if (IS_PROD && missingEnv.length > 0) healthy = false;

  res.status(healthy ? 200 : 503).json({ ok: healthy, checks });
});

app.use('/api/auth', authRoutes);
app.use('/api/records', recordsRoutes);
app.use('/api/companies', companiesRoutes);
app.use('/api/customers', customersRoutes);
app.use('/api/suppliers', suppliersRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/skus', skusRoutes);
app.use('/api/transactions', transactionsRoutes);
app.use('/api/notifications', notificationsRoutes);
// Demo reset endpoint — available in all environments since this is a demo app.
// The route itself requires confirmation before wiping data.
app.use('/api/dev', devRoutes);
app.use('/api/data-sampler', dataSamplerRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/drivers', driversRoutes);

// In production, serve the built Vite frontend and handle client-side routing
// by falling back to index.html for any non-API route.
if (IS_PROD) {
  // Point to the client workspace dist folder
  const FRONTEND_DIST = process.env.FRONTEND_DIST || path.join(process.cwd(), '..', 'client', 'dist');
  if (fs.existsSync(FRONTEND_DIST)) {
    app.use(express.static(FRONTEND_DIST));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(FRONTEND_DIST, 'index.html'));
    });
  } else {
    console.warn(`[warn] FRONTEND_DIST not found at ${FRONTEND_DIST} — frontend will not be served`);
  }
}

app.use(uploadErrorHandler);
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.get('/api/health', (req, res) => {
  res.status(200).json({ ok: true, timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`Microgenesis Supply Chain Portal API listening on http://localhost:${PORT}`);
  saveDailyStatusSnapshot(); // seed today's snapshot immediately on boot

  // Self-ping to prevent Render free tier from sleeping
  const externalUrl = process.env.RENDER_EXTERNAL_URL;
  if (externalUrl) {
    setInterval(() => {
      fetch(`${externalUrl}/api/health`)
        .then(res => res.json())
        .then(data => console.log('[Self-Ping]', data))
        .catch(err => console.error('[Self-Ping Error]', err.message));
    }, 10 * 60 * 1000); // 10 minutes
  }
});

// ── Daily scheduled notifications ────────────────────────────────────────────

function scheduleDaily(hour: number, minute: number, task: () => void) {
  const now = new Date();
  const next = new Date(now);
  next.setHours(hour, minute, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  setTimeout(() => {
    task();
    setInterval(task, 24 * 60 * 60 * 1000);
  }, next.getTime() - now.getTime());
}

async function notify4PM() {
  try {
    // 4 PM logistics alert: unassigned scheduled records
    const unassigned = await prisma.deliveryRecord.findMany({
      where: { status: 'SCHEDULED', driver: '', deletedAt: null }
    });
    if (unassigned.length > 0) {
      await notifyRole(
        'LOGISTICS',
        `${unassigned.length} record${unassigned.length !== 1 ? 's' : ''} still need a driver`,
        `4 PM reminder: ${unassigned.length} scheduled delivery${unassigned.length !== 1 ? 'ies' : ''} have no driver assigned.`
      );
    }

    // 4 PM account manager alert: their unfinished records
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const openRecords = await prisma.deliveryRecord.findMany({
      where: { deletedAt: null, status: { notIn: ['ACCOMPLISHED'] } },
      include: { company: true }
    });
    if (openRecords.length === 0) return;

    const byAM: Record<string, typeof openRecords> = {};
    for (const rec of openRecords) {
      if (!byAM[rec.accountManager]) byAM[rec.accountManager] = [];
      byAM[rec.accountManager].push(rec);
    }

    const categoryLabel: Record<string, string> = {
      DELIVERY: 'Delivery', RMA: 'RMA', ACCOUNTING_COLLECTION: 'Collection',
      PROCUREMENT_PICKUP: 'Procurement', SALES_ORDERS: 'Sales Order'
    };

    for (const [amName, recs] of Object.entries(byAM)) {
      // Deduplicate: skip if we already sent the 4 PM AM alert today for this person
      const alreadySent = await prisma.notificationLog.findFirst({
        where: { triggerEvent: '4PM_AM_DAILY', recipientName: amName, sentAt: { gte: todayStart } }
      });
      if (alreadySent) continue;

      // Look up the AM as an active user by name match
      const amUser = await prisma.user.findFirst({
        where: { isActive: true, name: { contains: amName } }
      });

      const preview = recs.slice(0, 3)
        .map(r => `${r.reference} (${categoryLabel[r.category] ?? r.category}) — ${r.company?.name ?? ''}`)
        .join('; ') + (recs.length > 3 ? ` +${recs.length - 3} more` : '');

      const title = `4 PM: ${recs.length} open record${recs.length !== 1 ? 's' : ''} assigned to you`;
      const message = `Still open as of 4 PM: ${preview}`;

      if (amUser) {
        await notifyUser(amUser.id, title, message);
        await sendEmail({ to: amUser.email, subject: title, text: message });
      }

      await prisma.notificationLog.create({
        data: {
          triggerEvent: '4PM_AM_DAILY',
          recipientRole: amUser?.role ?? 'SALES_COORDINATOR',
          recipientName: amName,
          message: `${recs.length} open records`,
          status: amUser ? 'SENT' : 'MOCKED'
        }
      });
    }
  } catch (err) {
    console.error('[4PM notify]', err);
  }
}

async function notify6PM() {
  try {
    const stillOpen = await prisma.deliveryRecord.findMany({
      where: { status: 'SCHEDULED', deletedAt: null }
    });
    if (stillOpen.length > 0) {
      await notifyRole(
        'LOGISTICS',
        `${stillOpen.length} scheduled delivery${stillOpen.length !== 1 ? 'ies' : ''} still open`,
        `End-of-day check: ${stillOpen.length} record${stillOpen.length !== 1 ? 's' : ''} remain Scheduled and have not been delivered.`
      );
      await notifyRole(
        'SALES_COORDINATOR',
        `${stillOpen.length} delivery${stillOpen.length !== 1 ? 'ies' : ''} not yet accomplished`,
        `6 PM: ${stillOpen.length} record${stillOpen.length !== 1 ? 's' : ''} are still in Scheduled status.`
      );
    }
  } catch (err) {
    console.error('[6PM notify]', err);
  }

  await saveDailyStatusSnapshot();
}

async function saveDailyStatusSnapshot() {
  try {
    const today = new Date().toISOString().split('T')[0];

    const allRecords = await prisma.deliveryRecord.findMany({
      where: { deletedAt: null },
      select: { category: true, status: true }
    });

    // Group by category + status
    const byCategoryStatus: Record<string, number> = {};
    const byStatusTotal: Record<string, number> = {};
    for (const r of allRecords) {
      const key = `${r.category}::${r.status}`;
      byCategoryStatus[key] = (byCategoryStatus[key] ?? 0) + 1;
      byStatusTotal[r.status] = (byStatusTotal[r.status] ?? 0) + 1;
    }

    for (const [key, count] of Object.entries(byCategoryStatus)) {
      const [category, status] = key.split('::');
      await prisma.dailyStatusSnapshot.upsert({
        where: { date_category_status: { date: today, category, status } },
        update: { count },
        create: { date: today, category, status, count }
      });
    }

    for (const [status, count] of Object.entries(byStatusTotal)) {
      await prisma.dailyStatusSnapshot.upsert({
        where: { date_category_status: { date: today, category: 'ALL', status } },
        update: { count },
        create: { date: today, category: 'ALL', status, count }
      });
    }

    console.log(`[Daily Snapshot] Saved status counts for ${today}`);
  } catch (err) {
    console.error('[Daily Snapshot]', err);
  }
}

// Fires once per week on the given day (0=Sun,1=Mon,...) at hour:minute.
function scheduleWeekly(dayOfWeek: number, hour: number, minute: number, task: () => void) {
  const now = new Date();
  const next = new Date(now);
  next.setHours(hour, minute, 0, 0);
  const daysUntil = (dayOfWeek - now.getDay() + 7) % 7;
  next.setDate(next.getDate() + (daysUntil === 0 && next <= now ? 7 : daysUntil));
  setTimeout(() => {
    task();
    setInterval(task, 7 * 24 * 60 * 60 * 1000);
  }, next.getTime() - now.getTime());
}

async function notifyWeeklyReport() {
  try {
    const now     = new Date();
    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const dateTo   = now.toISOString().split('T')[0];
    const dateFrom = weekAgo.toISOString().split('T')[0];

    const records = await prisma.deliveryRecord.findMany({
      where: { deletedAt: null, deliveryDate: { gte: dateFrom, lte: dateTo } },
      select: { status: true, category: true }
    });

    const total        = records.length;
    const accomplished = records.filter(r => r.status === 'ACCOMPLISHED').length;
    const onHold       = records.filter(r => r.status === 'ON_HOLD').length;
    const rate         = total > 0 ? Math.round((accomplished / total) * 100) : 0;

    const weekLabel = `${dateFrom} to ${dateTo}`;
    const title   = `Weekly Report — ${weekLabel}`;
    const message = `Week of ${weekLabel}: ${total} record${total !== 1 ? 's' : ''} total, ${accomplished} delivered (${rate}% completion rate), ${onHold} on hold.`;

    const targetUsers = await prisma.user.findMany({
      where: { role: { in: ['LOGISTICS', 'ADMIN'] }, isActive: true },
      select: { id: true, email: true, name: true }
    });

    // In-app notification for each Logistics/Admin user
    for (const u of targetUsers) {
      await notifyUser(u.id, title, message);
    }

    // Write NotificationLog
    await prisma.notificationLog.create({
      data: {
        triggerEvent:  'WEEKLY_REPORT',
        recipientRole: 'LOGISTICS|ADMIN',
        recipientName: `${targetUsers.length} user${targetUsers.length !== 1 ? 's' : ''}`,
        message,
        status: 'SENT'
      }
    });

    // Send real email if SMTP_HOST is configured; skip silently otherwise
    for (const u of targetUsers) {
      await sendMailReal({ to: u.email, subject: title, text: message });
    }

    console.log(`[Weekly Report] Sent for ${weekLabel} to ${targetUsers.length} users`);
  } catch (err) {
    console.error('[Weekly Report]', err);
  }
}

scheduleDaily(16, 0, () => { notify4PM(); });
scheduleDaily(18, 0, () => { notify6PM(); });
scheduleWeekly(1, 8, 0, () => { notifyWeeklyReport(); }); // Monday 8AM
