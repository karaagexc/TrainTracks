-- Narrow incremental repair. Requires the existing secured TrainTracks schema.
-- Review in an isolated database first. This does not change maintenance flags,
-- user_roles, profile grants, existing records, or token authority.
begin;

alter table public.app_config add column if not exists congestion_config jsonb not null default '{}'::jsonb;
alter table public.app_config add column if not exists api_config jsonb not null default '{
  "version":1,
  "prediction":{"defaultLimit":3,"validWindowS":25,"stationLookaheadMin":45},
  "corsOrigin":"*",
  "crowd":{"intervalMs":3000,"minSpeedKph":5,"requiredSamples":2},
  "stall":{"sampleIntervalMs":30000,"thresholdKm":0.1,"windowSamples":14,"activationDistKm":0.2,
    "deviceCooldownMs":300000,"maxStationDistKm":1.5,"maxReportsPerHour":6,"minDurationMin":3}
}'::jsonb;
alter table public.app_config add column if not exists public_api_enabled boolean not null default true;

grant select (congestion_config, api_config, public_api_enabled) on public.app_config to anon, authenticated;
-- Existing UPDATE authority remains the user_roles-backed current_user_is_admin policy.

create or replace function public.traintracks_server_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
    new.updated_at := now();
    return new;
end;
$$;

drop trigger if exists traintracks_config_updated_at on public.app_config;
create trigger traintracks_config_updated_at before insert or update on public.app_config
for each row execute function public.traintracks_server_updated_at();
drop trigger if exists traintracks_profile_updated_at on public.profiles;
create trigger traintracks_profile_updated_at before insert or update on public.profiles
for each row execute function public.traintracks_server_updated_at();
drop trigger if exists traintracks_private_updated_at on public.profile_private;
create trigger traintracks_private_updated_at before insert or update on public.profile_private
for each row execute function public.traintracks_server_updated_at();
drop trigger if exists traintracks_token_updated_at on public.api_tokens;
create trigger traintracks_token_updated_at before insert or update on public.api_tokens
for each row execute function public.traintracks_server_updated_at();

create or replace function public.trip_history_totals()
returns table (total_trips bigint, total_fare numeric, total_distance numeric)
language sql stable security invoker set search_path = public as $$
    select count(*), coalesce(sum(fare), 0)::numeric, coalesce(sum(distance_km), 0)::numeric
    from public.trip_history where user_id = auth.uid();
$$;
-- PUBLIC and explicit/default anon grants are independent. CREATE OR REPLACE
-- preserves existing ACLs, so revoke both on every application of this repair.
revoke all on function public.trip_history_totals() from public, anon;
grant execute on function public.trip_history_totals() to authenticated;

commit;
