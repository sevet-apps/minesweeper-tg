begin;

create table if not exists public.monopoly_rating (
    uid text primary key,
    points integer not null default 0 check (points >= 0),
    games integer not null default 0 check (games >= 0),
    wins integer not null default 0 check (wins >= 0),
    bankrupted integer not null default 0 check (bankrupted >= 0),
    streak integer not null default 0 check (streak >= 0),
    banned boolean not null default false,
    checked integer not null default 0 check (checked >= 0),
    unfair_count integer not null default 0 check (unfair_count >= 0),
    history jsonb not null default '[]'::jsonb,
    updated_at timestamptz not null default now()
);

alter table public.monopoly_rating
    add column if not exists unfair_count integer not null default 0;

create index if not exists monopoly_rating_points_top_idx
    on public.monopoly_rating (points desc, updated_at asc)
    where banned = false and games > 0;

alter table public.monopoly_rating enable row level security;
revoke all on table public.monopoly_rating from anon, authenticated;
grant all on table public.monopoly_rating to service_role;

commit;
