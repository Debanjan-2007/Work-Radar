import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { config } from '../config.js';

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

// Default development demo user
export const DEMO_USER: AuthenticatedUser = {
  id: 'a0000000-0000-0000-0000-000000000001',
  email: 'alex.developer@workradar.io',
  name: 'Alex Mercer',
  avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80'
};

/**
 * Creates a signed session token for a user.
 */
export function createSessionToken(user: AuthenticatedUser): string {
  const payload = Buffer.from(JSON.stringify(user)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', config.sessionSecret)
    .update(payload)
    .digest('base64url');
  return `${payload}.${signature}`;
}

/**
 * Verifies a signed session token.
 */
export function verifySessionToken(token: string): AuthenticatedUser | null {
  try {
    const [payload, signature] = token.split('.');
    if (!payload || !signature) return null;

    const expectedSig = crypto
      .createHmac('sha256', config.sessionSecret)
      .update(payload)
      .digest('base64url');

    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) {
      return null;
    }

    const json = Buffer.from(payload, 'base64url').toString('utf8');
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function isSecureRequest(req?: Request): boolean {
  if (config.nodeEnv === 'production') return true;
  if (!req) return false;
  const forwarded = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  return forwarded === 'https' || !!req.secure;
}

/** Public origin used for OAuth redirect_uri — derived from the incoming request so Render/Railway work without a perfect APP_URL. */
export function getPublicAppUrl(req: Request): string {
  const forwardedHost = String(req.headers['x-forwarded-host'] || '').split(',')[0].trim();
  const host = forwardedHost || req.get('host') || '';
  const isLocal = !host || host.includes('localhost') || host.startsWith('127.0.0.1');
  if (!isLocal) {
    const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
    const proto = forwardedProto || (req.secure ? 'https' : 'https');
    return `${proto}://${host}`;
  }
  return config.appUrl;
}

export function sessionCookieOptions(req?: Request, httpOnly = true) {
  return {
    httpOnly,
    secure: isSecureRequest(req),
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000
  };
}

export function clearSessionCookies(res: Response): void {
  const variants: Array<{ path: string; sameSite: 'lax' | 'strict'; secure: boolean }> = [
    { path: '/', sameSite: 'lax', secure: true },
    { path: '/', sameSite: 'lax', secure: false },
    { path: '/', sameSite: 'strict', secure: true },
    { path: '/', sameSite: 'strict', secure: false }
  ];
  for (const opts of variants) {
    res.clearCookie('work_radar_session', { ...opts, httpOnly: true });
    res.clearCookie('csrf_token', { ...opts, httpOnly: false });
  }
}

/**
 * Authentication middleware ensuring request is securely bound to a verified user.
 * In production: returns 401 Unauthorized — the frontend auth.js guard redirects to /login.html.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  // Check session cookie or Authorization header
  const authHeader = req.headers['authorization'];
  const cookieToken = req.cookies?.['work_radar_session'];
  const token = (authHeader && authHeader.startsWith('Bearer '))
    ? authHeader.substring(7)
    : cookieToken;

  if (token) {
    const verifiedUser = verifySessionToken(token);
    if (verifiedUser) {
      req.user = verifiedUser;
      return next();
    }
  }

  return res.status(401).json({
    error: 'Unauthorized',
    message: 'Authentication required. Please sign in via /login.html'
  });
}
