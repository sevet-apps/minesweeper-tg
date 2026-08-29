begin;

create table if not exists public.player_title_progress (
    telegram_id text primary key,
    progress jsonb not null default '{}'::jsonb,
    selected_title_id text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.player_titles (
    telegram_id text not null,
    title_id text not null,
    unlocked_at timestamptz not null default now(),
    seen_at timestamptz,
    primary key (telegram_id, title_id)
);

alter table public.player_title_progress enable row level security;
alter table public.player_titles enable row level security;

-- Titles are written and read only by the backend service role.  The Web App
-- never receives a Supabase credential that can mutate another player's
-- progress or mark rewards as seen.
revoke all on table public.player_title_progress from anon, authenticated;
revoke all on table public.player_titles from anon, authenticated;

create index if not exists player_titles_title_id_idx
    on public.player_titles (title_id);
create index if not exists player_titles_unseen_idx
    on public.player_titles (telegram_id, unlocked_at)
    where seen_at is null;

create or replace view public.player_title_holder_counts
with (security_invoker = false)
as
select title_id, count(*)::bigint as holder_count
from public.player_titles
group by title_id;

revoke all on table public.player_title_holder_counts from anon, authenticated;

comment on table public.player_title_progress is
    'Server-owned counters used to evaluate Spark titles and the selected profile title.';
comment on table public.player_titles is
    'Immutable, idempotent title unlocks. seen_at drives the reward animation queue.';

commit;
