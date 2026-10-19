import { db, DbReminder } from '../db/database.js';
import { ReminderScheduler } from './reminderScheduler.js';

export class ReminderService {
  public static async getPendingAlerts(userId: string): Promise<DbReminder[]> {
    return db.getReminders(userId, true);
  }

  public static async getAllAlerts(userId: string): Promise<DbReminder[]> {
    return db.getReminders(userId, false);
  }

  public static async acknowledgeAlert(id: string, userId: string): Promise<boolean> {
    return db.acknowledgeReminder(id, userId);
  }

  public static async triggerManualEvaluation(userId: string) {
    return ReminderScheduler.tick(userId);
  }
}
