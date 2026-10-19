import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import { config } from './config.js';
import { db } from './db/database.js';
import { securityHeaders } from './middleware/securityHeaders.js';
import { requireAuth } from './middleware/auth.js';
import { enforceUserScoping } from './middleware/authorization.js';
import { csrfProtection } from './middleware/csrf.js';
import { createRateLimiter } from './middleware/rateLimiter.js';
import { SecretsManager } from './security/secrets.js';
import { ReminderScheduler } from './reminders/reminderScheduler.js';
import { DEMO_USER } from './middleware/auth.js';

// Route handlers
import authRoutes from './routes/auth.js';
import oauthRoutes from './routes/oauth.js';
import taskRoutes from './routes/tasks.js';
import captureRoutes from './routes/capture.js';
import integrationRoutes from './routes/integrations.js';
import reminderRoutes from './routes/reminders.js';
import voiceRoutes from './routes/voice.js';
import eventRoutes from './routes/events.js';

const app = express();

// Enable trust proxy for production environments behind reverse proxies (Render, Railway, Nginx, AWS)
app.set('trust proxy', 1);

// 1. Validate secrets on startup
const secretStatus = SecretsManager.validateStartupSecrets();
if (!secretStatus.valid) {
  console.warn('[Security Warnings]:', secretStatus.warnings.join(', '));
}

// 2. Global Security Headers (PRD Section 36)
app.use(securityHeaders);

// 3. CORS Configuration (Section 36.5: restricted to known origins, no wildcards)
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (e.g., mobile apps, curl, extension service worker)
    if (!origin) return callback(null, true);
    const appUrlObj = config.appUrl ? new URL(config.appUrl) : null;
    if (
      origin.startsWith('chrome-extension://') ||
      origin.includes('localhost') ||
      origin === config.appUrl ||
      (appUrlObj && origin === appUrlObj.origin)
    ) {
      return callback(null, true);
    }
    return callback(new Error('CORS blocked origin'), false);
  },
  credentials: true
}));

// 4. Body parsers with payload bounds
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser());

// 5. Global API Rate Limiter
const generalLimiter = createRateLimiter({
  windowMs: config.rateLimitWindowMs,
  maxRequests: config.rateLimitMaxRequests
});
app.use('/api/', generalLimiter);

// 6. Public Static Frontend Assets
app.use(express.static(path.resolve(process.cwd(), 'public')));

// 7. Unauthenticated Public Routes
app.use('/api/v1/auth', authRoutes);
// OAuth 2.0 callback routes — must be public (no session yet at callback time)
app.use('/api/v1/oauth', oauthRoutes);

// 8. Enforce Authoritative Security Pipeline on all /api/v1 endpoints:
// Authentication -> Authorization -> CSRF Check -> Business Logic
app.use('/api/v1', requireAuth, enforceUserScoping, csrfProtection);

// 9. API Routes Mount
app.use('/api/v1/tasks', taskRoutes);
app.use('/api/v1/capture', captureRoutes);
app.use('/api/v1/integrations', integrationRoutes);
app.use('/api/v1/reminders', reminderRoutes);
app.use('/api/v1/voice', voiceRoutes);
app.use('/api/v1/events', eventRoutes);

// 10. Fallback SPA route
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.resolve(process.cwd(), 'public', 'index.html'));
});

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('[Unhandled Server Error]:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: config.nodeEnv === 'development' ? err.message : 'An unexpected error occurred'
  });
});

// Server Initialization
async function startServer() {
  await db.initialize();

  // Start background reminder scheduler for demo user
  ReminderScheduler.start(DEMO_USER.id);

  app.listen(config.port, () => {
    console.log(`====================================================`);
    console.log(`📡 WORK RADAR SERVER RUNNING ON PORT ${config.port}`);
    console.log(`🎯 URL: http://localhost:${config.port}`);
    console.log(`🔒 Security: Strict Headers, AES-256-GCM Tokens, CSRF`);
    console.log(`====================================================`);
  });
}

startServer().catch(err => {
  console.error('Failed to start Work Radar server:', err);
  process.exit(1);
});

export default app;
