# Implementation Plan: Work Radar MVP System

Work Radar is an AI-powered personal work management system that converts scattered, unstructured information (Gmail, GitHub, Outlook, Teams, browser snippets, manual inputs) into a continuously prioritized live Priority Queue. It answers two fundamental questions at any moment: **"What work is still left?"** and **"What should I work on next?"**

This plan incorporates:
- **Strict security-first backend architecture** (authentication, row-level authorization, validation, rate limiting, CSRF, security headers, token encryption, audit logging).
- **PostgreSQL-first database design** (`UUID`, `JSONB`, `TEXT[]`, `TIMESTAMPTZ`, parameterized SQL).
- **Modular integration adapters** (`IIntegrationAdapter` with `connect`, `fetchMessages`, `disconnect`, `refreshToken`, and `healthCheck`).
- **Bounded Priority Engine** (0–125 points) & **Max Heap Queue**.
- **Smart Reminders Subsystem** (`reminderEngine.ts`, `reminderScheduler.ts`, `reminderService.ts`) with throttling & quiet hours.
- **Voice Intelligence Subsystem** (`voiceAgent.ts`, `speechToText.ts`, `textToSpeech.ts`) for hands-free priority briefings and voice task capture.
- **Modern Radar Dashboard** (Vanilla HTML/CSS/JS with sleek dark aesthetics, live status ribbon, and "Do This Now" showcase).
- **Chrome Extension (Manifest V3)** for web page work capture.

---

## User Review Required

> [!IMPORTANT]
> **Core Architectural Security Principles**:
> The backend is 100% authoritative. All the following are strictly treated as **UNTRUSTED**:
> - Frontend requests & Chrome Extension requests
> - External emails & web page content
> - GitHub/Outlook/Teams content & payloads
> - AI-generated output & Voice transcription inputs
>
> **Enforced Request Pipeline**:
> `Authentication → Authorization → Input Validation → Business Logic / Task Service → Database`
>
> **AI & Voice Guardrails (Zero Direct Privilege)**:
> AI and Voice agents never access the database directly, never execute SQL, never call privileged APIs, never modify authentication/permissions, and never execute shell commands. Connectors and Voice capture must route through the Task Service validation layer. OAuth tokens and secrets are encrypted with AES-256-GCM envelope encryption and never exposed to client-side code.

> [!IMPORTANT]
> **PostgreSQL-First Database Architecture**:
> Production schema and queries are built strictly for PostgreSQL (`UUID PRIMARY KEY DEFAULT gen_random_uuid()`, `JSONB`, `TEXT[]`, `TIMESTAMPTZ`, foreign keys with cascading rules). The database layer uses `pg` (node-postgres) with connection pooling, supporting local PostgreSQL or Supabase directly, alongside an in-memory/fallback PostgreSQL-compatible adapter for zero-dependency instant execution and automated test suites.

---

## Proposed System Architecture & Directory Layout

