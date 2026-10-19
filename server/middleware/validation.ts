import { Request, Response, NextFunction } from 'express';

export function validateBody(validator: (body: any) => { valid: boolean; errors?: string[] }) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Request body must be a valid JSON object'
      });
    }

    const { valid, errors } = validator(req.body);
    if (!valid) {
      return res.status(400).json({
        error: 'Validation Error',
        details: errors
      });
    }

    next();
  };
}

export const Validators = {
  taskCreate: (data: any) => {
    const errors: string[] = [];
    if (!data.title || typeof data.title !== 'string' || data.title.trim().length === 0) {
      errors.push('Title is required and must be non-empty string');
    }
    if (data.title && data.title.length > 300) {
      errors.push('Title must be at most 300 characters');
    }
    if (data.description && typeof data.description !== 'string') {
      errors.push('Description must be a string');
    }
    if (data.deadline && isNaN(Date.parse(data.deadline))) {
      errors.push('Deadline must be a valid ISO timestamp');
    }
    if (data.user_priority !== undefined) {
      const p = Number(data.user_priority);
      if (isNaN(p) || p < 0 || p > 10) {
        errors.push('user_priority must be a number between 0 and 10');
      }
    }
    if (data.importance && !['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(data.importance.toUpperCase())) {
      errors.push('importance must be one of LOW, MEDIUM, HIGH, CRITICAL');
    }
    return { valid: errors.length === 0, errors };
  },

  captureInput: (data: any) => {
    const errors: string[] = [];
    if (!data.content || typeof data.content !== 'string' || data.content.trim().length === 0) {
      errors.push('Content is required and must be non-empty string');
    }
    if (data.content && data.content.length > 50000) {
      errors.push('Content exceeds maximum allowed length of 50,000 characters');
    }
    if (data.url && typeof data.url !== 'string') {
      errors.push('URL must be a valid string');
    }
    if (data.source && typeof data.source !== 'string') {
      errors.push('Source must be a string');
    }
    return { valid: errors.length === 0, errors };
  },

  taskSnooze: (data: any) => {
    const errors: string[] = [];
    if (!data.until) {
      errors.push('Snooze target time (until) is required');
    } else if (isNaN(Date.parse(data.until))) {
      errors.push('until must be a valid ISO timestamp');
    }
    return { valid: errors.length === 0, errors };
  }
};
