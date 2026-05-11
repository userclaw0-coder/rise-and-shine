-- RLS_OWNER_POLICIES.sql
-- Enable Row Level Security and add owner-only policies on 7 tables that
-- were previously fully exposed to the public anon key.
--
-- Tables covered (all currently RLS-disabled):
--   chat_messages              private Jarvis conversation transcripts (265 rows)
--   shared_project_workspaces  project mantra, narrative, KB, suggested moves (12 rows)
--   project_memberships        who can access which project (21 rows)
--   task_assignments           who is assigned to what (0 rows; pre-built)
--   jarvis_session_summaries   Jarvis cross-session memory (0 rows; pre-built)
--   external_ai_import_runs    imported AI planning outputs (8 rows)
--   weekly_improvement_runs    weekly coach run history (2 rows)
--
-- Why this is safe:
-- - All pages/api/* routes use SUPABASE_SERVICE_ROLE_KEY; service role bypasses RLS.
-- - Client-side reads use the anon key with the authenticated user's JWT, so
--   auth.uid() resolves to the signed-in user and these owner-only policies
--   allow access. Verified call sites in pages/backlog.js, pages/projects.js,
--   and lib/projectCollaboration.js.
-- - Idempotent: every policy uses DROP IF EXISTS before CREATE.
--
-- Rollback at bottom of file if anything breaks.

begin;

-- ===========================================================================
-- chat_messages
-- ===========================================================================
alter table public.chat_messages enable row level security;

drop policy if exists chat_messages_select_own on public.chat_messages;
create policy chat_messages_select_own on public.chat_messages
  for select using (auth.uid() = user_id);

drop policy if exists chat_messages_insert_own on public.chat_messages;
create policy chat_messages_insert_own on public.chat_messages
  for insert with check (auth.uid() = user_id);

drop policy if exists chat_messages_update_own on public.chat_messages;
create policy chat_messages_update_own on public.chat_messages
  for update using (auth.uid() = user_id);

drop policy if exists chat_messages_delete_own on public.chat_messages;
create policy chat_messages_delete_own on public.chat_messages
  for delete using (auth.uid() = user_id);

-- ===========================================================================
-- shared_project_workspaces  (note: owner_user_id, not user_id)
-- ===========================================================================
alter table public.shared_project_workspaces enable row level security;

drop policy if exists spw_select_owner on public.shared_project_workspaces;
create policy spw_select_owner on public.shared_project_workspaces
  for select using (auth.uid() = owner_user_id);

drop policy if exists spw_insert_owner on public.shared_project_workspaces;
create policy spw_insert_owner on public.shared_project_workspaces
  for insert with check (auth.uid() = owner_user_id);

drop policy if exists spw_update_owner on public.shared_project_workspaces;
create policy spw_update_owner on public.shared_project_workspaces
  for update using (auth.uid() = owner_user_id);

drop policy if exists spw_delete_owner on public.shared_project_workspaces;
create policy spw_delete_owner on public.shared_project_workspaces
  for delete using (auth.uid() = owner_user_id);

-- Future-friendly: members can SELECT via project_memberships join.
-- Commented out for v1 (single-user phase). Uncomment when multi-user lands.
-- drop policy if exists spw_select_member on public.shared_project_workspaces;
-- create policy spw_select_member on public.shared_project_workspaces
--   for select using (
--     exists (
--       select 1 from public.project_memberships pm
--       where pm.category_id = shared_project_workspaces.category_id
--         and pm.user_id = auth.uid()
--     )
--   );

-- ===========================================================================
-- project_memberships
--   - You can see / manage rows that name you OR that you created (added_by).
--   - INSERT must set added_by = auth.uid() (you can only invite as yourself).
-- ===========================================================================
alter table public.project_memberships enable row level security;

drop policy if exists pm_select_own_or_added on public.project_memberships;
create policy pm_select_own_or_added on public.project_memberships
  for select using (auth.uid() = user_id or auth.uid() = added_by);

drop policy if exists pm_insert_self_as_inviter on public.project_memberships;
create policy pm_insert_self_as_inviter on public.project_memberships
  for insert with check (auth.uid() = added_by);

drop policy if exists pm_update_own_or_added on public.project_memberships;
create policy pm_update_own_or_added on public.project_memberships
  for update using (auth.uid() = user_id or auth.uid() = added_by);

drop policy if exists pm_delete_own_or_added on public.project_memberships;
create policy pm_delete_own_or_added on public.project_memberships
  for delete using (auth.uid() = user_id or auth.uid() = added_by);

-- ===========================================================================
-- task_assignments
-- ===========================================================================
alter table public.task_assignments enable row level security;

drop policy if exists ta_select_own_or_assigner on public.task_assignments;
create policy ta_select_own_or_assigner on public.task_assignments
  for select using (auth.uid() = user_id or auth.uid() = assigned_by);

drop policy if exists ta_insert_self_as_assigner on public.task_assignments;
create policy ta_insert_self_as_assigner on public.task_assignments
  for insert with check (auth.uid() = assigned_by);

drop policy if exists ta_update_assigner on public.task_assignments;
create policy ta_update_assigner on public.task_assignments
  for update using (auth.uid() = assigned_by);

drop policy if exists ta_delete_assigner on public.task_assignments;
create policy ta_delete_assigner on public.task_assignments
  for delete using (auth.uid() = assigned_by);

-- ===========================================================================
-- jarvis_session_summaries
-- ===========================================================================
alter table public.jarvis_session_summaries enable row level security;

drop policy if exists jss_select_own on public.jarvis_session_summaries;
create policy jss_select_own on public.jarvis_session_summaries
  for select using (auth.uid() = user_id);

drop policy if exists jss_insert_own on public.jarvis_session_summaries;
create policy jss_insert_own on public.jarvis_session_summaries
  for insert with check (auth.uid() = user_id);

drop policy if exists jss_update_own on public.jarvis_session_summaries;
create policy jss_update_own on public.jarvis_session_summaries
  for update using (auth.uid() = user_id);

drop policy if exists jss_delete_own on public.jarvis_session_summaries;
create policy jss_delete_own on public.jarvis_session_summaries
  for delete using (auth.uid() = user_id);

-- ===========================================================================
-- external_ai_import_runs
-- ===========================================================================
alter table public.external_ai_import_runs enable row level security;

drop policy if exists eair_select_own on public.external_ai_import_runs;
create policy eair_select_own on public.external_ai_import_runs
  for select using (auth.uid() = user_id);

drop policy if exists eair_insert_own on public.external_ai_import_runs;
create policy eair_insert_own on public.external_ai_import_runs
  for insert with check (auth.uid() = user_id);

drop policy if exists eair_update_own on public.external_ai_import_runs;
create policy eair_update_own on public.external_ai_import_runs
  for update using (auth.uid() = user_id);

drop policy if exists eair_delete_own on public.external_ai_import_runs;
create policy eair_delete_own on public.external_ai_import_runs
  for delete using (auth.uid() = user_id);

-- ===========================================================================
-- weekly_improvement_runs
-- ===========================================================================
alter table public.weekly_improvement_runs enable row level security;

drop policy if exists wir_select_own on public.weekly_improvement_runs;
create policy wir_select_own on public.weekly_improvement_runs
  for select using (auth.uid() = user_id);

drop policy if exists wir_insert_own on public.weekly_improvement_runs;
create policy wir_insert_own on public.weekly_improvement_runs
  for insert with check (auth.uid() = user_id);

drop policy if exists wir_update_own on public.weekly_improvement_runs;
create policy wir_update_own on public.weekly_improvement_runs
  for update using (auth.uid() = user_id);

drop policy if exists wir_delete_own on public.weekly_improvement_runs;
create policy wir_delete_own on public.weekly_improvement_runs
  for delete using (auth.uid() = user_id);

commit;

-- ===========================================================================
-- ROLLBACK
-- If anything breaks, run this block in Supabase SQL Editor to fully revert:
-- ===========================================================================
-- begin;
-- alter table public.chat_messages              disable row level security;
-- alter table public.shared_project_workspaces  disable row level security;
-- alter table public.project_memberships        disable row level security;
-- alter table public.task_assignments           disable row level security;
-- alter table public.jarvis_session_summaries   disable row level security;
-- alter table public.external_ai_import_runs    disable row level security;
-- alter table public.weekly_improvement_runs    disable row level security;
-- commit;
