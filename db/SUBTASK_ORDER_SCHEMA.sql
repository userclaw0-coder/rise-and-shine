-- Add subtask_order_ids column for per-parent subtask ordering
-- Run this in Supabase SQL Editor

ALTER TABLE shared_project_workspaces
  ADD COLUMN IF NOT EXISTS subtask_order_ids JSONB DEFAULT '{}';
