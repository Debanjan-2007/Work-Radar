import { Router } from 'express';
import { ReminderService } from '../reminders/reminderService.js';

const router = Router();

// GET /api/v1/reminders - List unacknowledged alerts
router.get('/', async (req, res) => {
  try {
    const userId = req.user!.id;
    const alerts = await ReminderService.getPendingAlerts(userId);
    res.json({ alerts });
  } catch (err: any) {
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
});

// GET /api/v1/reminders/all - List alert history
router.get('/all', async (req, res) => {
  try {
    const userId = req.user!.id;
    const alerts = await ReminderService.getAllAlerts(userId);
    res.json({ alerts });
  } catch (err: any) {
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
});

// POST /api/v1/reminders/:id/acknowledge - Acknowledge alert
router.post('/:id/acknowledge', async (req, res) => {
  try {
    const userId = req.user!.id;
    const ok = await ReminderService.acknowledgeAlert(req.params.id, userId);
    if (!ok) return res.status(404).json({ error: 'Alert not found' });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
});

// POST /api/v1/reminders/evaluate - Manually trigger evaluation
router.post('/evaluate', async (req, res) => {
  try {
    const userId = req.user!.id;
    const newAlerts = await ReminderService.triggerManualEvaluation(userId);
    res.json({ success: true, alertsDispatched: newAlerts });
  } catch (err: any) {
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
});

export default router;
