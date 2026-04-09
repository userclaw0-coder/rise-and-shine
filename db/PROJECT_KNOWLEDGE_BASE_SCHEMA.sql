-- Add knowledge_base column to shared_project_workspaces
-- Run this in Supabase SQL Editor

ALTER TABLE shared_project_workspaces
  ADD COLUMN IF NOT EXISTS knowledge_base TEXT DEFAULT '';
