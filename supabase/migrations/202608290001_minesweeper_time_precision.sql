-- Minesweeper records are measured to the millisecond. The original integer
-- columns rounded every accepted result, so a 7-second value was later shown
-- as the artificial-looking 7.000 and faster fractional records could fail.
alter table public.users
  alter column saper_best_6 type numeric(10, 3) using saper_best_6::numeric,
  alter column saper_best_8 type numeric(10, 3) using saper_best_8::numeric,
  alter column saper_best_10 type numeric(10, 3) using saper_best_10::numeric,
  alter column saper_best_15 type numeric(10, 3) using saper_best_15::numeric;
