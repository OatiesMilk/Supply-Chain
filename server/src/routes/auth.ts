import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../db';
import { clearSessionCookie, requireAuth, setSessionCookie, signToken, Role } from '../middleware/auth';

import { asyncRoute } from '../middleware/asyncRoute';
import { sessionUser } from '../services/permissions';
import { permissionMode } from '../services/permissionManagement';
import { loadPermissionSession } from '../services/sessionPermissions';
import { policyRoute } from '../middleware/policyRoute';
import { createSsoState, validateSsoState, registerSsoState, consumeSsoState, getMsalConfig, SSO_STATE_COOKIE, SSO_STATE_MAX_AGE_MS } from '../services/ssoState';
import { approvedMicrosoftUser } from '../services/ssoIdentity';
import { ssoFailureDetails, type SsoStage } from '../services/ssoDiagnostics';

const router = Router();

// ─── Email + password login ──────────────────────────────────────────────────

router.post('/login', policyRoute(async (req, res) => {
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

  const loaded = permissionMode() === 'V1' ? await loadPermissionSession(prisma, user.id) : null;
  if (permissionMode() === 'V1' && !loaded?.isActive) return res.status(401).json({ error: 'Account is deactivated' });
  if (loaded && !loaded.session.snapshot.valid) return res.status(503).json({ error: 'Permission foundation is unavailable or this account requires verified conversion' });
  const identity = loaded?.session ?? user;
  const token = signToken({ id: identity.id, name: identity.name, email: identity.email, role: identity.role as Role });
  setSessionCookie(res, token);
  res.setHeader('Cache-Control', 'no-store');
  res.json(loaded?.session ?? sessionUser(user));
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
      // Offer account switching while preserving Microsoft 365/Teams sessions.
      prompt: 'select_account',
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
    console.error('Microsoft SSO initiation failed', ssoFailureDetails('initiate', err));
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

  let stage: SsoStage = 'token_exchange';
  try {
    const result = await msalApp.acquireTokenByCode({
      code,
      scopes: ['openid', 'profile', 'email', 'User.Read'],
      redirectUri,
    });

    const claims = result.idTokenClaims as Record<string, unknown> | undefined;
    stage = 'account_lookup';
    const approval = await approvedMicrosoftUser(prisma, claims, cfg.tenantId);
    if ('error' in approval) return res.redirect(`/?error=${approval.error}`);
    const user = approval.user;

    stage = 'session';
    if (permissionMode() === 'V1') {
      const loaded = await loadPermissionSession(prisma, user.id);
      if (!loaded?.isActive) return res.redirect('/?error=account_deactivated');
      if (!loaded.session.snapshot.valid) return res.redirect('/?error=permissions_unavailable');
    }
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
    console.error('Microsoft SSO callback failed', ssoFailureDetails(stage, err));
    res.redirect('/?error=sso_failed');
  }
}));

// ─── SSO status (lets frontend know if Microsoft login is available) ────────

router.get('/microsoft/status', (_req: Request, res: Response) => {
  const configured = !!getMsalConfig();
  res.json({ configured });
});

export default router;