```
work-radar/
├── package.json
├── tsconfig.json
├── .env.example
├── server/
│   ├── server.ts                       # Express app bootstrap, security middleware, routing
│   ├── config.ts                       # Typed environment config & secrets validation
│   ├── middleware/
│   │   ├── auth.ts                     # JWT & session verification, cookie extraction
│   │   ├── authorization.ts            # User-id ownership & role checks (row-level authorization)
│   │   ├── validation.ts               # Strict JSON schema validation (Zod/Joi-style)
│   │   ├── rateLimiter.ts              # IP & user-scoped rate limiting (especially /capture)
│   │   ├── csrf.ts                     # SameSite cookie & CSRF header validation
│   │   └── securityHeaders.ts          # CSP, HSTS, X-Content-Type-Options, X-Frame-Options
│   ├── security/
│   │   ├── tokenEncryption.ts          # AES-256-GCM envelope encryption for OAuth tokens
│   │   ├── secrets.ts                  # Safe secrets retrieval & environment hygiene
│   │   └── auditLogger.ts              # Immutable audit logging for security & auth events
│   ├── db/
│   │   ├── schema.sql                  # PostgreSQL DDL (tables: users, tasks, integrations, etc.)
│   │   ├── connection.ts               # PostgreSQL client pool & query wrapper
│   │   └── database.ts                 # Authoritative data access layer (parameterized queries)
│   ├── engine/
│   │   ├── priorityEngine.ts           # Section 19-20 bounded scoring (0-125) & tier derivation
│   │   ├── priorityQueue.ts            # Section 21 custom Max Heap data structure
│   │   ├── duplicateDetector.ts        # Section 24 similarity & deadline window matching
│   │   └── aiExtractor.ts          # Section 18 rule-based filter + AI extractor + schema validation
│   ├── integrations/
│   │   ├── integration.interface.ts    # Unified IIntegrationAdapter with healthCheck & refreshToken
│   │   ├── integration.manager.ts      # Orchestrator dispatching to adapters & routing to Task Service
│   │   ├── gmail/
│   │   │   ├── gmail.adapter.ts        # Gmail API collector & webhook handler
│   │   │   ├── gmail.auth.ts           # Narrowly-scoped OAuth2 flow & token refresh
│   │   │   └── gmail.mapper.ts         # Maps email headers/body into normalized SourceMessage
│   │   ├── github/
│   │   │   ├── github.adapter.ts       # GitHub Issues/PRs collector & webhook handler
│   │   │   └── github.mapper.ts        # Maps GitHub issue into normalized SourceMessage
│   │   ├── outlook/
│   │   │   ├── outlook.adapter.ts      # Microsoft Graph Outlook Mail collector
│   │   │   ├── outlook.auth.ts         # Microsoft OAuth2 flow
│   │   │   └── outlook.mapper.ts       # Maps Outlook message into normalized SourceMessage
│   │   └── teams/
│   │       ├── teams.adapter.ts        # Microsoft Teams channel/chat mention collector
│   │       ├── teams.auth.ts           # Microsoft Teams OAuth2 flow
│   │       └── teams.mapper.ts         # Maps Teams message into normalized SourceMessage
│   ├── reminders/
│   │   ├── reminderEngine.ts           # Section 26 trigger evaluator (2h prior, overdue, CRITICAL tier)
│   │   ├── reminderScheduler.ts        # Periodic ticker/scheduler with throttling & quiet hours
│   │   └── reminderService.ts          # Dispatcher for in-app/browser notifications & summary alerts
│   ├── voice/
│   │   ├── voiceAgent.ts               # Voice briefing coordinator ("What should I do next?")
│   │   ├── speechToText.ts             # Audio/speech transcription & command parser
│   │   └── textToSpeech.ts             # Voice synthesizer for morning/afternoon priority briefings
│   ├── services/
│   │   ├── taskService.ts              # Authoritative task CRUD, state transitions & priority sync
│   │   └── captureService.ts           # Ingestion pipeline: Filter -> AI -> DupCheck -> TaskService
│   └── routes/
│       ├── auth.ts                     # /api/v1/auth (login, logout, me, session refresh)
│       ├── tasks.ts                    # /api/v1/tasks (CRUD, start, complete, snooze, recalculate)
│       ├── capture.ts                  # /api/v1/capture (untrusted web/extension input sanitization)
│       ├── integrations.ts             # /api/v1/integrations (connect, sync, disconnect, health, refresh)
│       ├── reminders.ts                # /api/v1/reminders (get pending alerts, dismiss, settings)
│       ├── voice.ts                    # /api/v1/voice (briefing audio/text, voice capture command)
│       └── events.ts                   # /api/v1/events (disagreement logging, audit events)
├── public/                             # Section 8 & 9 Web Dashboard
│   ├── index.html                      # Semantic, modern HTML5 dashboard
│   ├── css/
│   │   ├── main.css                    # Design system tokens, dark mode, typography, layouts
│   │   └── components.css              # Glassmorphic cards, radar sweeps, tier badges, voice widget
│   └── js/
│       ├── app.js                      # Application initialization & state coordinator
│       ├── api.js                      # Authenticated API client (CSRF + credentials included)
│       ├── ui.js                       # Renderers for Do This Now, Priority Tiers, Status Ribbon
│       ├── voice.js                    # Web Speech voice assistant & audio player
│       ├── reminders.js                # Notification manager & quiet hours handler
│       └── modals.js                   # Quick capture, duplicate dialog, integration manager
└── extension/                          # Section 16 & 35 Chrome Extension (Manifest V3)
    ├── manifest.json                   # Manifest V3 (scoped permissions: activeTab, contextMenus)
    ├── popup.html                      # Minimalist popup displaying top task & quick capture
    ├── popup.css                       # Dark theme extension styling
    ├── popup.js                        # Authenticated capture and queue peek
    ├── background.js                   # Service worker handling right-click context menu capture
    └── content.js                      # Untrusted selection extraction and metadata gathering
```

