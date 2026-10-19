import { Router } from 'express';
import { TaskService } from '../services/taskService.js';
import { db } from '../db/database.js';
import { validateBody, Validators } from '../middleware/validation.js';

const router = Router();

// GET /api/v1/tasks/next - "Do This Now" top-ranked task (O(1) Heap Peek)
router.get('/next', async (req, res) => {
  try {
    const userId = req.user!.id;
    const nextTask = await TaskService.getNextTask(userId);
    res.json({ task: nextTask });
  } catch (err: any) {
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
});

// GET /api/v1/tasks/priority - Active Queue sorted by Priority
router.get('/priority', async (req, res) => {
  try {
    const userId = req.user!.id;
    const queue = await TaskService.getQueue(userId);
    res.json({ tasks: queue.toSortedArray() });
  } catch (err: any) {
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
});

// GET /api/v1/tasks/status - Work Status Ribbon counts (Section 11)
router.get('/status', async (req, res) => {
  try {
    const userId = req.user!.id;
    const status = await TaskService.getWorkStatus(userId);
    res.json({ status });
  } catch (err: any) {
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
});

// POST /api/v1/tasks/recalculate-priority - Trigger priority recalculation
router.post('/recalculate-priority', async (req, res) => {
  try {
    const userId = req.user!.id;
    const updated = await TaskService.recalculateAllPriorities(userId);
    res.json({ success: true, updatedCount: updated.length, tasks: updated });
  } catch (err: any) {
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
});

// GET /api/v1/tasks - List tasks with optional filters
router.get('/', async (req, res) => {
  try {
    const userId = req.user!.id;
    const { status, source } = req.query;
    const tasks = await db.getTasks(userId, {
      status: status ? String(status) : undefined,
      source: source ? String(source) : undefined
    });
    res.json({ tasks });
  } catch (err: any) {
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
});

// POST /api/v1/tasks - Create manual task
router.post('/', validateBody(Validators.taskCreate), async (req, res) => {
  try {
    const userId = req.user!.id;
    const task = await TaskService.createTask(userId, {
      title: req.body.title,
      description: req.body.description,
      source: req.body.source || 'manual',
      source_id: req.body.source_id,
      source_url: req.body.source_url,
      deadline: req.body.deadline,
      importance: req.body.importance,
      urgency: req.body.urgency,
      user_priority: req.body.user_priority
    });
    res.status(201).json({ task });
  } catch (err: any) {
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
});

// GET /api/v1/tasks/:id - Get task detail
router.get('/:id', async (req, res) => {
  try {
    const userId = req.user!.id;
    const task = await db.getTaskById(req.params.id, userId);
    if (!task) {
      return res.status(404).json({ error: 'Not Found', message: 'Task not found' });
    }
    res.json({ task });
  } catch (err: any) {
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
});

// GET /api/v1/tasks/:id/source - Get task source context (Section 25)
router.get('/:id/source', async (req, res) => {
  try {
    const userId = req.user!.id;
    const task = await db.getTaskById(req.params.id, userId);
    if (!task) return res.status(404).json({ error: 'Task not found' });

    const sourceMessage = await db.getSourceMessageForTask(req.params.id, userId);
    res.json({ task, sourceMessage });
  } catch (err: any) {
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
});

// PATCH /api/v1/tasks/:id - Update task
router.patch('/:id', async (req, res) => {
  try {
    const userId = req.user!.id;
    const updated = await db.updateTask(req.params.id, userId, req.body);
    if (!updated) {
      return res.status(404).json({ error: 'Not Found', message: 'Task not found' });
    }
    await TaskService.refreshQueue(userId);
    res.json({ task: updated });
  } catch (err: any) {
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
});

// DELETE /api/v1/tasks/:id - Delete task
router.delete('/:id', async (req, res) => {
  try {
    const userId = req.user!.id;
    const ok = await db.deleteTask(req.params.id, userId);
    if (!ok) return res.status(404).json({ error: 'Task not found' });

    const queue = await TaskService.getQueue(userId);
    queue.remove(req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
});

// POST /api/v1/tasks/:id/start - Start task (checks skip disagreement)
router.post('/:id/start', async (req, res) => {
  try {
    const userId = req.user!.id;
    const started = await TaskService.startTask(userId, req.params.id);
    if (!started) return res.status(404).json({ error: 'Task not found' });
    res.json({ task: started });
  } catch (err: any) {
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
});

// POST /api/v1/tasks/:id/complete - Complete task
router.post('/:id/complete', async (req, res) => {
  try {
    const userId = req.user!.id;
    const completed = await TaskService.completeTask(userId, req.params.id);
    if (!completed) return res.status(404).json({ error: 'Task not found' });

    // Fetch next task after completion
    const nextTask = await TaskService.getNextTask(userId);
    res.json({ task: completed, nextTask });
  } catch (err: any) {
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
});

// POST /api/v1/tasks/:id/snooze - Snooze task
router.post('/:id/snooze', validateBody(Validators.taskSnooze), async (req, res) => {
  try {
    const userId = req.user!.id;
    const taskId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const snoozed = await TaskService.snoozeTask(userId, taskId, String(req.body.until));
    if (!snoozed) return res.status(404).json({ error: 'Task not found' });

    const nextTask = await TaskService.getNextTask(userId);
    res.json({ task: snoozed, nextTask });
  } catch (err: any) {
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
});

export default router;
