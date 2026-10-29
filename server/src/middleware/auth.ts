import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { createHmac } from 'node:crypto';
import { prisma } from '../db';
import { asyncRoute } from './asyncRoute';
import { sessionUser, type Screen, type Resource, type Permission } from '../services/permissions';
import { evaluatePermissions, type EffectivePermissionSnapshot } from '../services/permissionEvaluator';

export type Role = 'SALES_COORDINATOR' | 'LOGISTICS' | 'TASS' | 'ADMIN' | 'DRIVER';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  permissions: Permission[];
  effectiveScreens: Screen[];
  resources: Resource[];
  permissionVersion: string;
  // DRIVER only: the Admin-linked Driver profile that owns assigned runs.
  // Null means no runs are visible; display names never decide ownership.
  driverProfileId?: string | null;
  // Request-scoped RMA policy. Null denies RMA when the foundation is unavailable.
  rmaPermissions?: EffectivePermissionSnapshot | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

const COOKIE_NAME = 'mg_session';

if (!process.env.JWT_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('FATAL: JWT_SECRET environment variable is missing in production environment.');
}
const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-insecure-secret';

export function signToken(user: Pick<AuthUser, 'id' | 'name' | 'email' | 'role'>): string {
  return jwt.sign(user, JWT_SECRET, { expiresIn: '8h' });
}

// The session JWT as issued: the fields CSRF and rate-limit checks need
// without a database read.
export type SessionClaims = Pick<AuthUser, 'id'> & { iat?: number };

// Signature-checked session from the cookie, or null. This does not confirm the
// account still exists or is active; requireAuth does that.
export function readSession(req: Request): SessionClaims | null {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return null;
  try {
    return jwt.verify(token, JWT_SECRET) as SessionClaims;
  } catch {
    return null;
  }
}

// AUD-003: anti-CSRF token bound to one signed session (user + issue time).
// The browser receives it in a response header that only same-origin script
// can read, and must echo it on every cookie-authenticated write.
export const CSRF_HEADER = 'X-CSRF-Token';

export function csrfToken(session: SessionClaims): string {
  return createHmac('sha256', JWT_SECRET).update(`csrf:${session.id}:${session.iat ?? 0}`).digest('base64url');
}

// Production cookies are SameSite=None so the portal works inside a Microsoft
// Teams tab; that requires Secure, and is why csrf.ts checks every write.
export function sessionCookieOptions(env: NodeJS.ProcessEnv = process.env) {
  const isProd = env.NODE_ENV === 'production';
  return { httpOnly: true, sameSite: isProd ? 'none' : 'lax', secure: isProd } as const;
}

export function setSessionCookie(res: Response, token: string) {
  res.setHeader(CSRF_HEADER, csrfToken(jwt.decode(token) as SessionClaims));
  res.cookie(COOKIE_NAME, token, { ...sessionCookieOptions(), maxAge: 8 * 60 * 60 * 1000 });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(COOKIE_NAME, sessionCookieOptions());
}

export const requireAuth = asyncRoute(async (req: Request, res: Response, next: NextFunction) => {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  let payload: AuthUser & SessionClaims;
  try {
    payload = jwt.verify(token, JWT_SECRET) as AuthUser & SessionClaims;
  } catch {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }

  // A valid signature doesn't guarantee the user still exists — a demo reset
  // or admin cleanup can wipe/recreate users while old browser sessions are
  // still around. Writes that reference req.user.id (createdById, etc.) would
  // otherwise fail a DB foreign-key check downstream instead of failing here.
  const user = await prisma.user.findUnique({ where: { id: payload.id }, include: { permissions: true, permissionOverrides: true, driverProfile: { select: { id: true, type: true, isActive: true } } } });
  if (!user || !user.isActive) {
    clearSessionCookie(res);
    return res.status(401).json({ error: 'Session no longer valid — please log in again' });
  }

  const session = sessionUser(user) as AuthUser;
  req.user = user.role === 'DRIVER'
    ? { ...session, driverProfileId: user.driverProfile?.type === 'DRIVER' ? user.driverProfile.id : null }
    : session;
  // Missing/incomplete policy never grants the new RMA workflow. Other category
  // activation remains with the separate permission rollout (#247).
  Object.defineProperty(req.user, 'rmaPermissions', { value: null, writable: true, enumerable: false });
  if (Array.isArray(user.permissionOverrides)) {
    const rolePolicy = await prisma.rolePolicy.findUnique({ where: { role: user.role }, include: { permissions: true } });
    req.user.rmaPermissions = evaluatePermissions({
      userId: user.id, role: user.role, isActive: user.isActive,
      authorizationRevision: user.authorizationRevision, overrides: user.permissionOverrides,
      driverProfile: user.driverProfile, rolePolicy,
    });
  }
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader(CSRF_HEADER, csrfToken(payload));
  next();
});

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden for this role' });
    }
    next();
  };
}

export function requireScreen(...screens: Screen[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
    if (!screens.some(screen => req.user!.effectiveScreens.includes(screen))) {
      return res.status(403).json({ error: 'Module access denied' });
    }
    next();
  };
}

export function requireResource(resource: Resource) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
    if (!req.user.resources.includes(resource)) return res.status(403).json({ error: 'Module access denied' });
    next();
  };
}
