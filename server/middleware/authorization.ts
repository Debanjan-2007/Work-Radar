import { Request, Response, NextFunction } from 'express';

/**
 * Ensures the authenticated user's ID is anchored to the request context.
 * Forbids client-supplied user impersonation.
 */
export function enforceUserScoping(req: Request, res: Response, next: NextFunction) {
  if (!req.user || !req.user.id) {
    return res.status(401).json({ error: 'Unauthorized', message: 'User context missing' });
  }

  // Prevent clients from overriding user_id in request body
  if (req.body && typeof req.body === 'object') {
    if (req.body.user_id && req.body.user_id !== req.user.id) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Client-supplied user identifier rejected by authorization policy'
      });
    }
    req.body.user_id = req.user.id;
  }

  next();
}
