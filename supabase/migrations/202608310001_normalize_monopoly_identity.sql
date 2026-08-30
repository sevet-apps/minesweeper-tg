begin;

-- Live Monopoly rooms historically use `tg<telegram_id>`.  Shared Spark
-- profiles use the numeric Telegram id.  Merge, never sum, the duplicated
-- rows: a legacy and a canonical row often describe the same match history.
insert into public.monopoly_rating (
    uid, points, games, wins, bankrupted, streak, banned, checked,
    unfair_count, history, updated_at
)
select
    substring(uid from 3), points, games, wins, bankrupted, streak, banned,
    checked, unfair_count, history, updated_at
from public.monopoly_rating
where uid ~ '^tg[0-9]+$'
on conflict (uid) do update set
    points = greatest(public.monopoly_rating.points, excluded.points),
    games = greatest(public.monopoly_rating.games, excluded.games),
    wins = greatest(public.monopoly_rating.wins, excluded.wins),
    bankrupted = greatest(public.monopoly_rating.bankrupted, excluded.bankrupted),
    streak = greatest(public.monopoly_rating.streak, excluded.streak),
    banned = public.monopoly_rating.banned or excluded.banned,
    checked = greatest(public.monopoly_rating.checked, excluded.checked),
    unfair_count = greatest(public.monopoly_rating.unfair_count, excluded.unfair_count),
    history = case
        when jsonb_array_length(excluded.history) > jsonb_array_length(public.monopoly_rating.history)
            then excluded.history
        else public.monopoly_rating.history
    end,
    updated_at = greatest(public.monopoly_rating.updated_at, excluded.updated_at);

delete from public.monopoly_rating where uid ~ '^tg[0-9]+$';

-- Preserve every unlocked title and whether its presentation was already
-- viewed before removing the legacy prefix.
insert into public.player_titles (telegram_id, title_id, unlocked_at, seen_at)
select substring(telegram_id from 3), title_id, unlocked_at, seen_at
from public.player_titles
where telegram_id ~ '^tg[0-9]+$'
on conflict (telegram_id, title_id) do update set
    unlocked_at = least(public.player_titles.unlocked_at, excluded.unlocked_at),
    seen_at = coalesce(public.player_titles.seen_at, excluded.seen_at);

delete from public.player_titles where telegram_id ~ '^tg[0-9]+$';

-- Merge legacy Monopoly counters into an existing shared progress record.
-- The canonical record wins on overlapping keys; Monopoly-only keys from the
-- legacy record remain intact.
update public.player_title_progress as canonical
set
    progress = legacy.progress || canonical.progress,
    selected_title_id = coalesce(canonical.selected_title_id, legacy.selected_title_id),
    created_at = least(canonical.created_at, legacy.created_at),
    updated_at = greatest(canonical.updated_at, legacy.updated_at)
from public.player_title_progress as legacy
where legacy.telegram_id ~ '^tg[0-9]+$'
  and canonical.telegram_id = substring(legacy.telegram_id from 3);

delete from public.player_title_progress as legacy
where legacy.telegram_id ~ '^tg[0-9]+$'
  and exists (
      select 1 from public.player_title_progress as canonical
      where canonical.telegram_id = substring(legacy.telegram_id from 3)
  );

update public.player_title_progress
set telegram_id = substring(telegram_id from 3)
where telegram_id ~ '^tg[0-9]+$';

create index if not exists monopoly_rating_wins_top_idx
    on public.monopoly_rating (wins desc, updated_at asc)
    where banned = false and games > 0 and wins > 0;

commit;
