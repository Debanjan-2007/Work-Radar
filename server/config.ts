import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  appUrl: process.env.APP_URL || 'http://localhost:3000',
  sessionSecret: process.env.SESSION_SECRET || 'work-radar-dev-secret-key-32-chars-long-minimum!',
  tokenEncryptionKey: process.env.TOKEN_ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  databaseUrl: process.env.DATABASE_URL || '',
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  geminiApiKey: process.env.GEMINI_API_KEY || '',

  // ── OAuth 2.0 Provider Credentials ──────────────────────────────────────────
  // Google (Gmail + identity): https://console.cloud.google.com/
  googleClientId: process.env.GOOGLE_CLIENT_ID || '',
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || '',

  // GitHub: https://github.com/settings/developers
  githubClientId: process.env.GITHUB_CLIENT_ID || '',
  githubClientSecret: process.env.GITHUB_CLIENT_SECRET || '',

  // Microsoft (Outlook / Teams): https://portal.azure.com/
  microsoftClientId: process.env.MICROSOFT_CLIENT_ID || '',
  microsoftClientSecret: process.env.MICROSOFT_CLIENT_SECRET || '',
  microsoftTenantId: process.env.MICROSOFT_TENANT_ID || 'common', // 'common' allows any Microsoft account

  quietHours: {
    start: parseInt(process.env.QUIET_HOURS_START || '22', 10),
    end: parseInt(process.env.QUIET_HOURS_END || '8', 10),
  },
  rateLimitWindowMs: 15 * 60 * 1000, // 15 minutes
  rateLimitMaxRequests: 300,
  captureRateLimitMax: 60, // max 60 capture requests per 15 min per user/IP
};
