import { Router } from 'express';
import { CaptureService } from '../services/captureService.js';
import { validateBody, Validators } from '../middleware/validation.js';
import { createRateLimiter } from '../middleware/rateLimiter.js';
import { config } from '../config.js';

const router = Router();

// Stricter rate limiting for capture endpoint (PRD Section 36.5)
const captureLimiter = createRateLimiter({
  windowMs: config.rateLimitWindowMs,
  maxRequests: config.captureRateLimitMax,
  message: 'Capture rate limit exceeded. Please wait before submitting more content.'
});

router.post('/', captureLimiter, validateBody(Validators.captureInput), async (req, res) => {
  try {
    const userId = req.user!.id;
    const { content, source, url, sender, subject, forceCreate } = req.body;

    const result = await CaptureService.processCapture(userId, {
      content,
      source: source || 'chrome',
      url,
      sender,
      subject,
      forceCreate: Boolean(forceCreate)
    });

    if (!result.actionable) {
      return res.status(200).json({
        success: false,
        actionable: false,
        message: result.message,
        extracted: result.extracted
      });
    }

    if (result.isDuplicate) {
      return res.status(200).json({
        success: true,
        isDuplicate: true,
        duplicateDetails: result.duplicateDetails,
        extracted: result.extracted,
        message: result.message
      });
    }

    res.status(201).json({
      success: true,
      actionable: true,
      isDuplicate: false,
      task: result.task,
      sourceMessageId: result.sourceMessageId,
      message: result.message
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
});

export default router;
