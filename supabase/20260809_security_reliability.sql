-- TrainTracks production trust and durability migration.
-- Apply once in the Supabase SQL editor before enabling the matching server routes.

begin;

alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists phone text;
alter table public.profiles add column if not exists is_admin boolean not null default false;
alter table public.profiles add column if not exists has_password boolean not null default false;

create table if not exists public.profile_private (
    user_id uuid primary key references auth.users(id) on delete cascade,
    email text,
    phone text,
    has_password boolean not null default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

insert into public.profile_private (user_id, email, phone, has_password)
select id, email, phone, coalesce(has_password, false)
from public.profiles
on conflict (user_id) do update
set email = coalesce(excluded.email, profile_private.email),
    phone = coalesce(excluded.phone, profile_private.phone),
    has_password = profile_private.has_password or excluded.has_password,
    updated_at = now();

create table if not exists public.user_roles (
    user_id uuid primary key references auth.users(id) on delete cascade,
    role text not null default 'commuter' check (role in ('commuter', 'admin')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

insert into public.user_roles (user_id, role)
select id, case when coalesce(is_admin, false) then 'admin' else 'commuter' end
from public.profiles
on conflict (user_id) do update
set role = case
    when excluded.role = 'admin' then 'admin'
    else user_roles.role
end,
updated_at = now();

create or replace function public.current_user_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.user_roles
        where user_id = auth.uid()
          and role = 'admin'
    );
$$;

revoke all on function public.current_user_is_admin() from public;
grant execute on function public.current_user_is_admin() to authenticated, service_role;

alter table public.profiles enable row level security;
alter table public.profile_private enable row level security;
alter table public.user_roles enable row level security;

drop policy if exists "Public profiles are viewable by everyone" on public.profiles;
drop policy if exists "Users can read own profile" on public.profiles;
drop policy if exists "Users can insert own profile" on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;
drop policy if exists "Admins can read all profiles" on public.profiles;

create policy profiles_public_read
on public.profiles for select
using (true);

create policy profiles_insert_own
on public.profiles for insert to authenticated
with check (auth.uid() = id);

create policy profiles_update_own
on public.profiles for update to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists profile_private_select_own on public.profile_private;
drop policy if exists profile_private_insert_own on public.profile_private;
drop policy if exists profile_private_update_own on public.profile_private;

create policy profile_private_select_own
on public.profile_private for select to authenticated
using (auth.uid() = user_id);

create policy profile_private_insert_own
on public.profile_private for insert to authenticated
with check (auth.uid() = user_id);

create policy profile_private_update_own
on public.profile_private for update to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists user_roles_select_own on public.user_roles;
create policy user_roles_select_own
on public.user_roles for select to authenticated
using (auth.uid() = user_id);

revoke all on public.profiles from anon, authenticated;
grant select (id, username, display_name, avatar_url, created_at, updated_at)
    on public.profiles to anon, authenticated;
grant insert (id, username, display_name, avatar_url)
    on public.profiles to authenticated;
grant update (username, display_name, avatar_url, updated_at)
    on public.profiles to authenticated;

revoke all on public.profile_private from anon, authenticated;
grant select, insert on public.profile_private to authenticated;
grant update (email, phone, has_password, updated_at)
    on public.profile_private to authenticated;

revoke all on public.user_roles from anon, authenticated;
grant select (user_id, role) on public.user_roles to authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.profiles (id, display_name, avatar_url)
    values (
        new.id,
        coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''),
        coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture', '')
    )
    on conflict (id) do nothing;

    insert into public.profile_private (user_id, email, phone, has_password)
    values (
        new.id,
        new.email,
        new.phone,
        coalesce(new.raw_app_meta_data->>'provider', '') = 'email'
    )
    on conflict (user_id) do update
    set email = excluded.email,
        phone = coalesce(excluded.phone, profile_private.phone),
        has_password = profile_private.has_password or excluded.has_password,
        updated_at = now();

    insert into public.user_roles (user_id, role)
    values (new.id, 'commuter')
    on conflict (user_id) do nothing;

    return new;
end;
$$;

alter table public.app_config enable row level security;
drop policy if exists "Anyone can read app_config" on public.app_config;
drop policy if exists "Anyone can update app_config" on public.app_config;
drop policy if exists "Authenticated users can update app_config" on public.app_config;
drop policy if exists app_config_public_read on public.app_config;
drop policy if exists app_config_admin_update on public.app_config;

create policy app_config_public_read
on public.app_config for select
using (true);

create policy app_config_admin_update
on public.app_config for update to authenticated
using (public.current_user_is_admin())
with check (public.current_user_is_admin());

alter table public.trip_history add column if not exists destination_line_id text;
alter table public.trip_history add column if not exists client_trip_id text;
update public.trip_history
set client_trip_id = id::text
where client_trip_id is null;
alter table public.trip_history alter column client_trip_id set not null;

create unique index if not exists trip_history_user_client_trip
on public.trip_history (user_id, client_trip_id);

drop policy if exists "Users can update own trips" on public.trip_history;
create policy "Users can update own trips"
on public.trip_history for update to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

grant update (
    destination_id,
    destination_name,
    destination_line_id,
    fare,
    distance_km,
    direction,
    duration_minutes,
    completed_at
) on public.trip_history to authenticated;

create table if not exists public.crowd_presence (
    pseudonym text primary key,
    line_id text not null check (line_id in ('LRT1', 'LRT2', 'MRT3')),
    direction text not null,
    status_code text not null,
    station_id text,
    station_name text,
    lat double precision not null,
    lng double precision not null,
    speed_kph double precision not null,
    confidence double precision not null,
    accuracy_meters double precision,
    sample_id text not null,
    broadcast_sample_id text,
    broadcast_claimed_sample_id text,
    broadcast_claimed_at timestamptz,
    updated_at timestamptz not null default now(),
    expires_at timestamptz not null
);

alter table public.crowd_presence add column if not exists broadcast_sample_id text;
alter table public.crowd_presence add column if not exists broadcast_claimed_sample_id text;
alter table public.crowd_presence add column if not exists broadcast_claimed_at timestamptz;

create unique index if not exists crowd_presence_sample_id
on public.crowd_presence (sample_id);

create table if not exists public.crowd_incidents (
    id text primary key,
    line_id text not null check (line_id in ('LRT1', 'LRT2', 'MRT3')),
    status text not null check (status in ('PENDING', 'CONFIRMED', 'RESOLVED')),
    severity text not null check (severity in ('traffic', 'emergency')),
    reason text not null,
    nearest_station_id text not null,
    nearest_station_name text not null,
    lat double precision not null,
    lng double precision not null,
    report_count integer not null default 0,
    unique_device_count integer not null default 0,
    first_reported_at timestamptz not null,
    last_reported_at timestamptz not null,
    confirmed_at timestamptz,
    resolved_at timestamptz,
    resolved_by text,
    expires_at timestamptz not null,
    updated_at timestamptz not null default now()
);

create index if not exists crowd_incidents_active_line
on public.crowd_incidents (line_id, status, last_reported_at desc);

create table if not exists public.stall_reports (
    id text primary key,
    incident_id text not null references public.crowd_incidents(id) on delete cascade,
    device_hash text not null,
    line_id text not null,
    lat double precision not null,
    lng double precision not null,
    nearest_station_id text,
    nearest_station_name text,
    nearest_station_distance_km double precision,
    severity text not null,
    reason text not null,
    message text,
    stall_duration_minutes integer not null,
    reported_at timestamptz not null
);

create index if not exists stall_reports_device_time
on public.stall_reports (device_hash, reported_at desc);

create index if not exists stall_reports_incident_time
on public.stall_reports (incident_id, reported_at desc);

create table if not exists public.incident_resolution_votes (
    incident_id text not null references public.crowd_incidents(id) on delete cascade,
    device_hash text not null,
    voted_at timestamptz not null default now(),
    primary key (incident_id, device_hash)
);

create table if not exists public.api_tokens (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    token_hash text not null unique,
    token_prefix text not null,
    scopes text[] not null default array['predictions:read']::text[],
    allowed_origins text[] not null default array[]::text[],
    is_active boolean not null default true,
    expires_at timestamptz,
    last_used_at timestamptz,
    created_by uuid references auth.users(id),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.transit_data_sources (
    id text primary key,
    source_url text not null,
    effective_date date,
    verified_at timestamptz not null,
    valid_until timestamptz,
    notes text,
    updated_at timestamptz not null default now()
);

alter table public.crowd_presence enable row level security;
alter table public.crowd_incidents enable row level security;
alter table public.stall_reports enable row level security;
alter table public.incident_resolution_votes enable row level security;
alter table public.api_tokens enable row level security;
alter table public.transit_data_sources enable row level security;

revoke all on public.crowd_presence from anon, authenticated;
revoke all on public.crowd_incidents from anon, authenticated;
revoke all on public.stall_reports from anon, authenticated;
revoke all on public.incident_resolution_votes from anon, authenticated;
revoke all on public.api_tokens from anon, authenticated;
revoke all on public.transit_data_sources from anon, authenticated;

grant all on public.crowd_presence to service_role;
grant all on public.crowd_incidents to service_role;
grant all on public.stall_reports to service_role;
grant all on public.incident_resolution_votes to service_role;
grant all on public.api_tokens to service_role;
grant all on public.transit_data_sources to service_role;

insert into public.transit_data_sources (
    id, source_url, effective_date, verified_at, valid_until, notes
) values
    (
        'lrt1-fare-2025-04-02',
        'https://lrmc.ph/2025/02/18/new-lrt-1-fares-effective-2-april-2025/',
        date '2025-04-02',
        timestamptz '2026-08-10 00:00:00+08',
        null,
        'LRT-1 base fare matrix currently used by TrainTracks.'
    ),
    (
        'lrt2-mrt3-half-fare-2026-03-23',
        'https://www.lrta.gov.ph/tickets-and-fares/',
        date '2026-03-23',
        timestamptz '2026-08-10 00:00:00+08',
        null,
        '50% LRT-2 and MRT-3 fare relief, active until further notice; verify before every release.'
    ),
    (
        'ncr-aircon-bus-fare-2026-03-18',
        'https://pia.gov.ph/news/puv-fares-adjusted-to-shield-drivers-commuters/',
        date '2026-03-18',
        timestamptz '2026-08-10 00:00:00+08',
        null,
        'Standard NCR air-conditioned bus fare: PHP 18 first 5 km plus PHP 2.98 per succeeding km.'
    ),
    (
        'service-contracting-discounts-2026',
        'https://pia.gov.ph/news/dotr-chief-reiterates-fare-discounts-under-service-contracting-program/',
        null,
        timestamptz '2026-08-10 00:00:00+08',
        null,
        'Only participating marked units: 20% regular and 40% concession discount; never assume route-wide participation.'
    ),
    (
        'traintracks-prediction-model-2026-08-10',
        'https://www.lrta.gov.ph/train-operating-schedule/',
        null,
        timestamptz '2026-08-10 00:00:00+08',
        null,
        'Schedule/headway model provenance. TrainTracks does not currently consume a real-time operator vehicle feed.'
    )
on conflict (id) do update set
    source_url = excluded.source_url,
    effective_date = excluded.effective_date,
    verified_at = excluded.verified_at,
    valid_until = excluded.valid_until,
    notes = excluded.notes,
    updated_at = now();

create or replace function public.record_crowd_presence(
    p_pseudonym text,
    p_line_id text,
    p_direction text,
    p_status_code text,
    p_station_id text,
    p_station_name text,
    p_lat double precision,
    p_lng double precision,
    p_speed_kph double precision,
    p_confidence double precision,
    p_accuracy_meters double precision,
    p_sample_id text,
    p_reported_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    previous public.crowd_presence%rowtype;
    elapsed_seconds double precision;
    moved_km double precision;
begin
    select * into previous
    from public.crowd_presence
    where pseudonym = p_pseudonym
    for update;

    if found then
        if previous.sample_id = p_sample_id then
            return jsonb_build_object(
                'ok', true,
                'duplicate', true,
                'broadcast_state_supported', true,
                'broadcasted', previous.broadcast_sample_id = p_sample_id
            );
        end if;

        elapsed_seconds := extract(epoch from (p_reported_at - previous.updated_at));
        if elapsed_seconds < 3 then
            return jsonb_build_object('ok', false, 'code', 'rate_limited');
        end if;

        moved_km := 111.32 * sqrt(
            power(p_lat - previous.lat, 2)
            + power((p_lng - previous.lng) * cos(radians((p_lat + previous.lat) / 2)), 2)
        );
        if elapsed_seconds < 120 and moved_km > greatest(0.5, elapsed_seconds * 0.06) then
            return jsonb_build_object('ok', false, 'code', 'implausible_jump');
        end if;
    end if;

    insert into public.crowd_presence (
        pseudonym, line_id, direction, status_code, station_id, station_name,
        lat, lng, speed_kph, confidence, accuracy_meters, sample_id,
        updated_at, expires_at
    ) values (
        p_pseudonym, p_line_id, p_direction, p_status_code, p_station_id, p_station_name,
        p_lat, p_lng, p_speed_kph, p_confidence, p_accuracy_meters, p_sample_id,
        p_reported_at, p_reported_at + interval '45 seconds'
    )
    on conflict (pseudonym) do update set
        line_id = excluded.line_id,
        direction = excluded.direction,
        status_code = excluded.status_code,
        station_id = excluded.station_id,
        station_name = excluded.station_name,
        lat = excluded.lat,
        lng = excluded.lng,
        speed_kph = excluded.speed_kph,
        confidence = excluded.confidence,
        accuracy_meters = excluded.accuracy_meters,
        sample_id = excluded.sample_id,
        broadcast_sample_id = null,
        broadcast_claimed_sample_id = null,
        broadcast_claimed_at = null,
        updated_at = excluded.updated_at,
        expires_at = excluded.expires_at;

    return jsonb_build_object(
        'ok', true,
        'duplicate', false,
        'broadcast_state_supported', true,
        'broadcasted', false
    );
end;
$$;

create or replace function public.claim_crowd_presence_broadcast(
    p_pseudonym text,
    p_sample_id text,
    p_claimed_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    presence public.crowd_presence%rowtype;
begin
    select * into presence
    from public.crowd_presence
    where pseudonym = p_pseudonym
    for update;

    if not found or presence.sample_id <> p_sample_id then
        return jsonb_build_object('ok', false, 'status', 'sample_not_found');
    end if;
    if presence.broadcast_sample_id = p_sample_id then
        return jsonb_build_object('ok', true, 'status', 'already_broadcasted');
    end if;
    if presence.broadcast_claimed_sample_id = p_sample_id
       and presence.broadcast_claimed_at >= p_claimed_at - interval '30 seconds' then
        return jsonb_build_object('ok', true, 'status', 'claimed_elsewhere');
    end if;

    update public.crowd_presence
    set broadcast_claimed_sample_id = p_sample_id,
        broadcast_claimed_at = p_claimed_at
    where pseudonym = p_pseudonym;

    return jsonb_build_object('ok', true, 'status', 'acquired');
end;
$$;

create or replace function public.mark_crowd_presence_broadcasted(
    p_pseudonym text,
    p_sample_id text,
    p_broadcasted_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    updated_count integer;
begin
    update public.crowd_presence
    set broadcast_sample_id = p_sample_id,
        broadcast_claimed_sample_id = null,
        broadcast_claimed_at = null
    where pseudonym = p_pseudonym
      and sample_id = p_sample_id;
    get diagnostics updated_count = row_count;

    return jsonb_build_object(
        'ok', updated_count = 1,
        'broadcasted_at', p_broadcasted_at
    );
end;
$$;

create or replace function public.release_crowd_presence_broadcast(
    p_pseudonym text,
    p_sample_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    updated_count integer;
begin
    update public.crowd_presence
    set broadcast_claimed_sample_id = null,
        broadcast_claimed_at = null
    where pseudonym = p_pseudonym
      and sample_id = p_sample_id
      and broadcast_claimed_sample_id = p_sample_id;
    get diagnostics updated_count = row_count;

    return jsonb_build_object('ok', true, 'released', updated_count = 1);
end;
$$;

create or replace function public.record_stall_report(
    p_report_id text,
    p_device_hash text,
    p_line_id text,
    p_lat double precision,
    p_lng double precision,
    p_nearest_station_id text,
    p_nearest_station_name text,
    p_nearest_station_distance_km double precision,
    p_severity text,
    p_reason text,
    p_message text,
    p_stall_duration_minutes integer,
    p_reported_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    incident public.crowd_incidents%rowtype;
    active_count integer;
    hourly_count integer;
    last_device_report timestamptz;
    inserted_count integer;
    recent_unique integer;
    event_name text;
begin
    select max(reported_at), count(*) filter (
        where reported_at >= p_reported_at - interval '1 hour'
    )
    into last_device_report, hourly_count
    from public.stall_reports
    where device_hash = p_device_hash;

    if last_device_report is not null
       and last_device_report > p_reported_at - interval '5 minutes' then
        return jsonb_build_object('ok', false, 'code', 'rate_limited');
    end if;
    if hourly_count >= 6 then
        return jsonb_build_object('ok', false, 'code', 'hourly_limit');
    end if;

    update public.crowd_incidents
    set status = 'RESOLVED',
        resolved_at = p_reported_at,
        resolved_by = 'auto_expired',
        updated_at = p_reported_at
    where status <> 'RESOLVED'
      and expires_at < p_reported_at;

    select * into incident
    from public.crowd_incidents
    where line_id = p_line_id
      and status <> 'RESOLVED'
      and 111.32 * sqrt(
          power(lat - p_lat, 2)
          + power((lng - p_lng) * cos(radians((lat + p_lat) / 2)), 2)
      ) <= 2
    order by last_reported_at desc
    for update
    limit 1;

    if not found then
        select count(*) into active_count
        from public.crowd_incidents
        where line_id = p_line_id and status <> 'RESOLVED';

        if active_count >= 3 then
            return jsonb_build_object('ok', false, 'code', 'active_cap_reached');
        end if;

        insert into public.crowd_incidents (
            id, line_id, status, severity, reason,
            nearest_station_id, nearest_station_name, lat, lng,
            first_reported_at, last_reported_at, expires_at
        ) values (
            'INC-' || p_line_id || '-' || floor(extract(epoch from p_reported_at) * 1000)::bigint,
            p_line_id,
            'PENDING',
            case when p_severity = 'confirmed_emergency' then 'emergency' else 'traffic' end,
            p_reason,
            p_nearest_station_id,
            p_nearest_station_name,
            p_lat,
            p_lng,
            p_reported_at,
            p_reported_at,
            p_reported_at + interval '30 minutes'
        )
        returning * into incident;
    end if;

    insert into public.stall_reports (
        id, incident_id, device_hash, line_id, lat, lng,
        nearest_station_id, nearest_station_name, nearest_station_distance_km,
        severity, reason, message, stall_duration_minutes, reported_at
    ) values (
        p_report_id, incident.id, p_device_hash, p_line_id, p_lat, p_lng,
        p_nearest_station_id, p_nearest_station_name, p_nearest_station_distance_km,
        p_severity, p_reason, p_message, p_stall_duration_minutes, p_reported_at
    )
    on conflict (id) do nothing;

    get diagnostics inserted_count = row_count;
    if inserted_count = 0 then
        return jsonb_build_object('ok', true, 'duplicate', true, 'incident', to_jsonb(incident));
    end if;

    select count(distinct device_hash) into recent_unique
    from public.stall_reports
    where incident_id = incident.id
      and reported_at >= p_reported_at - interval '10 minutes';

    update public.crowd_incidents
    set report_count = (
            select count(*) from public.stall_reports where incident_id = incident.id
        ),
        unique_device_count = recent_unique,
        severity = case
            when severity = 'emergency' or p_severity = 'confirmed_emergency' then 'emergency'
            else 'traffic'
        end,
        reason = p_reason,
        lat = (
            select avg(lat) from public.stall_reports where incident_id = incident.id
        ),
        lng = (
            select avg(lng) from public.stall_reports where incident_id = incident.id
        ),
        nearest_station_id = p_nearest_station_id,
        nearest_station_name = p_nearest_station_name,
        last_reported_at = p_reported_at,
        expires_at = p_reported_at + interval '30 minutes',
        status = case
            when status = 'PENDING' and recent_unique >= 3 then 'CONFIRMED'
            else status
        end,
        confirmed_at = case
            when status = 'PENDING' and recent_unique >= 3 then p_reported_at
            else confirmed_at
        end,
        updated_at = p_reported_at
    where id = incident.id
    returning * into incident;

    event_name := case
        when incident.status = 'CONFIRMED' and incident.confirmed_at = p_reported_at
            then 'incident_confirmed'
        when incident.status = 'CONFIRMED'
            then 'incident_updated'
        else null
    end;

    return jsonb_build_object(
        'ok', true,
        'duplicate', false,
        'event', event_name,
        'incident', to_jsonb(incident)
    );
end;
$$;

create or replace function public.resolve_crowd_incident(
    p_incident_id text,
    p_device_hash text,
    p_voted_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    incident public.crowd_incidents%rowtype;
    vote_count integer;
begin
    select * into incident
    from public.crowd_incidents
    where id = p_incident_id
    for update;

    if not found then
        return jsonb_build_object('ok', false, 'code', 'not_found');
    end if;
    if incident.status = 'RESOLVED' then
        return jsonb_build_object('ok', true, 'code', 'already_resolved', 'incident', to_jsonb(incident));
    end if;

    insert into public.incident_resolution_votes (incident_id, device_hash, voted_at)
    values (p_incident_id, p_device_hash, p_voted_at)
    on conflict (incident_id, device_hash) do nothing;

    select count(*) into vote_count
    from public.incident_resolution_votes
    where incident_id = p_incident_id;

    if vote_count >= 3 then
        update public.crowd_incidents
        set status = 'RESOLVED',
            resolved_at = p_voted_at,
            resolved_by = 'user_vote',
            updated_at = p_voted_at
        where id = p_incident_id
        returning * into incident;
    end if;

    return jsonb_build_object(
        'ok', true,
        'code', 'ok',
        'event', case when incident.status = 'RESOLVED' then 'incident_resolved' else 'incident_updated' end,
        'resolve_vote_count', vote_count,
        'incident', to_jsonb(incident)
    );
end;
$$;

revoke all on function public.record_crowd_presence from public, anon, authenticated;
revoke all on function public.claim_crowd_presence_broadcast from public, anon, authenticated;
revoke all on function public.mark_crowd_presence_broadcasted from public, anon, authenticated;
revoke all on function public.release_crowd_presence_broadcast from public, anon, authenticated;
revoke all on function public.record_stall_report from public, anon, authenticated;
revoke all on function public.resolve_crowd_incident from public, anon, authenticated;
grant execute on function public.record_crowd_presence to service_role;
grant execute on function public.claim_crowd_presence_broadcast to service_role;
grant execute on function public.mark_crowd_presence_broadcasted to service_role;
grant execute on function public.release_crowd_presence_broadcast to service_role;
grant execute on function public.record_stall_report to service_role;
grant execute on function public.resolve_crowd_incident to service_role;

commit;
