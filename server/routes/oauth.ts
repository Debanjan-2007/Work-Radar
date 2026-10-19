/**
 * Work Radar — OAuth 2.0 Routes
 *
 * Handles real OAuth login flows for:
 *   - Google  (Gmail + Google account identity)
 *   - GitHub  (GitHub account identity + repo access)
 *   - Microsoft (Outlook / Teams / Microsoft account)
 *
 * Flow:
 *   1. GET /api/v1/oauth/:provider/authorize  → redirects user to provider
 *   2. GET /api/v1/oauth/:provider/callback   → receives code, exchanges tokens,
 *                                               upserts user, sets session cookie
 */

import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import https from 'https';
import { config } from '../config.js';
import { createSessionToken, AuthenticatedUser } from '../middleware/auth.js';
import { db } from '../db/database.js';
import { encryptToken } from '../security/tokenEncryption.js';
import { AuditLogger } from '../security/auditLogger.js';
import { integrationManager } from '../integrations/integration.manager.js';
import { CaptureService } from '../services/captureService.js';

const router = Router();

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Tiny wrapper around https.request for JSON bodies. */
function httpsPost(url: string, postData: string, headers: Record<string, string>): Promise<any> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const options = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: { ...headers, 'Content-Length': Buffer.byteLength(postData) }
    };
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch { reject(new Error('Non-JSON response: ' + body)); }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

