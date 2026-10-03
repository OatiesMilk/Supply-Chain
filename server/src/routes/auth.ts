import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { prisma } from '../db';
import { clearSessionCookie, requireAuth, setSessionCookie, signToken, Role } from '../middleware/auth';

const router = Router();

// ─── Email + password login ──────────────────────────────────────────────────

router.post('/login', async (req, res) => {
  const { email, password } = req.body ?? {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const user = await prisma.user.findUnique({ where: { email: String(email).toLowerCase() } });
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
  res.json({ id: user.id, name: user.name, email: user.email, role: user.role });
});

router.post('/logout', (_req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

router.get('/me', requireAuth, async (req: Request, res: Response) => {
  const perms = await prisma.userPermission.findMany({ where: { userId: req.user!.id } });
  res.json({
    ...req.user,
    permissions: perms.map(p => ({ screen: p.screen, granted: p.granted }))
  });
});

// ─── Microsoft Azure AD SSO ─────────────────────────────────────────────────

function getMsalConfig() {
  const clientId     = process.env.AZURE_CLIENT_ID;
  const clientSecret = process.env.AZURE_CLIENT_SECRET;
  const tenantId     = process.env.AZURE_TENANT_ID || 'common';
  const appUrl       = process.env.APP_URL || 'http://localhost:3000';

  if (!clientId || !clientSecret) return null;

  return { clientId, clientSecret, tenantId, appUrl };
}

router.post('/microsoft', async (_req: Request, res: Response) => {
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
    const authUrl = await msalApp.getAuthCodeUrl({
      scopes: ['openid', 'profile', 'email', 'User.Read'],
      redirectUri,
      responseMode: 'query' as any,
    });
    res.json({ url: authUrl });
  } catch (err) {
    console.error('MSAL getAuthCodeUrl error:', err);
    res.status(500).json({ error: 'Failed to initiate Microsoft login' });
  }
});

router.get('/microsoft/callback', async (req: Request, res: Response) => {
  const cfg = getMsalConfig();
  if (!cfg) {
    return res.redirect('/?error=sso_not_configured');
  }

  const code = req.query.code as string | undefined;
  const errorParam = req.query.error as string | undefined;

  if (errorParam || !code) {
    const desc = req.query.error_description || 'Microsoft login failed';
    console.error('Azure AD callback error:', errorParam, desc);
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
    const oid   = (claims?.oid as string) || '';
    const email = ((claims?.preferred_username as string) || (claims?.email as string) || '').toLowerCase();
    const name  = (claims?.name as string) || email.split('@')[0] || 'Microsoft User';

    if (!email) {
      return res.redirect('/?error=sso_no_email');
    }

    // Look up user: prefer microsoftOid match, then email match
    let user = oid
      ? await prisma.user.findUnique({ where: { microsoftOid: oid } })
      : null;

    if (!user) {
      user = await prisma.user.findUnique({ where: { email } });
    }

    if (user && !user.isActive) {
      return res.redirect('/?error=account_deactivated');
    }

    if (!user) {
      const randomPass = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);
      user = await prisma.user.create({
        data: {
          name,
          email,
          password: randomPass,
          role: 'SALES_COORDINATOR',
          isActive: true,
          microsoftOid: oid || null,
        },
      });
    } else if (oid && !user.microsoftOid) {
      await prisma.user.update({
        where: { id: user.id },
        data: { microsoftOid: oid },
      });
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
    console.error('MSAL token exchange error:', err);
    res.redirect('/?error=sso_failed');
  }
});

// ─── SSO status (lets frontend know if Microsoft login is available) ────────

router.get('/microsoft/status', (_req: Request, res: Response) => {
  const configured = !!(process.env.AZURE_CLIENT_ID && process.env.AZURE_CLIENT_SECRET);
  res.json({ configured });
});

export default router;
