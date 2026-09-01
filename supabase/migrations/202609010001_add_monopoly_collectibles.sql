-- Monopoly collectible companies, universal cases and duplicate currency.
-- All mutations are service-role RPCs. The Mini App never writes inventory directly.

create extension if not exists pgcrypto;

create table if not exists public.monopoly_collectible_accounts (
    telegram_id text primary key,
    cases_count integer not null default 0 check (cases_count >= 0),
    coins integer not null default 0 check (coins >= 0),
    rating_milestones integer not null default 0 check (rating_milestones >= 0),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.monopoly_skin_inventory (
    telegram_id text not null,
    skin_id text not null,
    quantity integer not null default 1 check (quantity >= 1),
    first_acquired_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    primary key (telegram_id, skin_id)
);

create table if not exists public.monopoly_skin_loadout (
    telegram_id text not null,
    tile_id integer not null check (tile_id between 0 and 39),
    skin_id text not null,
    group_id text not null,
    updated_at timestamptz not null default now(),
    primary key (telegram_id, tile_id),
    unique (telegram_id, skin_id)
);

create table if not exists public.monopoly_case_openings (
    id uuid primary key default gen_random_uuid(),
    telegram_id text not null,
    skin_id text not null,
    rarity text not null check (rarity in ('common', 'rare', 'epic', 'mythic')),
    opened_at timestamptz not null default now(),
    claimed_at timestamptz
);
create index if not exists monopoly_case_openings_user_idx
    on public.monopoly_case_openings (telegram_id, opened_at desc);

create table if not exists public.monopoly_case_grants (
    id uuid primary key default gen_random_uuid(),
    telegram_id text not null,
    amount integer not null check (amount > 0),
    source text not null,
    source_key text not null unique,
    reason text,
    admin_id text,
    created_at timestamptz not null default now()
);

create table if not exists public.monopoly_skin_exchanges (
    id uuid primary key default gen_random_uuid(),
    telegram_id text not null,
    skin_id text not null,
    coins integer not null check (coins > 0),
    created_at timestamptz not null default now()
);

alter table public.monopoly_collectible_accounts enable row level security;
alter table public.monopoly_skin_inventory enable row level security;
alter table public.monopoly_skin_loadout enable row level security;
alter table public.monopoly_case_openings enable row level security;
alter table public.monopoly_case_grants enable row level security;
alter table public.monopoly_skin_exchanges enable row level security;

revoke all on public.monopoly_collectible_accounts from anon, authenticated;
revoke all on public.monopoly_skin_inventory from anon, authenticated;
revoke all on public.monopoly_skin_loadout from anon, authenticated;
revoke all on public.monopoly_case_openings from anon, authenticated;
revoke all on public.monopoly_case_grants from anon, authenticated;
revoke all on public.monopoly_skin_exchanges from anon, authenticated;

create or replace function public.monopoly_sync_rating_cases(p_telegram_id text)
returns table(cases_granted integer, cases_balance integer, milestones integer)
language plpgsql security definer set search_path = public
as $$
declare
    v_points integer := 0;
    v_target integer := 0;
    v_current integer := 0;
    v_delta integer := 0;
begin
    insert into monopoly_collectible_accounts(telegram_id)
    values (p_telegram_id) on conflict (telegram_id) do nothing;

    select coalesce(points, 0) into v_points
      from monopoly_rating where uid = p_telegram_id;
    v_target := greatest(0, floor(coalesce(v_points, 0) / 50.0)::integer);

    select rating_milestones into v_current
      from monopoly_collectible_accounts
      where telegram_id = p_telegram_id for update;
    v_delta := greatest(0, v_target - v_current);

    update monopoly_collectible_accounts
       set cases_count = cases_count + v_delta,
           rating_milestones = greatest(rating_milestones, v_target),
           updated_at = now()
     where telegram_id = p_telegram_id;

    if v_delta > 0 then
        insert into monopoly_case_grants(telegram_id, amount, source, source_key, reason)
        values (p_telegram_id, v_delta, 'rating', 'rating:' || p_telegram_id || ':' || v_target,
                'Ретроактивные и новые рубежи рейтинга по 50 очков')
        on conflict (source_key) do nothing;
    end if;

    return query select v_delta, a.cases_count, a.rating_milestones
      from monopoly_collectible_accounts a where a.telegram_id = p_telegram_id;
end;
$$;

create or replace function public.monopoly_grant_cases(
    p_telegram_id text, p_amount integer, p_source text,
    p_source_key text, p_reason text default null, p_admin_id text default null)
returns table(granted integer, cases_balance integer)
language plpgsql security definer set search_path = public
as $$
declare v_inserted integer := 0;
begin
    if p_amount <= 0 or p_amount > 10000 then raise exception 'invalid_case_amount'; end if;
    insert into monopoly_case_grants(telegram_id, amount, source, source_key, reason, admin_id)
    values (p_telegram_id, p_amount, p_source, p_source_key, p_reason, p_admin_id)
    on conflict (source_key) do nothing;
    get diagnostics v_inserted = row_count;

    insert into monopoly_collectible_accounts(telegram_id, cases_count)
    values (p_telegram_id, case when v_inserted = 1 then p_amount else 0 end)
    on conflict (telegram_id) do update
       set cases_count = monopoly_collectible_accounts.cases_count
                         + case when v_inserted = 1 then p_amount else 0 end,
           updated_at = now();
    return query select case when v_inserted = 1 then p_amount else 0 end, a.cases_count
      from monopoly_collectible_accounts a where a.telegram_id = p_telegram_id;
end;
$$;

create or replace function public.monopoly_open_case(
    p_telegram_id text, p_skin_id text, p_rarity text)
returns table(opening_id uuid, quantity integer, cases_balance integer)
language plpgsql security definer set search_path = public
as $$
declare v_opening uuid; v_qty integer;
begin
    if p_rarity not in ('common', 'rare', 'epic', 'mythic') then raise exception 'invalid_rarity'; end if;
    insert into monopoly_collectible_accounts(telegram_id)
    values (p_telegram_id) on conflict (telegram_id) do nothing;
    perform 1 from monopoly_collectible_accounts where telegram_id = p_telegram_id for update;
    -- The account row lock serializes case openings for one player. Until the
    -- previous result is acknowledged, the same case must never be spent twice.
    if exists(select 1 from monopoly_case_openings
              where telegram_id = p_telegram_id and claimed_at is null)
       then raise exception 'pending_opening'; end if;
    if (select cases_count from monopoly_collectible_accounts where telegram_id = p_telegram_id) < 1
       then raise exception 'no_cases'; end if;

    update monopoly_collectible_accounts
       set cases_count = cases_count - 1, updated_at = now()
     where telegram_id = p_telegram_id;
    insert into monopoly_skin_inventory(telegram_id, skin_id, quantity)
    values (p_telegram_id, p_skin_id, 1)
    on conflict (telegram_id, skin_id) do update
       set quantity = monopoly_skin_inventory.quantity + 1, updated_at = now()
    returning monopoly_skin_inventory.quantity into v_qty;
    insert into monopoly_case_openings(telegram_id, skin_id, rarity)
    values (p_telegram_id, p_skin_id, p_rarity) returning id into v_opening;

    return query select v_opening, v_qty, a.cases_count
      from monopoly_collectible_accounts a where a.telegram_id = p_telegram_id;
end;
$$;

create or replace function public.monopoly_claim_opening(p_telegram_id text, p_opening_id uuid)
returns boolean language plpgsql security definer set search_path = public
as $$
begin
    update monopoly_case_openings set claimed_at = coalesce(claimed_at, now())
     where id = p_opening_id and telegram_id = p_telegram_id;
    return found;
end;
$$;

create or replace function public.monopoly_equip_skin(
    p_telegram_id text, p_skin_id text, p_tile_id integer, p_group_id text)
returns boolean language plpgsql security definer set search_path = public
as $$
begin
    if not exists(select 1 from monopoly_skin_inventory
                  where telegram_id = p_telegram_id and skin_id = p_skin_id and quantity > 0)
       then raise exception 'skin_not_owned'; end if;
    delete from monopoly_skin_loadout
     where telegram_id = p_telegram_id and (tile_id = p_tile_id or skin_id = p_skin_id);
    insert into monopoly_skin_loadout(telegram_id, tile_id, skin_id, group_id)
    values (p_telegram_id, p_tile_id, p_skin_id, p_group_id);
    return true;
end;
$$;

create or replace function public.monopoly_unequip_skin(p_telegram_id text, p_tile_id integer)
returns boolean language plpgsql security definer set search_path = public
as $$
begin
    delete from monopoly_skin_loadout where telegram_id = p_telegram_id and tile_id = p_tile_id;
    return found;
end;
$$;

create or replace function public.monopoly_exchange_duplicate(
    p_telegram_id text, p_skin_id text, p_coins integer)
returns table(quantity integer, coins_balance integer)
language plpgsql security definer set search_path = public
as $$
declare v_qty integer;
begin
    if p_coins <= 0 or p_coins > 100000 then raise exception 'invalid_exchange_value'; end if;
    select i.quantity into v_qty from monopoly_skin_inventory i
     where i.telegram_id = p_telegram_id and i.skin_id = p_skin_id for update;
    if coalesce(v_qty, 0) <= 1 then raise exception 'no_duplicate'; end if;
    update monopoly_skin_inventory set quantity = quantity - 1, updated_at = now()
     where telegram_id = p_telegram_id and skin_id = p_skin_id returning monopoly_skin_inventory.quantity into v_qty;
    insert into monopoly_collectible_accounts(telegram_id, coins)
    values (p_telegram_id, p_coins)
    on conflict (telegram_id) do update
       set coins = monopoly_collectible_accounts.coins + p_coins, updated_at = now();
    insert into monopoly_skin_exchanges(telegram_id, skin_id, coins)
    values (p_telegram_id, p_skin_id, p_coins);
    return query select v_qty, a.coins from monopoly_collectible_accounts a
      where a.telegram_id = p_telegram_id;
end;
$$;

revoke all on function public.monopoly_sync_rating_cases(text) from public, anon, authenticated;
revoke all on function public.monopoly_grant_cases(text, integer, text, text, text, text) from public, anon, authenticated;
revoke all on function public.monopoly_open_case(text, text, text) from public, anon, authenticated;
revoke all on function public.monopoly_claim_opening(text, uuid) from public, anon, authenticated;
revoke all on function public.monopoly_equip_skin(text, text, integer, text) from public, anon, authenticated;
revoke all on function public.monopoly_unequip_skin(text, integer) from public, anon, authenticated;
revoke all on function public.monopoly_exchange_duplicate(text, text, integer) from public, anon, authenticated;

grant execute on function public.monopoly_sync_rating_cases(text) to service_role;
grant execute on function public.monopoly_grant_cases(text, integer, text, text, text, text) to service_role;
grant execute on function public.monopoly_open_case(text, text, text) to service_role;
grant execute on function public.monopoly_claim_opening(text, uuid) to service_role;
grant execute on function public.monopoly_equip_skin(text, text, integer, text) to service_role;
grant execute on function public.monopoly_unequip_skin(text, integer) to service_role;
grant execute on function public.monopoly_exchange_duplicate(text, text, integer) to service_role;