function httpsGet(url: string, headers: Record<string, string>): Promise<any> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const options = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers
    };
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch { reject(new Error('Non-JSON response: ' + body)); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

/** Issue session + CSRF cookies and redirect to dashboard. */
function issueSessionAndRedirect(res: Response, user: AuthenticatedUser): void {
  const token = createSessionToken(user);
  const csrfToken = crypto.randomBytes(24).toString('hex');

  res.cookie('work_radar_session', token, {
    httpOnly: true,
    secure: config.nodeEnv === 'production',
    sameSite: 'lax', // 'lax' is required for OAuth redirects (cross-site GET)
    maxAge: 7 * 24 * 60 * 60 * 1000
  });

  res.cookie('csrf_token', csrfToken, {
    httpOnly: false,
    secure: config.nodeEnv === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000
  });

  res.redirect('/');
}

// ─── State store (in-memory PKCE/state anti-forgery) ─────────────────────────
const oauthStateStore = new Map<string, { provider: string; expires: number }>();

function generateState(provider: string): string {
  const state = crypto.randomBytes(24).toString('hex');
  oauthStateStore.set(state, { provider, expires: Date.now() + 10 * 60 * 1000 });
  // Prune expired states
  for (const [k, v] of oauthStateStore) {
    if (v.expires < Date.now()) oauthStateStore.delete(k);
  }
  return state;
}

function validateState(state: string, provider: string): boolean {
  const entry = oauthStateStore.get(state);
  if (!entry) return false;
  oauthStateStore.delete(state);
  return entry.provider === provider && entry.expires > Date.now();
}

// ─── Google OAuth ─────────────────────────────────────────────────────────────

router.get('/google/authorize', (_req: Request, res: Response) => {
  const state = generateState('google');
  const params = new URLSearchParams({
    client_id: config.googleClientId,
    redirect_uri: `${config.appUrl}/api/v1/oauth/google/callback`,
    response_type: 'code',
    scope: [
      'openid',
      'profile',
      'email',
      'https://www.googleapis.com/auth/gmail.readonly'
    ].join(' '),
    state,
    access_type: 'offline',
    prompt: 'consent'
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

router.get('/google/callback', async (req: Request, res: Response) => {
  try {
    const { code, state, error } = req.query as Record<string, string>;

    if (error) {
      console.warn('[OAuth/Google] User denied access:', error);
      return res.redirect('/login.html?error=access_denied');
    }

    if (!validateState(state, 'google')) {
      return res.redirect('/login.html?error=invalid_state');
    }

    if (!code) {
      return res.redirect('/login.html?error=no_code');
    }

    // Exchange code for tokens
    const tokenRes = await httpsPost(
      'https://oauth2.googleapis.com/token',
      new URLSearchParams({
        code,
        client_id: config.googleClientId,
        client_secret: config.googleClientSecret,
        redirect_uri: `${config.appUrl}/api/v1/oauth/google/callback`,
        grant_type: 'authorization_code'
      }).toString(),
      { 'Content-Type': 'application/x-www-form-urlencoded' }
    );

    if (tokenRes.error) {
      console.error('[OAuth/Google] Token exchange error:', tokenRes);
      return res.redirect('/login.html?error=token_exchange_failed');
    }

    const { access_token, refresh_token, id_token } = tokenRes;

    // Get user profile from Google
    const profileRes = await httpsGet(
      'https://www.googleapis.com/oauth2/v3/userinfo',
      { Authorization: `Bearer ${access_token}` }
    );

    if (!profileRes.email) {
      return res.redirect('/login.html?error=profile_fetch_failed');
    }

    // Upsert user in database
    const user = await db.upsertOAuthUser({
      provider: 'google',
      providerId: profileRes.sub,
      email: profileRes.email,
      name: profileRes.name || profileRes.email,
      avatarUrl: profileRes.picture
    });

    // Store Gmail tokens in integrations table
    if (access_token) {
      await db.saveIntegration({
        user_id: user.id,
        provider: 'gmail',
        access_token: encryptToken(access_token),
        refresh_token: refresh_token ? encryptToken(refresh_token) : undefined,
        scopes: ['https://www.googleapis.com/auth/gmail.readonly', 'openid', 'profile', 'email'],
        status: 'CONNECTED',
        last_sync_at: new Date().toISOString()
      });
    }

    AuditLogger.log({
      eventType: 'AUTH_LOGIN',
      userId: user.id,
      ipAddress: req.ip,
      details: { provider: 'google', email: user.email }
    });

    issueSessionAndRedirect(res, user);

    // Initial background sync: pull actionable emails from user's Gmail
    setTimeout(async () => {
      try {
        const messages = await integrationManager.fetchAllMessages(user.id);
        for (const msg of messages) {
          await CaptureService.processCapture(user.id, {
            content: msg.content,
            source: msg.provider,
            url: msg.sourceUrl,
            sender: msg.senderName ? `${msg.senderName} <${msg.sender}>` : msg.sender,
            subject: msg.subject
          });
        }
      } catch (syncErr) {
        console.warn('[OAuth/Google] Initial Gmail sync warning:', syncErr);
      }
    }, 300);
  } catch (err: any) {
    console.error('[OAuth/Google] Callback error:', err);
    res.redirect('/login.html?error=server_error');
  }
});

// ─── GitHub OAuth ─────────────────────────────────────────────────────────────

router.get('/github/authorize', (_req: Request, res: Response) => {
  const state = generateState('github');
  const params = new URLSearchParams({
    client_id: config.githubClientId,
    redirect_uri: `${config.appUrl}/api/v1/oauth/github/callback`,
    scope: 'read:user user:email repo',
    state
  });
  res.redirect(`https://github.com/login/oauth/authorize?${params}`);
});

router.get('/github/callback', async (req: Request, res: Response) => {
  try {
    const { code, state, error } = req.query as Record<string, string>;

    if (error) {
      return res.redirect('/login.html?error=access_denied');
    }

    if (!validateState(state, 'github')) {
      return res.redirect('/login.html?error=invalid_state');
    }

    if (!code) {
      return res.redirect('/login.html?error=no_code');
    }

    // Exchange code for token
    const tokenRes = await httpsPost(
      'https://github.com/login/oauth/access_token',
      new URLSearchParams({
        client_id: config.githubClientId,
        client_secret: config.githubClientSecret,
        code,
        redirect_uri: `${config.appUrl}/api/v1/oauth/github/callback`
      }).toString(),
      {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      }
    );

    if (tokenRes.error || !tokenRes.access_token) {
      console.error('[OAuth/GitHub] Token exchange error:', tokenRes);
      return res.redirect('/login.html?error=token_exchange_failed');
    }

    const { access_token } = tokenRes;

    // Get user profile
    const profileRes = await httpsGet(
      'https://api.github.com/user',
      {
        Authorization: `Bearer ${access_token}`,
        'User-Agent': 'WorkRadar/1.0'
      }
    );

    // GitHub may not return email publicly; fetch email list
    let email = profileRes.email;
    if (!email) {
      const emailsRes: any[] = await httpsGet(
        'https://api.github.com/user/emails',
        { Authorization: `Bearer ${access_token}`, 'User-Agent': 'WorkRadar/1.0' }
      );
      const primary = emailsRes.find((e: any) => e.primary && e.verified);
      email = primary?.email || emailsRes[0]?.email;
    }

    if (!email) {
      return res.redirect('/login.html?error=no_email');
    }

    // Upsert user
    const user = await db.upsertOAuthUser({
      provider: 'github',
      providerId: String(profileRes.id),
      email,
      name: profileRes.name || profileRes.login || email,
      avatarUrl: profileRes.avatar_url
    });

    // Store GitHub token in integrations
    await db.saveIntegration({
      user_id: user.id,
      provider: 'github',
      access_token: encryptToken(access_token),
      scopes: ['read:user', 'user:email', 'repo'],
      status: 'CONNECTED',
      last_sync_at: new Date().toISOString()
    });

    AuditLogger.log({
      eventType: 'AUTH_LOGIN',
      userId: user.id,
      ipAddress: req.ip,
      details: { provider: 'github', email: user.email }
    });

    issueSessionAndRedirect(res, user);
  } catch (err: any) {
    console.error('[OAuth/GitHub] Callback error:', err);
    res.redirect('/login.html?error=server_error');
  }
});

// ─── Microsoft OAuth ──────────────────────────────────────────────────────────

router.get('/microsoft/authorize', (_req: Request, res: Response) => {
  const state = generateState('microsoft');
  const params = new URLSearchParams({
    client_id: config.microsoftClientId,
    redirect_uri: `${config.appUrl}/api/v1/oauth/microsoft/callback`,
    response_type: 'code',
    scope: [
      'openid',
      'profile',
      'email',
      'offline_access',
      'https://graph.microsoft.com/Mail.Read',
      'https://graph.microsoft.com/User.Read'
    ].join(' '),
    state,
    response_mode: 'query'
  });
  const tenantId = config.microsoftTenantId || 'common';
  res.redirect(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?${params}`);
});

router.get('/microsoft/callback', async (req: Request, res: Response) => {
  try {
    const { code, state, error } = req.query as Record<string, string>;

    if (error) {
      return res.redirect('/login.html?error=access_denied');
    }

    if (!validateState(state, 'microsoft')) {
      return res.redirect('/login.html?error=invalid_state');
    }

    if (!code) {
      return res.redirect('/login.html?error=no_code');
    }

    const tenantId = config.microsoftTenantId || 'common';

    // Exchange code for tokens
    const tokenRes = await httpsPost(
      `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
      new URLSearchParams({
        client_id: config.microsoftClientId,
        client_secret: config.microsoftClientSecret,
        code,
        redirect_uri: `${config.appUrl}/api/v1/oauth/microsoft/callback`,
        grant_type: 'authorization_code',
        scope: 'openid profile email offline_access https://graph.microsoft.com/Mail.Read https://graph.microsoft.com/User.Read'
      }).toString(),
      { 'Content-Type': 'application/x-www-form-urlencoded' }
    );

    if (tokenRes.error) {
      console.error('[OAuth/Microsoft] Token exchange error:', tokenRes);
      return res.redirect('/login.html?error=token_exchange_failed');
    }

    const { access_token, refresh_token } = tokenRes;

    // Get user profile via Microsoft Graph
    const profileRes = await httpsGet(
      'https://graph.microsoft.com/v1.0/me',
      { Authorization: `Bearer ${access_token}` }
    );

    const email = profileRes.mail || profileRes.userPrincipalName;
    if (!email) {
      return res.redirect('/login.html?error=profile_fetch_failed');
    }

    const user = await db.upsertOAuthUser({
      provider: 'microsoft',
      providerId: profileRes.id,
      email,
      name: profileRes.displayName || email,
      avatarUrl: undefined
    });

    // Store Microsoft/Outlook token in integrations
    await db.saveIntegration({
      user_id: user.id,
      provider: 'outlook',
      access_token: encryptToken(access_token),
      refresh_token: refresh_token ? encryptToken(refresh_token) : undefined,
      scopes: ['https://graph.microsoft.com/Mail.Read', 'https://graph.microsoft.com/User.Read'],
      status: 'CONNECTED',
      last_sync_at: new Date().toISOString()
    });

    AuditLogger.log({
      eventType: 'AUTH_LOGIN',
      userId: user.id,
      ipAddress: req.ip,
      details: { provider: 'microsoft', email: user.email }
    });

    issueSessionAndRedirect(res, user);
  } catch (err: any) {
    console.error('[OAuth/Microsoft] Callback error:', err);
    res.redirect('/login.html?error=server_error');
  }
});

// ─── Logout ───────────────────────────────────────────────────────────────────

router.post('/logout', (req: Request, res: Response) => {
  const userId = (req as any).user?.id;
  res.clearCookie('work_radar_session');
  res.clearCookie('csrf_token');
  if (userId) {
    AuditLogger.log({ eventType: 'AUTH_LOGOUT', userId, ipAddress: req.ip, details: {} });
  }
  res.json({ success: true });
});

export default router;