---

## Detailed Component Specifications

### 1. Security & Middleware Layer (`server/middleware/` & `server/security/`)
- **`tokenEncryption.ts`**: Implements AES-256-GCM envelope encryption. Every integration token (Gmail, Outlook, Teams, GitHub) is encrypted with an initialization vector (IV) and authentication tag before insertion into PostgreSQL `integrations` table. Decryption keys are loaded strictly from environment secrets.
- **`auth.ts` & `authorization.ts`**: Verifies cryptographically signed tokens. Enforces row-level isolation ensuring every query uses `WHERE user_id = $1` anchored to the verified session, never trusting client parameters.
- **`validation.ts`**: Rejects any request payload containing unexpected fields, invalid types, oversized text (payload size limits), or malicious control characters.
- **`rateLimiter.ts`**: Sliding-window rate limiter per IP and user ID (prevents DoS, credential stuffing, and runaway AI compute costs on `/capture`).
- **`csrf.ts` & `securityHeaders.ts`**: Strict CSP, HSTS, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `SameSite=Strict` cookie enforcement.
- **`auditLogger.ts`**: Logs all auth events, token operations, data deletions, and priority disagreements to an audit stream.

### 2. Integration Architecture (`server/integrations/`)
- **`integration.interface.ts`**:
  ```typescript
  export interface NormalizedMessage {
    externalId: string;
    provider: 'gmail' | 'github' | 'outlook' | 'teams' | 'chrome' | 'manual';
    sender: string;
    senderName?: string;
    subject?: string;
    content: string;
    sourceUrl?: string;
    receivedAt: Date;
    metadata?: Record<string, any>;
  }

  export interface IIntegrationAdapter {
    readonly provider: string;
    connect(authCode: string, userId: string): Promise<{ accessToken: string; refreshToken?: string; scopes: string[] }>;
    fetchMessages(userId: string, since?: Date): Promise<NormalizedMessage[]>;
    refreshToken(userId: string): Promise<string>;
    healthCheck(userId: string): Promise<{ healthy: boolean; details?: string }>;
    disconnect(userId: string): Promise<void>;
  }
  ```
- **Adapters**:
  - `gmail`: Scoped Gmail API integration (`gmail.readonly`, token refresh, health check).
  - `github`: Personal Access Token / OAuth integration with GitHub API (fetches assigned issues & PR review requests).
  - `outlook`: Microsoft Graph Mail API adapter (`Mail.Read`).
  - `teams`: Microsoft Graph Teams messages adapter.
- **Safe Pipeline Flow**:
  `Adapter.fetchMessages() → Rule-based Actionable Filter → AI Extractor → Duplicate Detector → TaskService.createTask() → Database`
  *(Connectors never write directly to tasks table or bypass validation).*

### 3. Reminders Subsystem (`server/reminders/`)
- **`reminderEngine.ts`**: Implements Section 26 trigger evaluation:
  - Approaching deadlines (2 hours before deadline).
  - Task becomes overdue.
  - New CRITICAL-tier task detected (score >= 120).
  - High-priority threshold exceedance.
- **`reminderScheduler.ts`**: Periodic ticker evaluating open tasks against reminder criteria. Implements strict Section 26 throttling:
  - Max 1 "deadline approaching" notification per task.
  - Max 3 notifications per hour per user (additional alerts batched into a summary notification).
  - Quiet hours enforcement (default 10:00 PM – 8:00 AM local time).
