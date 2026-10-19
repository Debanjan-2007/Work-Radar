import { db, DbTask } from '../db/database.js';
import { PriorityEngine } from '../engine/priorityEngine.js';
import { TaskPriorityQueue } from '../engine/priorityQueue.js';
import { AuditLogger } from '../security/auditLogger.js';

export interface WorkStatusSummary {
  remaining: number;
  dueToday: number;
  overdue: number;
  inProgress: number;
  waiting: number;
  completedToday: number;
}

export class TaskService {
  private static userQueues: Map<string, TaskPriorityQueue> = new Map();

  /**
   * Retrieves or initializes the in-memory Max Heap for a user from the authoritative database.
   */
  public static async getQueue(userId: string): Promise<TaskPriorityQueue> {
    let queue = this.userQueues.get(userId);
    if (!queue) {
      const activeTasks = await db.getTasks(userId);
      queue = new TaskPriorityQueue(activeTasks);
      this.userQueues.set(userId, queue);
    }
    return queue;
  }

  /**
   * Refreshes the in-memory queue from the database.
   */
  public static async refreshQueue(userId: string): Promise<TaskPriorityQueue> {
    const activeTasks = await db.getTasks(userId);
    const queue = new TaskPriorityQueue(activeTasks);
    this.userQueues.set(userId, queue);
    return queue;
  }

  /**
   * Creates an authoritative task with bounded priority scoring.
   */
  public static async createTask(userId: string, input: {
    title: string;
    description?: string;
    source: 'gmail' | 'github' | 'outlook' | 'teams' | 'chrome' | 'manual';
    source_id?: string;
    source_url?: string;
    deadline?: string | null;
    importance?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    urgency?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    user_priority?: number;
  }): Promise<DbTask> {
    const priorityCalc = PriorityEngine.calculatePriority({
      deadline: input.deadline,
      importance: input.importance,
      urgency: input.urgency,
      source: input.source,
      userPriority: input.user_priority || 0,
      createdAt: new Date()
    });

    const newTask = await db.createTask({
      user_id: userId,
      title: input.title.trim(),
      description: input.description || '',
      source: input.source,
      source_id: input.source_id,
      source_url: input.source_url,
      priority: priorityCalc.tier,
      priority_score: priorityCalc.totalScore,
      deadline: input.deadline || null,
      status: 'PENDING',
      user_priority: Math.min(10, Math.max(0, input.user_priority || 0))
    });

    await db.recordTaskEvent(newTask.id, 'TASK_CREATED', {
      priority_score: newTask.priority_score,
      tier: newTask.priority
    });

    // Update in-memory Max Heap
    const queue = await this.getQueue(userId);
    queue.push(newTask);

    return newTask;
  }

  /**
   * Returns single highest-priority task ("DO THIS NOW") in O(1) via Max Heap.
   */
  public static async getNextTask(userId: string): Promise<(DbTask & { reason: string }) | null> {
    const queue = await this.getQueue(userId);
    const topTask = queue.peek();
    if (!topTask) return null;

    const calc = PriorityEngine.calculatePriority({
      deadline: topTask.deadline,
      importance: topTask.priority as any,
      source: topTask.source,
      userPriority: topTask.user_priority,
      createdAt: topTask.created_at
    });

    return {
      ...topTask,
      reason: calc.reason
    };
  }

  /**
   * Starts a task. Logs PRIORITY_DISAGREEMENT if user starts a task other than the top-ranked task.
   */
  public static async startTask(userId: string, taskId: string): Promise<DbTask | null> {
    const queue = await this.getQueue(userId);
    const currentTop = queue.peek();

    // Check for disagreement signal (Section 10 & 23)
    if (currentTop && currentTop.id !== taskId) {
      AuditLogger.log({
        eventType: 'PRIORITY_DISAGREEMENT',
        userId,
        details: {
          action: 'SKIP_TOP_TASK',
          startedTaskId: taskId,
          topRankedTaskId: currentTop.id,
          topRankedScore: currentTop.priority_score
        }
      });

      await db.recordTaskEvent(taskId, 'PRIORITY_DISAGREEMENT', {
        action: 'SKIP_TOP_TASK',
        top_ranked_id: currentTop.id,
        top_ranked_score: currentTop.priority_score
      });
    }

    const updated = await db.updateTask(taskId, userId, { status: 'IN_PROGRESS' });
    if (updated) {
      await db.recordTaskEvent(taskId, 'TASK_STARTED', {});
      await this.refreshQueue(userId);
    }
    return updated;
  }

