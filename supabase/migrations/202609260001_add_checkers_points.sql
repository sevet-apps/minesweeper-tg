begin;

alter table public.users
    add column if not exists checkers_points integer not null default 0
        check (checkers_points >= 0);

create index if not exists users_checkers_points_top_idx
    on public.users (checkers_points desc)
    where checkers_points > 0;

commit;
