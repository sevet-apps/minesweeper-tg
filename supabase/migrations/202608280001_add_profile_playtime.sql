begin;

alter table public.users
    add column if not exists playtime_bb_ms bigint not null default 0 check (playtime_bb_ms >= 0),
    add column if not exists playtime_saper_ms bigint not null default 0 check (playtime_saper_ms >= 0),
    add column if not exists playtime_tower_ms bigint not null default 0 check (playtime_tower_ms >= 0),
    add column if not exists playtime_sudoku_ms bigint not null default 0 check (playtime_sudoku_ms >= 0),
    add column if not exists playtime_checkers_ms bigint not null default 0 check (playtime_checkers_ms >= 0),
    add column if not exists playtime_wordle_ms bigint not null default 0 check (playtime_wordle_ms >= 0),
    add column if not exists playtime_monopoly_ms bigint not null default 0 check (playtime_monopoly_ms >= 0);

-- Preserve totals accepted by the compatibility path before this migration
-- reaches production. Each activity row contains an idempotent absolute value.
with activity_totals as (
    select
        telegram_id,
        max(split_part(activity_type, ':', 3)::bigint) filter (where split_part(activity_type, ':', 2) = 'bb') as bb,
        max(split_part(activity_type, ':', 3)::bigint) filter (where split_part(activity_type, ':', 2) = 'saper') as saper,
        max(split_part(activity_type, ':', 3)::bigint) filter (where split_part(activity_type, ':', 2) = 'tower') as tower,
        max(split_part(activity_type, ':', 3)::bigint) filter (where split_part(activity_type, ':', 2) = 'sudoku') as sudoku,
        max(split_part(activity_type, ':', 3)::bigint) filter (where split_part(activity_type, ':', 2) = 'checkers') as checkers,
        max(split_part(activity_type, ':', 3)::bigint) filter (where split_part(activity_type, ':', 2) = 'wordle') as wordle,
        max(split_part(activity_type, ':', 3)::bigint) filter (where split_part(activity_type, ':', 2) = 'monopoly') as monopoly
    from public.user_activity
    where activity_type ~ '^playtime:(bb|saper|tower|sudoku|checkers|wordle|monopoly):[0-9]+$'
    group by telegram_id
)
update public.users as users
set
    playtime_bb_ms = greatest(users.playtime_bb_ms, coalesce(totals.bb, 0)),
    playtime_saper_ms = greatest(users.playtime_saper_ms, coalesce(totals.saper, 0)),
    playtime_tower_ms = greatest(users.playtime_tower_ms, coalesce(totals.tower, 0)),
    playtime_sudoku_ms = greatest(users.playtime_sudoku_ms, coalesce(totals.sudoku, 0)),
    playtime_checkers_ms = greatest(users.playtime_checkers_ms, coalesce(totals.checkers, 0)),
    playtime_wordle_ms = greatest(users.playtime_wordle_ms, coalesce(totals.wordle, 0)),
    playtime_monopoly_ms = greatest(users.playtime_monopoly_ms, coalesce(totals.monopoly, 0))
from activity_totals as totals
where users.telegram_id = totals.telegram_id;

comment on column public.users.playtime_bb_ms is 'Cumulative Block Blast playtime in milliseconds';
comment on column public.users.playtime_saper_ms is 'Cumulative Minesweeper playtime in milliseconds';
comment on column public.users.playtime_tower_ms is 'Cumulative Tower playtime in milliseconds';
comment on column public.users.playtime_sudoku_ms is 'Cumulative Sudoku playtime in milliseconds';
comment on column public.users.playtime_checkers_ms is 'Cumulative Checkers playtime in milliseconds';
comment on column public.users.playtime_wordle_ms is 'Cumulative Wordle playtime in milliseconds';
comment on column public.users.playtime_monopoly_ms is 'Cumulative Monopoly playtime in milliseconds';

commit;