- **`reminderService.ts`**: Manages user alert queue, dispatches browser notifications, and exposes endpoints for the front-end alert drawer.

### 4. Voice Intelligence Subsystem (`server/voice/`)
- **`voiceAgent.ts`**: Natural-language conversational agent for task queries:
  - Answers "What should I do next?" with the top heap task and its plain-language justification.
  - Summarizes daily work backlog: "You have 6 tasks remaining; 2 are due today."
  - Voice task creation: converts speech into a normalized capture item for the AI extraction pipeline.
- **`speechToText.ts`**: Transcribes voice commands and audio input, filtering noise and normalizing text commands.
- **`textToSpeech.ts`**: Generates spoken audio briefings for hands-free morning standups and radar updates (supported via Web Speech API / synthesized audio endpoint).

### 5. PostgreSQL Database Schema (`server/db/schema.sql`)
- Strict PostgreSQL dialect:
  - `users`: `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`, `email VARCHAR(255) UNIQUE NOT NULL`, `name VARCHAR(255)`, `created_at TIMESTAMPTZ DEFAULT NOW()`
  - `tasks`: `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`, `user_id UUID REFERENCES users(id) ON DELETE CASCADE`, `title TEXT NOT NULL`, `description TEXT`, `source VARCHAR(50) NOT NULL`, `source_id TEXT`, `source_url TEXT`, `priority VARCHAR(20) NOT NULL`, `priority_score INTEGER NOT NULL CHECK (priority_score >= 0 AND priority_score <= 125)`, `deadline TIMESTAMPTZ`, `status VARCHAR(30) NOT NULL`, `user_priority INTEGER DEFAULT 0 CHECK (user_priority >= 0 AND user_priority <= 10)`, `created_at TIMESTAMPTZ DEFAULT NOW()`, `updated_at TIMESTAMPTZ DEFAULT NOW()`, `completed_at TIMESTAMPTZ`
  - `integrations`: `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`, `user_id UUID REFERENCES users(id) ON DELETE CASCADE`, `provider VARCHAR(50) NOT NULL`, `access_token TEXT NOT NULL`, `refresh_token TEXT`, `scopes TEXT[]`, `status VARCHAR(30) NOT NULL`, `created_at TIMESTAMPTZ DEFAULT NOW()`, `updated_at TIMESTAMPTZ DEFAULT NOW()`
  - `source_messages`: `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`, `user_id UUID REFERENCES users(id) ON DELETE CASCADE`, `provider VARCHAR(50) NOT NULL`, `external_id TEXT`, `sender TEXT`, `content TEXT`, `received_at TIMESTAMPTZ`, `task_id UUID REFERENCES tasks(id) ON DELETE SET NULL`
  - `task_events`: `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`, `task_id UUID REFERENCES tasks(id) ON DELETE CASCADE`, `event_type VARCHAR(50) NOT NULL`, `metadata JSONB DEFAULT '{}'`, `created_at TIMESTAMPTZ DEFAULT NOW()`
  - `reminders`: `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`, `user_id UUID REFERENCES users(id) ON DELETE CASCADE`, `task_id UUID REFERENCES tasks(id) ON DELETE CASCADE`, `trigger_type VARCHAR(50) NOT NULL`, `message TEXT NOT NULL`, `sent_at TIMESTAMPTZ DEFAULT NOW()`, `acknowledged BOOLEAN DEFAULT FALSE`

### 6. Priority Engine & Max Heap Queue (`server/engine/`)
- **Score Formulation**:
  - `Deadline Score`: Overdue (50), Due Today (40), Tomorrow (30), Within 3 Days (20), Within 7 Days (10), None (0).
  - `Importance Score`: Critical (30), High (25), Medium (15), Low (5).
  - `Urgency Score`: Critical/Immediate (20), High (14), Medium (8), Low (2).
  - `Source Score`: Client Email (10), Work Email (8), GitHub (7), Website (5), Manual (3).
  - `Age Score`: +1 point per 24 hours open, capped at 5.
  - `User Priority`: manual boost 0–10.
  - **Bounded Ceiling**: Clamped to 125 maximum.
