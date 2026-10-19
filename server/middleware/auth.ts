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

/**
 * Authentication middleware ensuring request is securely bound to a verified user.
 * In development: auto-provisions the demo user for frictionless testing.
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

  // In development mode, auto-provision default demo user for frictionless testing
  if (config.nodeEnv === 'development') {
    req.user = DEMO_USER;
    return next();
  }

  return res.status(401).json({
    error: 'Unauthorized',
    message: 'Authentication required. Please sign in via /login.html'
  });
}
