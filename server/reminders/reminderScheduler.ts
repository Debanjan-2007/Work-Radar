import { ReminderEngine, EvaluatedAlert } from './reminderEngine.js';
import { db } from '../db/database.js';

interface UserHourlyRate {
  count: number;
  windowStart: number;
  batchedMessages: string[];
}

export class ReminderScheduler {
  private static userHourlyLimits = new Map<string, UserHourlyRate>();
  private static sentAlertKeys = new Set<string>();
  private static tickerHandle: NodeJS.Timeout | null = null;

  /**
   * Starts background evaluation interval (runs every 60 seconds).
   */
  public static start(userId: string): void {
    if (this.tickerHandle) return;

    this.tickerHandle = setInterval(() => {
      this.tick(userId).catch(err => console.error('[ReminderScheduler] Tick error:', err));
    }, 60000);

    // Initial tick
    this.tick(userId).catch(err => console.error('[ReminderScheduler] Initial tick error:', err));
  }

  public static stop(): void {
    if (this.tickerHandle) {
      clearInterval(this.tickerHandle);
      this.tickerHandle = null;
    }
  }

  /**
   * Periodic evaluation tick.
   */
  public static async tick(userId: string): Promise<EvaluatedAlert[]> {
    // Check quiet hours
    if (ReminderEngine.isQuietHours()) {
      return [];
    }

    const tasks = await db.getTasks(userId, { status: 'PENDING' });
    const inProgressTasks = await db.getTasks(userId, { status: 'IN_PROGRESS' });
    const allActive = [...tasks, ...inProgressTasks];

    const alertsToDispatch: EvaluatedAlert[] = [];

    for (const task of allActive) {
      const taskAlerts = ReminderEngine.evaluateTask(task, this.sentAlertKeys);
      alertsToDispatch.push(...taskAlerts);
    }

    if (alertsToDispatch.length === 0) return [];

    // Rate Limiting & Throttling: max 3/hour per user
    const now = Date.now();
    let rateRecord = this.userHourlyLimits.get(userId);
    if (!rateRecord || (now - rateRecord.windowStart) > 3600000) {
      rateRecord = { count: 0, windowStart: now, batchedMessages: [] };
      this.userHourlyLimits.set(userId, rateRecord);
    }

    const processedAlerts: EvaluatedAlert[] = [];

    for (const alert of alertsToDispatch) {
      const alertKey = `${alert.taskId}:${alert.triggerType}`;
      this.sentAlertKeys.add(alertKey);

      if (rateRecord.count < 3) {
        rateRecord.count++;
        await db.createReminder({
          user_id: userId,
          task_id: alert.taskId,
          trigger_type: alert.triggerType,
          message: alert.message
        });
        processedAlerts.push(alert);
      } else {
        // Exceeded 3 per hour: batch for digest
        rateRecord.batchedMessages.push(alert.message);
      }
    }

    // If we have batched alerts that reached 3+ items, dispatch a single summary digest
    if (rateRecord.batchedMessages.length >= 3) {
      const summaryMsg = `📋 Work Radar Summary: You have ${rateRecord.batchedMessages.length} updates pending attention.`;
      await db.createReminder({
        user_id: userId,
        task_id: alertsToDispatch[0].taskId,
        trigger_type: 'DAILY_SUMMARY',
        message: summaryMsg
      });
      rateRecord.batchedMessages = [];
    }

    return processedAlerts;
  }
}
