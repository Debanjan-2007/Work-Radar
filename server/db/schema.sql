-- WORK RADAR POSTGRESQL SCHEMA (Section 32 & Security/Reminders extensions)

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- USERS TABLE
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    avatar_url TEXT,
    oauth_provider VARCHAR(50),          -- 'google' | 'github' | 'microsoft'
    oauth_provider_id TEXT,              -- provider's stable user ID
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Unique index for OAuth provider lookups
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_oauth
  ON users (oauth_provider, oauth_provider_id)
  WHERE oauth_provider IS NOT NULL;

-- TASKS TABLE
CREATE TABLE IF NOT EXISTS tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    source VARCHAR(50) NOT NULL,
    source_id TEXT,
    source_url TEXT,
    priority VARCHAR(20) NOT NULL,          -- derived tier: LOW, MEDIUM, HIGH, CRITICAL
    priority_score INTEGER NOT NULL CHECK (priority_score >= 0 AND priority_score <= 125), -- source of truth (0-125)
    deadline TIMESTAMPTZ,
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING', -- PENDING, IN_PROGRESS, COMPLETED, SNOOZED, OVERDUE, CANCELLED, WAITING
    user_priority INTEGER DEFAULT 0 CHECK (user_priority >= 0 AND user_priority <= 10),
    snoozed_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- INTEGRATIONS TABLE (Encrypted OAuth credentials)
CREATE TABLE IF NOT EXISTS integrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL,           -- gmail, github, outlook, teams
    access_token TEXT NOT NULL,              -- AES-256-GCM encrypted
    refresh_token TEXT,                     -- AES-256-GCM encrypted
    scopes TEXT[],
    status VARCHAR(30) NOT NULL DEFAULT 'CONNECTED', -- CONNECTED, DISCONNECTED, ERROR, EXPIRED
    last_sync_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, provider)
);

-- SOURCE MESSAGES TABLE (Retains full source context)
CREATE TABLE IF NOT EXISTS source_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL,
    external_id TEXT,
    sender TEXT,
    subject TEXT,
    content TEXT NOT NULL,
    source_url TEXT,
    received_at TIMESTAMPTZ DEFAULT NOW(),
    task_id UUID REFERENCES tasks(id) ON DELETE SET NULL
);

-- TASK EVENTS TABLE (Telemetry & Disagreement logging)
CREATE TABLE IF NOT EXISTS task_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL, -- TASK_CREATED, TASK_STARTED, TASK_COMPLETED, TASK_SNOOZED, PRIORITY_CHANGED, DEADLINE_CHANGED, PRIORITY_DISAGREEMENT
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- REMINDERS TABLE (Alerts & notification history)
CREATE TABLE IF NOT EXISTS reminders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    trigger_type VARCHAR(50) NOT NULL, -- DEADLINE_2H, OVERDUE, CRITICAL_ALERT, DAILY_SUMMARY
    message TEXT NOT NULL,
    sent_at TIMESTAMPTZ DEFAULT NOW(),
    acknowledged BOOLEAN DEFAULT FALSE
);

-- Indices for rapid priority queue queries & deduplication
CREATE INDEX IF NOT EXISTS idx_tasks_user_status ON tasks(user_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority_score DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_deadline ON tasks(deadline);
CREATE INDEX IF NOT EXISTS idx_source_messages_user ON source_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_task_events_task ON task_events(task_id);
