import { pgClient, QueryResult } from './connection.js';
import { DEMO_USER, AuthenticatedUser } from '../middleware/auth.js';
import crypto from 'crypto';

export interface DbUser {
  id: string;
  email: string;
  name: string;
  avatar_url?: string;
  oauth_provider?: string;
  oauth_provider_id?: string;
  created_at: string;
  updated_at: string;
}

export interface OAuthUserInput {
  provider: string;      // 'google' | 'github' | 'microsoft'
  providerId: string;    // provider's unique user id
  email: string;
  name: string;
  avatarUrl?: string;
}

export interface DbTask {
  id: string;
  user_id: string;
  title: string;
  description: string;
  source: 'gmail' | 'github' | 'outlook' | 'teams' | 'chrome' | 'manual';
  source_id?: string;
  source_url?: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  priority_score: number;
  deadline?: string | null;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'SNOOZED' | 'OVERDUE' | 'CANCELLED' | 'WAITING';
  user_priority: number;
  snoozed_until?: string | null;
  created_at: string;
  updated_at: string;
  completed_at?: string | null;
}

export interface DbSourceMessage {
  id: string;
  user_id: string;
  provider: string;
  external_id?: string;
  sender: string;
  subject?: string;
  content: string;
  source_url?: string;
  received_at: string;
  task_id?: string;
}

export interface DbTaskEvent {
  id: string;
  task_id: string;
  event_type: string;
  metadata: Record<string, any>;
  created_at: string;
}

export interface DbIntegration {
  id: string;
  user_id: string;
  provider: string;
  access_token: string;
  refresh_token?: string;
  scopes: string[];
  status: string;
  last_sync_at?: string;
  created_at: string;
  updated_at: string;
}

export interface DbReminder {
  id: string;
  user_id: string;
  task_id: string;
  trigger_type: string;
  message: string;
  sent_at: string;
  acknowledged: boolean;
}

/**
 * Resilient Authoritative PostgreSQL Data Access Layer.
 * Supports PostgreSQL live connections while maintaining in-memory PG compatibility for local development & automated test suites.
 */
class DatabaseManager {
  private useInMemory: boolean = true;

  // In-memory relational tables matching PostgreSQL schema
  private users: Map<string, any> = new Map();
  private tasks: Map<string, DbTask> = new Map();
  private sourceMessages: Map<string, DbSourceMessage> = new Map();
  private taskEvents: Map<string, DbTaskEvent> = new Map();
  private integrations: Map<string, DbIntegration> = new Map();
  private reminders: Map<string, DbReminder> = new Map();

  async initialize(): Promise<void> {
    if (pgClient.isLivePostgres()) {
      try {
        await pgClient.query('SELECT NOW()');
        console.log('[DB] Connected successfully to live PostgreSQL server.');
        this.useInMemory = false;
        return;
      } catch (err) {
        console.warn('[DB] Live PostgreSQL connection failed; using PostgreSQL-compatible in-memory store:', err);
      }
    }

    console.log('[DB] Running PostgreSQL-compatible data store with seed data.');
    this.useInMemory = true;
    this.seedInitialData();
  }

