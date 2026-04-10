-- Jarvis session memory: stores conversation summaries for cross-session continuity
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS jarvis_session_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  summary TEXT NOT NULL,
  topics TEXT[] DEFAULT '{}',
  tasks_created INT DEFAULT 0,
  tasks_completed INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_jarvis_sessions_user
  ON jarvis_session_summaries (user_id, created_at DESC);
