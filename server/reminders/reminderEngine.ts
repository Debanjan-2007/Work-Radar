import { DbTask } from '../db/database.js';
import { config } from '../config.js';

export interface EvaluatedAlert {
  taskId: string;
  triggerType: 'DEADLINE_2H' | 'OVERDUE' | 'CRITICAL_ALERT';
  message: string;
}

export class ReminderEngine {
  /**
   * Checks if current time is within user quiet hours (default 10 PM - 8 AM).
   */
  public static isQuietHours(now = new Date()): boolean {
    const hour = now.getHours();
    const { start, end } = config.quietHours; // 22, 8
    if (start > end) {
      // e.g. 22:00 to 08:00
      return hour >= start || hour < end;
    }
    return hour >= start && hour < end;
  }

  /**
   * Evaluates a single task against trigger conditions.
   */
  public static evaluateTask(task: DbTask, alreadyAlertedTypes: Set<string>): EvaluatedAlert[] {
    if (['COMPLETED', 'CANCELLED', 'SNOOZED'].includes(task.status)) {
      return [];
    }

    const alerts: EvaluatedAlert[] = [];
    const now = Date.now();

    // 1. CRITICAL Tier Trigger (Score >= 120)
    if (task.priority_score >= 120 && !alreadyAlertedTypes.has(`${task.id}:CRITICAL_ALERT`)) {
      alerts.push({
        taskId: task.id,
        triggerType: 'CRITICAL_ALERT',
        message: `🚨 Critical Priority Task: "${task.title}" requires immediate attention (Score: ${task.priority_score}).`
      });
    }

    // Deadline-based triggers
    if (task.deadline) {
      const deadlineTime = new Date(task.deadline).getTime();
      const diffMs = deadlineTime - now;
      const diffHours = diffMs / (1000 * 60 * 60);

      // 2. Overdue Trigger
      if (diffMs < 0 && !alreadyAlertedTypes.has(`${task.id}:OVERDUE`)) {
        alerts.push({
          taskId: task.id,
          triggerType: 'OVERDUE',
          message: `⚠️ Task Overdue: "${task.title}" was due at ${new Date(task.deadline).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`
        });
      }
      // 3. Approaching Deadline Trigger (within 2 hours)
      else if (diffHours > 0 && diffHours <= 2 && !alreadyAlertedTypes.has(`${task.id}:DEADLINE_2H`)) {
        alerts.push({
          taskId: task.id,
          triggerType: 'DEADLINE_2H',
          message: `⏰ Deadline Approaching: "${task.title}" is due in ${Math.round(diffHours * 60)} minutes.`
        });
      }
    }

    return alerts;
  }
}