  private seedInitialData(): void {
    // Seed user
    this.users.set(DEMO_USER.id, {
      ...DEMO_USER,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    const now = new Date();
    const todayEnd = new Date(now);
    todayEnd.setHours(18, 0, 0, 0);

    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const in3Days = new Date(now);
    in3Days.setDate(in3Days.getDate() + 3);

    const in5Days = new Date(now);
    in5Days.setDate(in5Days.getDate() + 5);

    // 1. "Submit Project Report" (Gmail - Top task, Do This Now)
    const task1Id = 'b0000000-0000-0000-0000-000000000001';
    this.tasks.set(task1Id, {
      id: task1Id,
      user_id: DEMO_USER.id,
      title: 'Submit Project Report',
      description: 'Prepare and submit final milestone deliverables report to client VP before end of day.',
      source: 'gmail',
      source_id: 'msg-gmail-1094',
      source_url: 'https://mail.google.com/mail/u/0/#inbox/1094',
      priority: 'HIGH',
      priority_score: 96,
      deadline: todayEnd.toISOString(),
      status: 'PENDING',
      user_priority: 5,
      created_at: new Date(Date.now() - 3600000 * 5).toISOString(),
      updated_at: new Date().toISOString()
    });

    this.sourceMessages.set('src-1', {
      id: 'src-1',
      user_id: DEMO_USER.id,
      provider: 'gmail',
      external_id: 'msg-gmail-1094',
      sender: 'sarah.connor@clientcorp.com',
      subject: 'Milestone 3 Deliverable & Final Report',
      content: 'Hi Alex,\nPlease submit the completed project report and architecture diagrams by 6 PM today so we can review before the leadership sync tomorrow morning.\n\nBest,\nSarah',
      source_url: 'https://mail.google.com/mail/u/0/#inbox/1094',
      received_at: new Date(Date.now() - 3600000 * 5).toISOString(),
      task_id: task1Id
    });

    // 2. "Fix Authentication Bug" (GitHub Issue)
    const task2Id = 'b0000000-0000-0000-0000-000000000002';
    this.tasks.set(task2Id, {
      id: task2Id,
      user_id: DEMO_USER.id,
      title: 'Fix Authentication Token Expiry Bug',
      description: 'Resolve token refresh loop issue reported in GitHub issue #142 for mobile clients.',
      source: 'github',
      source_id: 'issue-142',
      source_url: 'https://github.com/org/core-api/issues/142',
      priority: 'HIGH',
      priority_score: 88,
      deadline: tomorrow.toISOString(),
      status: 'PENDING',
      user_priority: 4,
      created_at: new Date(Date.now() - 3600000 * 24).toISOString(),
      updated_at: new Date().toISOString()
    });

    this.sourceMessages.set('src-2', {
      id: 'src-2',
      user_id: DEMO_USER.id,
      provider: 'github',
      external_id: 'issue-142',
      sender: 'octocat (GitHub Issue #142)',
      subject: 'Bug: JWT token refresh failure causes 401 loop',
      content: 'Users are experiencing sporadic 401 loop when auth token expires during long sessions. Needs patch ASAP.',
      source_url: 'https://github.com/org/core-api/issues/142',
      received_at: new Date(Date.now() - 3600000 * 24).toISOString(),
      task_id: task2Id
    });

    // 3. "Make Presentation for Stakeholders" (Manual)
    const task3Id = 'b0000000-0000-0000-0000-000000000003';
    this.tasks.set(task3Id, {
      id: task3Id,
      user_id: DEMO_USER.id,
      title: 'Make Presentation for Stakeholders',
      description: 'Synthesize Q3 metrics and radar architecture slides for Friday executive showcase.',
      source: 'manual',
      priority: 'HIGH',
      priority_score: 82,
      deadline: in3Days.toISOString(),
      status: 'PENDING',
      user_priority: 3,
      created_at: new Date(Date.now() - 3600000 * 8).toISOString(),
      updated_at: new Date().toISOString()
    });

    // 4. "Complete Registration & Verification" (Chrome capture)
    const task4Id = 'b0000000-0000-0000-0000-000000000004';
    this.tasks.set(task4Id, {
      id: task4Id,
      user_id: DEMO_USER.id,
      title: 'Complete Developer Portal Registration',
      description: 'Captured snippet: "Complete registration before Friday to maintain API sandbox access."',
      source: 'chrome',
      source_url: 'https://developer.cloudprovider.com/portal/registration',
      priority: 'MEDIUM',
      priority_score: 65,
      deadline: in5Days.toISOString(),
      status: 'PENDING',
      user_priority: 1,
      created_at: new Date(Date.now() - 3600000 * 12).toISOString(),
      updated_at: new Date().toISOString()
    });

    this.sourceMessages.set('src-4', {
      id: 'src-4',
      user_id: DEMO_USER.id,
      provider: 'chrome',
      sender: 'Chrome Extension Capture',
      content: 'Please complete your developer verification and sandbox registration before Friday 5:00 PM EST to avoid service disruption.',
      source_url: 'https://developer.cloudprovider.com/portal/registration',
      received_at: new Date(Date.now() - 3600000 * 12).toISOString(),
      task_id: task4Id
    });

    // 5. "Review Documentation" (Outlook Email)
    const task5Id = 'b0000000-0000-0000-0000-000000000005';
    this.tasks.set(task5Id, {
      id: task5Id,
      user_id: DEMO_USER.id,
      title: 'Review Security Audit Documentation',
      description: 'Review security compliance review notes from Marcus.',
      source: 'outlook',
      source_id: 'outlook-msg-88',
      source_url: 'https://outlook.office.com/mail/id/88',
      priority: 'MEDIUM',
      priority_score: 48,
      deadline: null,
      status: 'PENDING',
      user_priority: 0,
      created_at: new Date(Date.now() - 3600000 * 2).toISOString(),
      updated_at: new Date().toISOString()
    });

    // 6. Completed Task 1
    const comp1Id = 'b0000000-0000-0000-0000-000000000006';
    this.tasks.set(comp1Id, {
      id: comp1Id,
      user_id: DEMO_USER.id,
      title: 'Send Weekly Status Email',
      description: 'Summarize work completed across engineering teams.',
      source: 'gmail',
      priority: 'MEDIUM',
      priority_score: 55,
      deadline: now.toISOString(),
      status: 'COMPLETED',
      user_priority: 0,
      created_at: new Date(Date.now() - 3600000 * 20).toISOString(),
      updated_at: new Date(Date.now() - 3600000 * 2).toISOString(),
      completed_at: new Date(Date.now() - 3600000 * 2).toISOString()
    });

    // Seed Integrations
    this.integrations.set('int-gmail', {
      id: 'int-gmail',
      user_id: DEMO_USER.id,
      provider: 'gmail',
      access_token: 'mock-encrypted-token-gmail',
      scopes: ['https://www.googleapis.com/auth/gmail.readonly'],
      status: 'CONNECTED',
      last_sync_at: new Date(Date.now() - 300000).toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    this.integrations.set('int-github', {
      id: 'int-github',
      user_id: DEMO_USER.id,
      provider: 'github',
      access_token: 'mock-encrypted-token-github',
      scopes: ['repo', 'read:user'],
      status: 'CONNECTED',
      last_sync_at: new Date(Date.now() - 600000).toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
  }

  // Authoritative Task Queries
  async getTasks(userId: string, filter?: { status?: string; source?: string }): Promise<DbTask[]> {
    if (!this.useInMemory) {
      let query = 'SELECT * FROM tasks WHERE user_id = $1';
      const params: any[] = [userId];
      if (filter?.status) {
        params.push(filter.status);
        query += ` AND status = $${params.length}`;
      }
      if (filter?.source) {
        params.push(filter.source);
        query += ` AND source = $${params.length}`;
      }
      query += ' ORDER BY priority_score DESC, deadline ASC NULLS LAST';
      const result = await pgClient.query<DbTask>(query, params);
      return result.rows;
    }

    let items = Array.from(this.tasks.values()).filter(t => t.user_id === userId);
    if (filter?.status) {
      items = items.filter(t => t.status.toUpperCase() === filter.status!.toUpperCase());
    }
    if (filter?.source) {
      items = items.filter(t => t.source.toLowerCase() === filter.source!.toLowerCase());
    }
    return items.sort((a, b) => b.priority_score - a.priority_score);
  }

  async getTaskById(id: string, userId: string): Promise<DbTask | null> {
    if (!this.useInMemory) {
      const res = await pgClient.query<DbTask>('SELECT * FROM tasks WHERE id = $1 AND user_id = $2', [id, userId]);
      return res.rows[0] || null;
    }
    const t = this.tasks.get(id);
    return (t && t.user_id === userId) ? { ...t } : null;
  }

  async createTask(task: Omit<DbTask, 'id' | 'created_at' | 'updated_at'>): Promise<DbTask> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const newTask: DbTask = {
      ...task,
      id,
      created_at: now,
      updated_at: now,
    };

    if (!this.useInMemory) {
      const q = `
        INSERT INTO tasks (id, user_id, title, description, source, source_id, source_url, priority, priority_score, deadline, status, user_priority, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        RETURNING *;
      `;
      const res = await pgClient.query<DbTask>(q, [
        newTask.id, newTask.user_id, newTask.title, newTask.description,
        newTask.source, newTask.source_id, newTask.source_url,
        newTask.priority, newTask.priority_score, newTask.deadline,
        newTask.status, newTask.user_priority, newTask.created_at, newTask.updated_at
      ]);
      return res.rows[0];
    }

    this.tasks.set(id, newTask);
    return { ...newTask };
  }

  async updateTask(id: string, userId: string, updates: Partial<DbTask>): Promise<DbTask | null> {
    const existing = await this.getTaskById(id, userId);
    if (!existing) return null;

    const updated: DbTask = {
      ...existing,
      ...updates,
      id: existing.id,
      user_id: existing.user_id,
      updated_at: new Date().toISOString(),
    };

    if (!this.useInMemory) {
      const fields = Object.keys(updates).filter(k => k !== 'id' && k !== 'user_id');
      const setClauses = fields.map((f, i) => `${f} = $${i + 3}`).join(', ');
      const params = [id, userId, ...fields.map(f => (updates as any)[f])];
      const q = `UPDATE tasks SET ${setClauses}, updated_at = NOW() WHERE id = $1 AND user_id = $2 RETURNING *`;
      const res = await pgClient.query<DbTask>(q, params);
      return res.rows[0] || null;
    }

    this.tasks.set(id, updated);
    return { ...updated };
  }

  async deleteTask(id: string, userId: string): Promise<boolean> {
    if (!this.useInMemory) {
      const res = await pgClient.query('DELETE FROM tasks WHERE id = $1 AND user_id = $2', [id, userId]);
      return res.rowCount > 0;
    }
    const t = this.tasks.get(id);
    if (t && t.user_id === userId) {
      this.tasks.delete(id);
      return true;
    }
    return false;
  }

  // Source Messages
  async saveSourceMessage(msg: Omit<DbSourceMessage, 'id' | 'received_at'>): Promise<DbSourceMessage> {
    const id = crypto.randomUUID();
    const newMsg: DbSourceMessage = {
      ...msg,
      id,
      received_at: new Date().toISOString()
    };

    if (!this.useInMemory) {
      const q = `
        INSERT INTO source_messages (id, user_id, provider, external_id, sender, subject, content, source_url, received_at, task_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *;
      `;
      const res = await pgClient.query<DbSourceMessage>(q, [
        newMsg.id, newMsg.user_id, newMsg.provider, newMsg.external_id,
        newMsg.sender, newMsg.subject, newMsg.content, newMsg.source_url,
        newMsg.received_at, newMsg.task_id
      ]);
      return res.rows[0];
    }

    this.sourceMessages.set(id, newMsg);
    return { ...newMsg };
  }

  async getSourceMessageForTask(taskId: string, userId: string): Promise<DbSourceMessage | null> {
    if (!this.useInMemory) {
      const res = await pgClient.query<DbSourceMessage>(
        'SELECT * FROM source_messages WHERE task_id = $1 AND user_id = $2 LIMIT 1',
        [taskId, userId]
      );
      return res.rows[0] || null;
    }
    const found = Array.from(this.sourceMessages.values()).find(m => m.task_id === taskId && m.user_id === userId);
    return found ? { ...found } : null;
  }

  // Task Events (Disagreement & Telemetry)
  async recordTaskEvent(taskId: string, eventType: string, metadata: Record<string, any> = {}): Promise<DbTaskEvent> {
    const id = crypto.randomUUID();
    const event: DbTaskEvent = {
      id,
      task_id: taskId,
      event_type: eventType,
      metadata,
      created_at: new Date().toISOString()
    };

    if (!this.useInMemory) {
      await pgClient.query(
        'INSERT INTO task_events (id, task_id, event_type, metadata, created_at) VALUES ($1, $2, $3, $4, $5)',
        [event.id, event.task_id, event.event_type, JSON.stringify(event.metadata), event.created_at]
      );
      return event;
    }

    this.taskEvents.set(id, event);
    return { ...event };
  }

  // Integrations
  async getIntegrations(userId: string): Promise<DbIntegration[]> {
    if (!this.useInMemory) {
      const res = await pgClient.query<DbIntegration>('SELECT * FROM integrations WHERE user_id = $1', [userId]);
      return res.rows;
    }
    return Array.from(this.integrations.values()).filter(i => i.user_id === userId);
  }

  async saveIntegration(integration: Omit<DbIntegration, 'id' | 'created_at' | 'updated_at'>): Promise<DbIntegration> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const item: DbIntegration = {
      ...integration,
      id,
      created_at: now,
      updated_at: now
    };

    if (!this.useInMemory) {
      const q = `
        INSERT INTO integrations (id, user_id, provider, access_token, refresh_token, scopes, status, last_sync_at, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (user_id, provider) DO UPDATE SET
          access_token = EXCLUDED.access_token,
          refresh_token = EXCLUDED.refresh_token,
          status = EXCLUDED.status,
          updated_at = NOW()
        RETURNING *;
      `;
      const res = await pgClient.query<DbIntegration>(q, [
        item.id, item.user_id, item.provider, item.access_token,
        item.refresh_token, item.scopes, item.status, item.last_sync_at,
        item.created_at, item.updated_at
      ]);
      return res.rows[0];
    }

    this.integrations.set(`${item.user_id}:${item.provider}`, item);
    return { ...item };
  }

  // Reminders
  async createReminder(reminder: Omit<DbReminder, 'id' | 'sent_at' | 'acknowledged'>): Promise<DbReminder> {
    const id = crypto.randomUUID();
    const item: DbReminder = {
      ...reminder,
      id,
      sent_at: new Date().toISOString(),
      acknowledged: false
    };

    if (!this.useInMemory) {
      const q = `
        INSERT INTO reminders (id, user_id, task_id, trigger_type, message, sent_at, acknowledged)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *;
      `;
      const res = await pgClient.query<DbReminder>(q, [
        item.id, item.user_id, item.task_id, item.trigger_type, item.message, item.sent_at, item.acknowledged
      ]);
      return res.rows[0];
    }

    this.reminders.set(id, item);
    return { ...item };
  }

  async getReminders(userId: string, unacknowledgedOnly = false): Promise<DbReminder[]> {
    if (!this.useInMemory) {
      let q = 'SELECT * FROM reminders WHERE user_id = $1';
      if (unacknowledgedOnly) q += ' AND acknowledged = FALSE';
      q += ' ORDER BY sent_at DESC LIMIT 50';
      const res = await pgClient.query<DbReminder>(q, [userId]);
      return res.rows;
    }

    let items = Array.from(this.reminders.values()).filter(r => r.user_id === userId);
    if (unacknowledgedOnly) items = items.filter(r => !r.acknowledged);
    return items.sort((a, b) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime());
  }

  async acknowledgeReminder(id: string, userId: string): Promise<boolean> {
    if (!this.useInMemory) {
      const res = await pgClient.query('UPDATE reminders SET acknowledged = TRUE WHERE id = $1 AND user_id = $2', [id, userId]);
      return res.rowCount > 0;
    }
    const r = this.reminders.get(id);
    if (r && r.user_id === userId) {
      r.acknowledged = true;
      return true;
    }
    return false;
  }

  // ── OAuth User Management ────────────────────────────────────────────────────

  /**
   * Find-or-create a user based on OAuth provider data.
   * Updates name/avatar on every login.
   * Returns an AuthenticatedUser for session token creation.
   */
  async upsertOAuthUser(input: OAuthUserInput): Promise<AuthenticatedUser> {
    const { provider, providerId, email, name, avatarUrl } = input;
    const now = new Date().toISOString();

    if (!this.useInMemory) {
      // Ensure the users table has oauth columns (safe migration)
      await pgClient.query(`
        ALTER TABLE users
          ADD COLUMN IF NOT EXISTS oauth_provider VARCHAR(50),
          ADD COLUMN IF NOT EXISTS oauth_provider_id TEXT;
        CREATE UNIQUE INDEX IF NOT EXISTS idx_users_oauth
          ON users (oauth_provider, oauth_provider_id);
      `).catch(() => {}); // Ignore if columns already exist

      const q = `
        INSERT INTO users (id, email, name, avatar_url, oauth_provider, oauth_provider_id, created_at, updated_at)
        VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, NOW(), NOW())
        ON CONFLICT (email) DO UPDATE SET
          name         = EXCLUDED.name,
          avatar_url   = EXCLUDED.avatar_url,
          oauth_provider    = EXCLUDED.oauth_provider,
          oauth_provider_id = EXCLUDED.oauth_provider_id,
          updated_at   = NOW()
        RETURNING id, email, name, avatar_url;
      `;
      const res = await pgClient.query<DbUser>(q, [email, name, avatarUrl || null, provider, providerId]);
      const row = res.rows[0];
      return { id: row.id, email: row.email, name: row.name, avatarUrl: row.avatar_url };
    }

    // In-memory: find by email or provider+providerId
    let existing: any = null;
    for (const u of this.users.values()) {
      if (u.email === email || (u.oauth_provider === provider && u.oauth_provider_id === providerId)) {
        existing = u;
        break;
      }
    }

    if (existing) {
      existing.name = name;
      existing.avatar_url = avatarUrl;
      existing.oauth_provider = provider;
      existing.oauth_provider_id = providerId;
      existing.updated_at = now;
      this.users.set(existing.id, existing);
      return { id: existing.id, email: existing.email, name: existing.name, avatarUrl: existing.avatar_url };
    }

    // Create new user
    const id = crypto.randomUUID();
    const newUser: DbUser = {
      id,
      email,
      name,
      avatar_url: avatarUrl,
      oauth_provider: provider,
      oauth_provider_id: providerId,
      created_at: now,
      updated_at: now
    };
    this.users.set(id, newUser);
    return { id, email, name, avatarUrl };
  }
}

export const db = new DatabaseManager();
