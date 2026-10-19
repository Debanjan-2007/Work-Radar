import { Router } from 'express';
import { createSessionToken, verifySessionToken, DEMO_USER } from '../middleware/auth.js';
import { AuditLogger } from '../security/auditLogger.js';
import { config } from '../config.js';
import crypto from 'crypto';

const router = Router();

router.post('/login', (req, res) => {
  // In development/demo mode, authenticates demo user
  const user = req.body.email ? { ...DEMO_USER, email: req.body.email } : DEMO_USER;
  const token = createSessionToken(user);
  const csrfToken = crypto.randomBytes(24).toString('hex');

  res.cookie('work_radar_session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  });

  res.cookie('csrf_token', csrfToken, {
    httpOnly: false, // accessible to client for X-CSRF-Token header
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict'
  });

  AuditLogger.log({
    eventType: 'AUTH_LOGIN',
    userId: user.id,
    ipAddress: req.ip,
    details: { email: user.email }
  });

  res.json({
    user,
    token,
    csrfToken
  });
});

router.post('/logout', (req, res) => {
  const userId = req.user?.id;
  res.clearCookie('work_radar_session');
  res.clearCookie('csrf_token');

  if (userId) {
    AuditLogger.log({
      eventType: 'AUTH_LOGOUT',
      userId,
      ipAddress: req.ip,
      details: {}
    });
  }

  res.json({ success: true, message: 'Logged out successfully' });
});

router.get('/me', (req, res) => {
  // Manually check session since this route is under the public router (no requireAuth middleware)
  const token = req.cookies?.['work_radar_session'];
  if (token) {
    const user = verifySessionToken(token);
    if (user) return res.json({ user });
  }

  // Without a valid session cookie, always return 401 Unauthorized so login is shown
  return res.status(401).json({ error: 'Unauthorized', message: 'No active session' });
});

// Explicit demo login for users who want to try the demo data
router.post('/demo', (req, res) => {
  const sessionToken = createSessionToken(DEMO_USER);
  const isProd = config.nodeEnv === 'production';

  res.cookie('work_radar_session', sessionToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000
  });

  const csrfToken = crypto.randomBytes(32).toString('hex');
  res.cookie('csrf_token', csrfToken, {
    httpOnly: false,
    secure: isProd,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000
  });

  AuditLogger.log({
    eventType: 'AUTH_LOGIN',
    userId: DEMO_USER.id,
    ipAddress: req.ip,
    details: { provider: 'demo' }
  });

  res.json({ success: true, user: DEMO_USER });
});

export default router;
