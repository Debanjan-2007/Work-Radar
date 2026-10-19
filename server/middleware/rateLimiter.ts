import { Request, Response, NextFunction } from 'express';
import { AuditLogger } from '../security/auditLogger.js';

interface RateLimitRecord {
  count: number;
  resetTime: number;
}

export function createRateLimiter(options: { windowMs: number; maxRequests: number; message?: string }) {
  const store = new Map<string, RateLimitRecord>();

  // Periodically clean up stale rate limit entries
  setInterval(() => {
    const now = Date.now();
    for (const [key, record] of store.entries()) {
      if (now > record.resetTime) {
        store.delete(key);
      }
    }
  }, 60000);

  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const userId = (req as any).user?.id;
    const clientKey = userId ? `user:${userId}` : `ip:${ip}`;
    const now = Date.now();

    const record = store.get(clientKey);

    if (!record || now > record.resetTime) {
      store.set(clientKey, {
        count: 1,
        resetTime: now + options.windowMs,
      });
      res.setHeader('X-RateLimit-Limit', options.maxRequests);
      res.setHeader('X-RateLimit-Remaining', options.maxRequests - 1);
      return next();
    }

    record.count++;
    const remaining = Math.max(0, options.maxRequests - record.count);
    res.setHeader('X-RateLimit-Limit', options.maxRequests);
    res.setHeader('X-RateLimit-Remaining', remaining);

    if (record.count > options.maxRequests) {
      AuditLogger.log({
        eventType: 'SECURITY_VIOLATION',
        userId: userId,
        ipAddress: ip,
        details: { reason: 'Rate limit exceeded', key: clientKey, path: req.originalUrl }
      });

      return res.status(429).json({
        error: 'Too Many Requests',
        message: options.message || 'Rate limit exceeded. Please wait before making more requests.',
        retryAfterMs: record.resetTime - now,
      });
    }

    next();
  };
}
