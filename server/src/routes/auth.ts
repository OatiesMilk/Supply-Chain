import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../db';
import { clearSessionCookie, requireAuth, setSessionCookie, signToken, Role } from '../middleware/auth';

import { asyncRoute } from '../middleware/asyncRoute';
import { sessionUser } from '../services/permissions';
import { createSsoState, validateSsoState, registerSsoState, consumeSsoState, getMsalConfig, SSO_STATE_COOKIE, SSO_STATE_MAX_AGE_MS } from '../services/ssoState';
import { approvedMicrosoftUser } from '../services/ssoIdentity';

const router = Router();

// ─── Email + password login ──────────────────────────────────────────────────

router.post('/login', asyncRoute(async (req, res) => {
  const { email, password } = req.body ?? {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const user = await prisma.user.findUnique({ where: { email: String(email).toLowerCase() }, include: { permissions: true } });
  if (!user) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  if (!user.isActive) {
    return res.status(401).json({ error: 'Account is deactivated' });
  }

  const token = signToken({ id: user.id, name: user.name, email: user.email, role: user.role as Role });
  setSessionCookie(res, token);
  res.setHeader('Cache-Control', 'no-store');
  res.json(sessionUser(user));
}));

router.post('/logout', (_req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req: Request, res: Response) => {
  res.json(req.user);
});

// ─── Microsoft Azure AD SSO ─────────────────────────────────────────────────

router.post('/microsoft', asyncRoute(async (_req: Request, res: Response) => {
  const cfg = getMsalConfig();
  if (!cfg) {
    return res.status(501).json({ error: 'Microsoft login is not configured' });
  }

  const { ConfidentialClientApplication } = await import('@azure/msal-node');

  const msalApp = new ConfidentialClientApplication({
    auth: {
      clientId: cfg.clientId,
      clientSecret: cfg.clientSecret,
      authority: `https://login.microsoftonline.com/${cfg.tenantId}`,
    },
  });

  const redirectUri = `${cfg.appUrl}/api/auth/microsoft/callback`;

  try {
    const state = createSsoState();
    const authUrl = await msalApp.getAuthCodeUrl({
      state,
      scopes: ['openid', 'profile', 'email', 'User.Read'],
      redirectUri,
      responseMode: 'query' as any,
    });
    await registerSsoState(prisma, state);
    res.cookie(SSO_STATE_COOKIE, state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/api/auth/microsoft/callback',
      maxAge: SSO_STATE_MAX_AGE_MS,
    });
    res.setHeader('Cache-Control', 'no-store');
    res.json({ url: authUrl });
  } catch (err) {
    console.error('MSAL getAuthCodeUrl error:', err);
    res.status(500).json({ error: 'Failed to initiate Microsoft login' });
  }
}));

router.get('/microsoft/callback', asyncRoute(async (req: Request, res: Response) => {
  const cfg = getMsalConfig();
  if (!cfg) {
    return res.redirect('/?error=sso_not_configured');
  }

  // Consume the initiating browser's state cookie before any token exchange.
  // SameSite=Lax permits the Microsoft top-level GET redirect, while preventing
  // an unrelated browser session from completing a callback started elsewhere.
  const expectedState = req.cookies?.[SSO_STATE_COOKIE];
  res.clearCookie(SSO_STATE_COOKIE, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/auth/microsoft/callback',
  });
  res.setHeader('Cache-Control', 'no-store');
  if (!validateSsoState(req.query.state, expectedState)) {
    return res.redirect('/?error=sso_invalid_state');
  }
  if (!await consumeSsoState(prisma, req.query.state)) {
    return res.redirect('/?error=sso_invalid_state');
  }

  const code = req.query.code as string | undefined;
  const errorParam = req.query.error as string | undefined;

  if (errorParam || !code) {
    // The provider's error_description may contain sensitive details.
    console.warn('Microsoft SSO provider rejected the sign-in');
    return res.redirect(`/?error=sso_failed`);
  }

  const { ConfidentialClientApplication } = await import('@azure/msal-node');

  const msalApp = new ConfidentialClientApplication({
    auth: {
      clientId: cfg.clientId,
      clientSecret: cfg.clientSecret,
      authority: `https://login.microsoftonline.com/${cfg.tenantId}`,
    },
  });

  const redirectUri = `${cfg.appUrl}/api/auth/microsoft/callback`;

  try {
    const result = await msalApp.acquireTokenByCode({
      code,
      scopes: ['openid', 'profile', 'email', 'User.Read'],
      redirectUri,
    });

    const claims = result.idTokenClaims as Record<string, unknown> | undefined;
    const approval = await approvedMicrosoftUser(prisma, claims, cfg.tenantId);
    if ('error' in approval) return res.redirect(`/?error=${approval.error}`);
    const user = approval.user;

    const token = signToken({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role as Role,
    });
    setSessionCookie(res, token);
    res.redirect('/');
  } catch (err) {
    // Do not log authorization codes, state, tokens or claim payloads.
    console.error('Microsoft SSO callback failed');
    res.redirect('/?error=sso_failed');
  }
}));

// ─── SSO status (lets frontend know if Microsoft login is available) ────────

router.get('/microsoft/status', (_req: Request, res: Response) => {
  const configured = !!getMsalConfig();
  res.json({ configured });
});

export default router;