  /**
   * Completes a task. Removes from active queue and triggers priority progression.
   */
  public static async completeTask(userId: string, taskId: string): Promise<DbTask | null> {
    const updated = await db.updateTask(taskId, userId, {
      status: 'COMPLETED',
      completed_at: new Date().toISOString()
    });

    if (updated) {
      await db.recordTaskEvent(taskId, 'TASK_COMPLETED', {});
      const queue = await this.getQueue(userId);
      queue.remove(taskId);
    }
    return updated;
  }

  /**
   * Snoozes a task until a designated timestamp.
   */
  public static async snoozeTask(userId: string, taskId: string, until: string): Promise<DbTask | null> {
    const queue = await this.getQueue(userId);
    const currentTop = queue.peek();

    if (currentTop && currentTop.id === taskId) {
      await db.recordTaskEvent(taskId, 'PRIORITY_DISAGREEMENT', {
        action: 'SNOOZE_TOP_TASK',
        score: currentTop.priority_score
      });
    }

    const updated = await db.updateTask(taskId, userId, {
      status: 'SNOOZED',
      snoozed_until: until
    });

    if (updated) {
      await db.recordTaskEvent(taskId, 'TASK_SNOOZED', { snoozed_until: until });
      queue.remove(taskId);
    }
    return updated;
  }

  /**
   * Recalculates priority scores for all open tasks of a user (PRD Section 22).
   */
  public static async recalculateAllPriorities(userId: string): Promise<DbTask[]> {
    const tasks = await db.getTasks(userId);
    const updatedTasks: DbTask[] = [];

    for (const task of tasks) {
      if (['COMPLETED', 'CANCELLED'].includes(task.status)) continue;

      const calc = PriorityEngine.calculatePriority({
        deadline: task.deadline,
        importance: task.priority as any,
        source: task.source,
        createdAt: task.created_at,
        userPriority: task.user_priority
      });

      if (calc.totalScore !== task.priority_score || calc.tier !== task.priority) {
        const updated = await db.updateTask(task.id, userId, {
          priority_score: calc.totalScore,
          priority: calc.tier
        });
        if (updated) {
          updatedTasks.push(updated);
          await db.recordTaskEvent(task.id, 'PRIORITY_CHANGED', {
            old_score: task.priority_score,
            new_score: calc.totalScore,
            new_tier: calc.tier
          });
        }
      }
    }

    await this.refreshQueue(userId);
    return updatedTasks;
  }

  /**
   * Calculates dashboard summary status counts (Section 11).
   */
  public static async getWorkStatus(userId: string): Promise<WorkStatusSummary> {
    const allTasks = await db.getTasks(userId);
    const now = Date.now();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    let remaining = 0;
    let dueToday = 0;
    let overdue = 0;
    let inProgress = 0;
    let waiting = 0;
    let completedToday = 0;

    for (const task of allTasks) {
      if (['PENDING', 'IN_PROGRESS', 'WAITING'].includes(task.status)) {
        remaining++;
      }

      if (task.status === 'IN_PROGRESS') {
        inProgress++;
      }

      if (task.status === 'WAITING') {
        waiting++;
      }

      if (task.status === 'COMPLETED' && task.completed_at) {
        const compTime = new Date(task.completed_at).getTime();
        if (compTime >= todayStart.getTime() && compTime <= todayEnd.getTime()) {
          completedToday++;
        }
      }

      if (['PENDING', 'IN_PROGRESS'].includes(task.status) && task.deadline) {
        const dTime = new Date(task.deadline).getTime();
        if (dTime < now) {
          overdue++;
        } else if (dTime >= todayStart.getTime() && dTime <= todayEnd.getTime()) {
          dueToday++;
        }
      }
    }

    return {
      remaining,
      dueToday,
      overdue,
      inProgress,
      waiting,
      completedToday
    };
  }
}
