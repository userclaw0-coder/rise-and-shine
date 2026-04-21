-- Ensure the idea_status enum contains every stage the Ideas kanban
-- uses: new, shaping, promoted, archived. Safe to re-run.
-- Postgres ADD VALUE IF NOT EXISTS requires Postgres 9.6+.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'idea_status') then
    create type idea_status as enum ('new', 'shaping', 'promoted', 'archived');
  end if;
end $$;

alter type idea_status add value if not exists 'new';
alter type idea_status add value if not exists 'shaping';
alter type idea_status add value if not exists 'promoted';
alter type idea_status add value if not exists 'archived';