- **Priority Tiers**:
  - 0–39: `LOW`
  - 40–79: `MEDIUM`
  - 80–119: `HIGH`
  - 120+: `CRITICAL`
- **Max Heap**:
  - Binary Max Heap maintaining active tasks in memory for $O(1)$ peek of "Do This Now" and $O(\log N)$ updates. Rebuilt from database on service start.

### 7. Web Application Dashboard (`public/`)
- **Rich Aesthetics**: Modern high-contrast dark palette (`#080b11`, `#0f172a`, `#1e293b`), emerald/cyan radar glow indicators (`#10b981`, `#06b6d4`, `#f59e0b`, `#ef4444`), Outfit/Inter typography, animated radar sweep canvas/SVG icon.
- **"Do This Now" Showcase**: Hero section featuring the highest-scoring task, calculated score gauge, plain-English justification ("Due today and has high importance"), estimated time, and direct `[Start Work]` action.
- **Voice Intelligence Widget**: Interactive mic button allowing users to click and ask "What should I do next?" or dictate a task, with voice playback of the priority briefing.
- **Live Work Status Ribbon**: Remaining, Due Today, Overdue, In Progress, Waiting, Completed Today.
- **Active Queues & Filtering**: Grouped by tier (`CRITICAL`, `HIGH`, `MEDIUM`, `LOW`) or filterable by provider (`Gmail`, `GitHub`, `Outlook`, `Teams`, `Chrome`, `Manual`).
- **Reminders & Alert Center**: Badge counter with drawer showing approaching deadline alerts and overdue warnings.
- **Source Context & Duplicate Prompt Modals**: Displays original email/message snippet with link back to source; interactive modal resolving potential duplicates (`Merge` vs `Keep Separate` vs `Ignore`).
- **Integrations Panel**: Connect/manage Gmail, GitHub, Outlook, and Teams with live sync status, health checks, and manual sync triggers.

### 8. Chrome Extension (`extension/`)
- Manifest V3 compliant.
- Right-click context menu "Capture to Work Radar".
- Popup displaying current top-priority task and one-click quick capture from the active webpage.

---

## Verification Plan

### Automated Tests
1. **Security & Input Validation Tests**:
   - Verify unauthenticated requests to `/api/v1/tasks` or `/api/v1/capture` are rejected (401).
   - Verify token encryption and decryption cycle with AES-256-GCM (`tokenEncryption.test.ts`).
   - Verify AI and Voice output validation rejects unparseable or malicious prompt outputs.
2. **Priority Engine Tests**:
   - Verify exact clamping (0–125 max total score).
   - Verify tier derivations for boundary values (39 -> LOW, 40 -> MEDIUM, 79 -> MEDIUM, 80 -> HIGH, 119 -> HIGH, 120 -> CRITICAL).
   - Verify Max Heap maintains highest priority task at index 0 and re-balances correctly after extraction and insertion.
3. **Reminders & Throttling Tests**:
   - Verify throttling limits notifications to at most 3 per hour and applies quiet hours suppression.
4. **Integration Health & Token Refresh Tests**:
   - Verify `healthCheck` and `refreshToken` methods on integration adapters.

### Manual Verification
1. **Server & Database Execution**:
   - Launch server on port 3000.
   - Verify PostgreSQL connection and table creation.
   - Verify seed data loads with Gmail, GitHub, Outlook, and web tasks.
2. **Dashboard Verification in Browser**:
   - Verify "Do This Now" card accurately reflects heap top.
   - Verify "Start Work" logs event and updates status.
   - Test voice assistant button ("What should I do next?").
   - Test manual task creation, quick-capture with AI parsing, and duplicate alert prompt.
   - Test filter tabs, reminders drawer, and source context inspection drawer.
3. **Integration & Extension Check**:
   - Verify Chrome extension popup loads and communicates with backend API.
