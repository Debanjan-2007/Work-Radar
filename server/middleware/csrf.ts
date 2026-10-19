import { Request, Response, NextFunction } from 'express';

export function csrfProtection(req: Request, res: Response, next: NextFunction) {
  // Safe read-only HTTP methods
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  // Requests from Chrome extension with custom extension header or Authorization header
  const isExtensionRequest = req.headers['x-work-radar-client'] === 'chrome-extension';
  const hasAuthHeader = !!req.headers['authorization'];

  if (isExtensionRequest || hasAuthHeader) {
    return next();
  }

  // Check Origin / Referer against host for browser requests
  const origin = req.headers['origin'];
  const host = req.headers['host'];

  if (origin && host) {
    const originHost = new URL(origin).host;
    if (originHost !== host) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Cross-site request blocked by CSRF protection.'
      });
    }
  }

  // Validate CSRF token header if present in cookies
  const cookieCsrf = req.cookies?.['csrf_token'];
  const headerCsrf = req.headers['x-csrf-token'];

  if (cookieCsrf && headerCsrf && cookieCsrf !== headerCsrf) {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Invalid CSRF token.'
    });
  }

  next();
}
