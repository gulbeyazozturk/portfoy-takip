-- Örnek app_usage_sessions (test). Service role / SQL Editor.
-- Portföyü olan en fazla 8 kullanıcıya bugün + dün sahte oturum ekler.

with users as (
  select distinct user_id
  from public.portfolios
  where user_id is not null
  limit 8
),
slots as (
  select
    u.user_id,
    (date_trunc('day', now() at time zone 'Europe/Istanbul') at time zone 'Europe/Istanbul')
      + (h || ' hours')::interval as started_at,
    (array[120, 240, 360, 480, 720])[1 + (abs(hashtext(u.user_id::text || h::text)) % 5)] as duration_seconds,
    case when abs(hashtext(u.user_id::text)) % 3 = 0 then 'android' else 'ios' end as platform
  from users u
  cross join generate_series(8, 11) as h
  union all
  select
    u.user_id,
    (date_trunc('day', now() at time zone 'Europe/Istanbul') at time zone 'Europe/Istanbul')
      - interval '1 day'
      + (h || ' hours')::interval,
    (array[90, 180, 300, 450])[1 + (abs(hashtext(u.user_id::text || 'd' || h::text)) % 4)],
    'ios'
  from users u
  cross join generate_series(19, 22) as h
)
insert into public.app_usage_sessions (user_id, started_at, ended_at, duration_seconds, platform)
select
  user_id,
  started_at,
  started_at + (duration_seconds || ' seconds')::interval,
  duration_seconds,
  platform
from slots;

-- Temizlik: delete from public.app_usage_sessions where created_at > now() - interval '2 hours';
