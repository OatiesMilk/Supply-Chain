import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../db';
import { asyncRoute } from './asyncRoute';
import { sessionUser, type Screen, type Resource, type Permission } from '../services/permissions';

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

export function setSessionCookie(res: Response, token: string) {
  const isProd = process.env.NODE_ENV === 'production';
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: isProd ? 'none' : 'lax',
    secure: isProd,
    maxAge: 8 * 60 * 60 * 1000
  });
}

export function clearSessionCookie(res: Response) {
  const isProd = process.env.NODE_ENV === 'production';
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    sameSite: isProd ? 'none' : 'lax',
    secure: isProd
  });
}

export const requireAuth = asyncRoute(async (req: Request, res: Response, next: NextFunction) => {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  let payload: AuthUser;
  try {
    payload = jwt.verify(token, JWT_SECRET) as AuthUser;
  } catch {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }

  // A valid signature doesn't guarantee the user still exists — a demo reset
  // or admin cleanup can wipe/recreate users while old browser sessions are
  // still around. Writes that reference req.user.id (createdById, etc.) would
  // otherwise fail a DB foreign-key check downstream instead of failing here.
  const user = await prisma.user.findUnique({ where: { id: payload.id }, include: { permissions: true, driverProfile: { select: { id: true, type: true } } } });
  if (!user || !user.isActive) {
    clearSessionCookie(res);
    return res.status(401).json({ error: 'Session no longer valid — please log in again' });
  }

  const session = sessionUser(user) as AuthUser;
  req.user = user.role === 'DRIVER'
    ? { ...session, driverProfileId: user.driverProfile?.type === 'DRIVER' ? user.driverProfile.id : null }
    : session;
  res.setHeader('Cache-Control', 'no-store');
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
