import { Router } from 'express';
import { createSessionToken, verifySessionToken, DEMO_USER, sessionCookieOptions, clearSessionCookies } from '../middleware/auth.js';
import { AuditLogger } from '../security/auditLogger.js';
import { config } from '../config.js';
import crypto from 'crypto';

const router = Router();

router.post('/login', (req, res) => {
  return res.status(403).json({
    error: 'Forbidden',
    message: 'Passwordless demo login is disabled. Sign in with Google, GitHub, or Microsoft.'
  });
});

// Logout endpoint - exempt from CSRF check (session is being destroyed)
router.post('/logout', (req, res) => {
  const userId = req.user?.id;
  clearSessionCookies(res);

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

router.post('/demo', (req, res) => {
  return res.status(403).json({
    error: 'Forbidden',
    message: 'Demo login is disabled. Sign in with Google, GitHub, or Microsoft.'
  });
});

export default router;
