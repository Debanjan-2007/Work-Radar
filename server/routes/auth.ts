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

  // In development: return demo user so the dashboard loads without OAuth setup
  if (config.nodeEnv === 'development') {
    return res.json({ user: DEMO_USER });
  }

  return res.status(401).json({ error: 'Unauthorized', message: 'No active session' });
});

export default router;
