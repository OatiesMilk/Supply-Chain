import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { accessLog } from './middleware/accessLog';
import path from 'path';
import fs from 'fs';
import { prisma } from './db';
import {
  notify4PM, notify6PM, notifyWeeklyReport, saveDailyStatusSnapshot, scheduleDaily, scheduleWeekly,
} from './services/scheduledNotifications';
import healthRoutes, { HEALTH_PATH } from './routes/health';

import authRoutes from './routes/auth';
import recordsRoutes from './routes/records';
import rmaDispatchRoutes from './routes/rmaDispatch';
import companiesRoutes from './routes/companies';
import accountManagersRoutes from './routes/accountManagers';
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
import { applySecurity } from './middleware/security';
import { removeStaleUploads } from './services/podStorage';
import { startPodDeletionCleanup } from './services/podDeletionCleanup';

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

// In dev, the Vite dev server (port 3000) proxies /api/v1 to here, so we need
// CORS to allow that cross-origin cookie. In production, Express serves the
// built frontend directly — same origin, so CORS is not needed.
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:3000';
app.use(cors({ origin: CLIENT_ORIGIN, credentials: true }));

// Production logs omit all queries; Microsoft callback queries are also
// omitted during development because they contain sign-in codes and state.
app.use(accessLog);
app.use(express.json());
app.use(cookieParser());
// AUD-003: must stay ahead of every route below.
applySecurity(app);

// Render and the client probe public readiness; detailed identities/configuration
// remain behind /api/v1/admin/deployment-status and /integration-status.
app.use(HEALTH_PATH, healthRoutes);

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/records', rmaDispatchRoutes);
app.use('/api/v1/records', recordsRoutes);
app.use('/api/v1/companies', companiesRoutes);
app.use('/api/v1/account-managers', accountManagersRoutes);
app.use('/api/v1/customers', customersRoutes);
app.use('/api/v1/suppliers', suppliersRoutes); // Includes supplier category catalog/assignment endpoints.
app.use('/api/v1/users', usersRoutes);
app.use('/api/v1/dashboard', dashboardRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/skus', skusRoutes);
app.use('/api/v1/transactions', transactionsRoutes);
app.use('/api/v1/notifications', notificationsRoutes);
// TSK-122: deprecated dev router is empty. HTTP resets have been removed.
app.use('/api/v1/dev', devRoutes);
app.use('/api/v1/data-sampler', dataSamplerRoutes);
app.use('/api/v1/reports', reportsRoutes);
app.use('/api/v1/drivers', driversRoutes);

// API misses are JSON 404s, including in production when the SPA is served.
app.use('/api', (_req, res) => { res.status(404).json({ error: 'API endpoint not found. Use /api/v1.' }); });

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

app.listen(PORT, () => {
  console.log(`Microgenesis Supply Chain Portal API listening on http://localhost:${PORT}`);
  saveDailyStatusSnapshot(); // seed today's snapshot immediately on boot
  // SEC-07: clear quarantined uploads abandoned by a previous crash or restart.
  removeStaleUploads().catch(err => console.error('[POD] Stale upload cleanup failed', err));
  startPodDeletionCleanup();

  // Self-ping to prevent Render free tier from sleeping
  const externalUrl = process.env.RENDER_EXTERNAL_URL;
  if (externalUrl) {
    setInterval(() => {
      fetch(`${externalUrl}${HEALTH_PATH}`)
        .then(res => res.json())
        .then(data => console.log('[Self-Ping]', data))
        .catch(err => console.error('[Self-Ping Error]', err.message));
    }, 10 * 60 * 1000); // 10 minutes
  }
});

// ── Daily scheduled notifications ────────────────────────────────────────────
scheduleDaily(16, 0, () => { void notify4PM(); });
scheduleDaily(18, 0, () => { void notify6PM(); });
scheduleWeekly(1, 8, 0, () => { void notifyWeeklyReport(); }); // Monday 8AM
