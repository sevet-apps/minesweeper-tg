-- Fix duplicate exchanges: the previous function returned a column named
-- `quantity`, which made an unqualified `quantity = quantity - 1` ambiguous
-- inside PL/pgSQL. Keep the transaction atomic and qualify every column.
create or replace function public.monopoly_exchange_duplicate(
    p_telegram_id text, p_skin_id text, p_coins integer)
returns table(quantity integer, coins_balance integer)
language plpgsql security definer set search_path = public
as $$
declare
    v_qty integer;
begin
    if p_coins <= 0 or p_coins > 100000 then
        raise exception 'invalid_exchange_value';
    end if;

    select inv.quantity
      into v_qty
      from public.monopoly_skin_inventory as inv
     where inv.telegram_id = p_telegram_id
       and inv.skin_id = p_skin_id
     for update;

    if coalesce(v_qty, 0) <= 1 then
        raise exception 'no_duplicate';
    end if;

    update public.monopoly_skin_inventory as inv
       set quantity = inv.quantity - 1,
           updated_at = now()
     where inv.telegram_id = p_telegram_id
       and inv.skin_id = p_skin_id
     returning inv.quantity into v_qty;

    insert into public.monopoly_collectible_accounts as account (telegram_id, coins)
    values (p_telegram_id, p_coins)
    on conflict (telegram_id) do update
       set coins = account.coins + excluded.coins,
           updated_at = now();

    insert into public.monopoly_skin_exchanges (telegram_id, skin_id, coins)
    values (p_telegram_id, p_skin_id, p_coins);

    return query
    select v_qty, account.coins
      from public.monopoly_collectible_accounts as account
     where account.telegram_id = p_telegram_id;
end;
$$;

revoke all on function public.monopoly_exchange_duplicate(text, text, integer) from public, anon, authenticated;
grant execute on function public.monopoly_exchange_duplicate(text, text, integer) to service_role;
