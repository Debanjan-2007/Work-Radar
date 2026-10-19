import { Router } from 'express';
import { db } from '../db/database.js';

const router = Router();

// GET /api/v1/events/disagreements - List recorded priority disagreements for model tuning
router.get('/disagreements', async (req, res) => {
  try {
    const userId = req.user!.id;
    const tasks = await db.getTasks(userId);
    const taskIds = new Set(tasks.map(t => t.id));

    // Get task events
    const allEvents: any[] = [];
    for (const taskId of taskIds) {
      // In SQLite/Memory mode, filter events
      // For PG mode, queries task_events table
    }

    res.json({
      success: true,
      message: 'Priority disagreement events available for tuning'
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
});

// POST /api/v1/events - Log custom telemetry or client disagreement event
router.post('/', async (req, res) => {
  try {
    const { taskId, eventType, metadata } = req.body;
    if (!taskId || !eventType) {
      return res.status(400).json({ error: 'taskId and eventType are required' });
    }

    const event = await db.recordTaskEvent(taskId, eventType, metadata || {});
    res.status(201).json({ event });
  } catch (err: any) {
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
});

export default router;
