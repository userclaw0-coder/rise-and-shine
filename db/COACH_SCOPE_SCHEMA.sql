-- Add a `scope` column to chat_messages so per-page coach drawer
-- conversations live alongside Jarvis's main thread. NULL scope == Jarvis.
-- Safe to re-run.

alter table public.chat_messages
  add column if not exists scope text;

create index if not exists idx_chat_messages_user_scope
  on public.chat_messages (user_id, scope, created_at desc);

comment on column public.chat_messages.scope is
  'Page-coach scope (today, hits, project, etc.). NULL = Jarvis system-wide chat.';
