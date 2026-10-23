-- ====================================================================
-- OPENDOTS CLOUD POSTGRESQL / SUPABASE SCHEMA
-- Permanent Cloud Storage for Users, Memory, Reminders, and Workspaces
-- ====================================================================

-- Users Table (Google OAuth Identifiers & Profiles)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  google_sub TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  picture TEXT,
  created_at BIGINT NOT NULL,
  last_login_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_google_sub ON users(google_sub);

-- Settings Table (per-user or global fallback)
CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY CHECK(id=1),
  value TEXT NOT NULL
);

-- Spaces / Projects Table
CREATE TABLE IF NOT EXISTS spaces (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL DEFAULT 'opendots-owner',
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  goal TEXT,
  instructions TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  archived_at BIGINT,
  created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_spaces_owner ON spaces(owner_id, created_at);

-- Dots / AI Agents Table
CREATE TABLE IF NOT EXISTS dots (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL,
  owner_id TEXT NOT NULL DEFAULT 'opendots-owner',
  name TEXT NOT NULL,
  instructions TEXT NOT NULL,
  research_allowed BOOLEAN NOT NULL DEFAULT TRUE,
  memory_allowed BOOLEAN NOT NULL DEFAULT TRUE,
  apps_allowed BOOLEAN NOT NULL DEFAULT FALSE,
  composio_toolkits TEXT NOT NULL DEFAULT '[]',
  composio_session_id TEXT,
  composio_policy_hash TEXT,
  learning_container_id TEXT,
  skill_delivery_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_dots_owner ON dots(owner_id);

-- Dot Spaces Join Table
CREATE TABLE IF NOT EXISTS dot_spaces (
  dot_id TEXT NOT NULL,
  space_id TEXT NOT NULL,
  PRIMARY KEY (dot_id, space_id)
);

-- Thread Bindings / Conversations Table
CREATE TABLE IF NOT EXISTS thread_bindings (
  id TEXT PRIMARY KEY,
  dot_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  title TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  learning_container_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_threads_owner ON thread_bindings(owner_id, created_at DESC);

-- Memories V2 Table
CREATE TABLE IF NOT EXISTS memories_v2 (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  category TEXT NOT NULL,
  text TEXT NOT NULL,
  confidence REAL DEFAULT 1.0,
  pinned INTEGER DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'user_explicit',
  project_id TEXT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  last_accessed_at BIGINT
);
CREATE INDEX IF NOT EXISTS idx_memories_owner_cat ON memories_v2(owner_id, category);
CREATE INDEX IF NOT EXISTS idx_memories_created ON memories_v2(created_at DESC);

-- Reminders Table
CREATE TABLE IF NOT EXISTS reminders (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT,
  scheduled_at BIGINT NOT NULL,
  original_scheduled_at BIGINT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  recurrence TEXT NOT NULL DEFAULT 'none',
  recurrence_rule TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled',
  is_event_monitoring INTEGER NOT NULL DEFAULT 0,
  event_query TEXT,
  event_source TEXT,
  event_target_time_str TEXT,
  delivery_channels_json TEXT NOT NULL DEFAULT '["push","in_app","speech"]',
  last_triggered_at BIGINT,
  trigger_count INTEGER NOT NULL DEFAULT 0,
  snooze_count INTEGER NOT NULL DEFAULT 0,
  snoozed_until BIGINT,
  completed_at BIGINT,
  cancelled_at BIGINT,
  failure_reason TEXT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reminders_due ON reminders(owner_id, status, scheduled_at ASC);

-- Web Push Subscriptions Table
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at BIGINT NOT NULL,
  last_used_at BIGINT
);
CREATE INDEX IF NOT EXISTS idx_push_subs_owner ON push_subscriptions(owner_id);

-- Goals Table
CREATE TABLE IF NOT EXISTS goals (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL DEFAULT 'opendots-owner',
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'personal',
  target_date BIGINT,
  priority TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'active',
  milestones_json TEXT NOT NULL DEFAULT '[]',
  metrics_json TEXT NOT NULL DEFAULT '{}',
  notes TEXT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_goals_owner_status ON goals(owner_id, status, created_at DESC);

-- Task Plans Table
CREATE TABLE IF NOT EXISTS task_plans (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL DEFAULT 'opendots-owner',
  goal TEXT NOT NULL,
  status TEXT NOT NULL,
  current_step_index INTEGER NOT NULL DEFAULT 0,
  steps_json TEXT NOT NULL,
  final_result TEXT,
  error TEXT,
  space_id TEXT,
  project_id TEXT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_task_plans_owner ON task_plans(owner_id, created_at DESC);

-- Tasks, Runs, Events (Autonomous Scheduler)
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  prompt TEXT NOT NULL,
  status TEXT NOT NULL,
  interval_seconds INTEGER,
  next_run_at BIGINT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  error TEXT,
  lease TEXT,
  lease_until BIGINT,
  trigger_type TEXT DEFAULT 'time',
  condition_json TEXT,
  monitoring_config_json TEXT,
  change_history_json TEXT DEFAULT '[]',
  depends_on_json TEXT DEFAULT '[]',
  idempotency_key TEXT
);
CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(status, next_run_at);

CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at BIGINT NOT NULL,
  finished_at BIGINT,
  result TEXT,
  error TEXT
);
CREATE INDEX IF NOT EXISTS idx_runs_task ON runs(task_id, started_at);

CREATE TABLE IF NOT EXISTS events (
  id BIGSERIAL PRIMARY KEY,
  task_id TEXT NOT NULL,
  run_id TEXT,
  text TEXT NOT NULL,
  created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_task ON events(task_id, id);

-- Pages & Documentation
CREATE TABLE IF NOT EXISTS pages (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL,
  parent_id TEXT,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  revision INTEGER NOT NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  source_thread_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_pages_space ON pages(space_id, created_at);

-- Connectors (GitHub, OpenAI, Composio, etc.)
CREATE TABLE IF NOT EXISTS connectors (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL DEFAULT 'opendots-owner',
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'unconfigured',
  config_json TEXT NOT NULL DEFAULT '{}',
  permissions_json TEXT NOT NULL DEFAULT '[]',
  available_actions_json TEXT NOT NULL DEFAULT '[]',
  last_tested_at BIGINT,
  error TEXT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_connectors_owner ON connectors(owner_id, type);
