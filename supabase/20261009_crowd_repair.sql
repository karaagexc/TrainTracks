-- Apply only after 20260809_security_reliability.sql in an authorized environment.
-- No raw device ids. Retain immutable samples separately from the latest presence row.
begin;

create table if not exists public.crowd_presence_deliveries (
    pseudonym text not null,
    sample_id text not null,
    payload jsonb not null,
    observed_at timestamptz not null,
    expires_at timestamptz not null,
    claimed_at timestamptz,
    claim_token text,
    broadcasted_at timestamptz,
    primary key (pseudonym, sample_id)
);
create index if not exists crowd_presence_deliveries_expiry on public.crowd_presence_deliveries(expires_at);
alter table public.crowd_presence_deliveries enable row level security;
revoke all on public.crowd_presence_deliveries from public, anon, authenticated;
grant all on public.crowd_presence_deliveries to service_role;

drop function if exists public.record_crowd_presence(text, text, text, text, text, text, double precision, double precision, double precision, double precision, double precision, text, timestamptz);
create or replace function public.record_crowd_presence(
    p_pseudonym text, p_line_id text, p_direction text, p_status_code text,
    p_station_id text, p_station_name text, p_lat double precision, p_lng double precision,
    p_speed_kph double precision, p_confidence double precision, p_accuracy_meters double precision,
    p_sample_id text, p_reported_at timestamptz, p_interval_ms integer default 3000
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
    previous public.crowd_presence%rowtype;
    delivery public.crowd_presence_deliveries%rowtype;
    elapsed_seconds double precision;
    moved_km double precision;
    safe_payload jsonb;
begin
    -- A row lock alone cannot serialize the first write when no row exists yet.
    perform pg_advisory_xact_lock(hashtextextended('crowd:' || p_pseudonym, 0));
    select * into delivery from public.crowd_presence_deliveries
        where pseudonym = p_pseudonym and sample_id = p_sample_id;
    if found then
        return jsonb_build_object('ok', true, 'duplicate', true,
            'broadcast_state_supported', true, 'broadcasted', delivery.broadcasted_at is not null, 'train', delivery.payload);
    end if;
    if p_reported_at < clock_timestamp() - interval '45 seconds'
        or p_reported_at > clock_timestamp() + interval '5 seconds' then
        return jsonb_build_object('ok', false, 'code', 'stale_sample');
    end if;
    select * into previous from public.crowd_presence where pseudonym = p_pseudonym for update;
    if found then
        elapsed_seconds := extract(epoch from (p_reported_at - previous.updated_at));
        if elapsed_seconds <= 0 then
            return jsonb_build_object('ok', false, 'code', 'stale_sample');
        end if;
        if elapsed_seconds < greatest(3000, least(30000, p_interval_ms)) / 1000.0 then
            return jsonb_build_object('ok', false, 'code', 'rate_limited');
        end if;
        moved_km := 111.32 * sqrt(power(p_lat - previous.lat, 2)
            + power((p_lng - previous.lng) * cos(radians((p_lat + previous.lat) / 2)), 2));
        if elapsed_seconds < 120 and moved_km > greatest(0.5, elapsed_seconds * 0.06) then
            return jsonb_build_object('ok', false, 'code', 'implausible_jump');
        end if;
    end if;
    safe_payload := jsonb_build_object(
        'id', 'CROWD-' || p_pseudonym, 'deviceId', p_pseudonym, 'sampleId', p_sample_id,
        'lineId', p_line_id, 'direction', p_direction, 'statusCode', p_status_code,
        'stationId', p_station_id, 'stationName', p_station_name,
        'lat', p_lat, 'lng', p_lng, 'speedKph', p_speed_kph, 'confidence', p_confidence,
        'source', 'crowd', 'sourceCount', 1,
        'updatedAt', floor(extract(epoch from p_reported_at) * 1000),
        'validUntil', floor(extract(epoch from (p_reported_at + interval '45 seconds')) * 1000)
    );
    insert into public.crowd_presence_deliveries(pseudonym, sample_id, payload, observed_at, expires_at)
        values(p_pseudonym, p_sample_id, safe_payload, p_reported_at, p_reported_at + interval '45 seconds');
    insert into public.crowd_presence(
        pseudonym, line_id, direction, status_code, station_id, station_name, lat, lng,
        speed_kph, confidence, accuracy_meters, sample_id, updated_at, expires_at
    ) values (
        p_pseudonym, p_line_id, p_direction, p_status_code, p_station_id, p_station_name, p_lat, p_lng,
        p_speed_kph, p_confidence, p_accuracy_meters, p_sample_id, p_reported_at, p_reported_at + interval '45 seconds'
    ) on conflict(pseudonym) do update set
        line_id = excluded.line_id, direction = excluded.direction, status_code = excluded.status_code,
        station_id = excluded.station_id, station_name = excluded.station_name,
        lat = excluded.lat, lng = excluded.lng, speed_kph = excluded.speed_kph, confidence = excluded.confidence,
        accuracy_meters = excluded.accuracy_meters, sample_id = excluded.sample_id,
        updated_at = excluded.updated_at, expires_at = excluded.expires_at,
        broadcast_sample_id = null, broadcast_claimed_sample_id = null, broadcast_claimed_at = null;
    return jsonb_build_object('ok', true, 'duplicate', false, 'broadcast_state_supported', true, 'broadcasted', false);
end;
$$;

create or replace function public.claim_crowd_presence_broadcast(
    p_pseudonym text, p_sample_id text, p_claimed_at timestamptz
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
    delivery public.crowd_presence_deliveries%rowtype;
    token text;
    v_claimed_at timestamptz := clock_timestamp();
begin
    select * into delivery from public.crowd_presence_deliveries
        where pseudonym = p_pseudonym and sample_id = p_sample_id for update;
    if not found then return jsonb_build_object('ok', false, 'status', 'sample_not_found'); end if;
    if delivery.broadcasted_at is not null then
        return jsonb_build_object('ok', true, 'status', 'already_broadcasted', 'train', delivery.payload);
    end if;
    if delivery.expires_at <= v_claimed_at then
        return jsonb_build_object('ok', false, 'status', 'sample_expired');
    end if;
    if delivery.claimed_at >= v_claimed_at - interval '30 seconds' then
        return jsonb_build_object('ok', true, 'status', 'claimed_elsewhere', 'train', delivery.payload);
    end if;
    token := gen_random_uuid()::text;
    update public.crowd_presence_deliveries set claimed_at = v_claimed_at, claim_token = token
        where pseudonym = p_pseudonym and sample_id = p_sample_id;
    return jsonb_build_object('ok', true, 'status', 'acquired', 'claim_token', token, 'train', delivery.payload);
end;
$$;

-- Fence release/completion by claim owner; a timed-out worker cannot clear a newer claim.
drop function if exists public.mark_crowd_presence_broadcasted(text, text, timestamptz);
drop function if exists public.release_crowd_presence_broadcast(text, text);
create or replace function public.mark_crowd_presence_broadcasted(
    p_pseudonym text, p_sample_id text, p_broadcasted_at timestamptz, p_claim_token text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare updated_count integer;
begin
    update public.crowd_presence_deliveries set broadcasted_at = clock_timestamp(), claimed_at = null, claim_token = null
        where pseudonym = p_pseudonym and sample_id = p_sample_id and claim_token = p_claim_token;
    get diagnostics updated_count = row_count;
    if updated_count = 1 then
        update public.crowd_presence set broadcast_sample_id = p_sample_id
            where pseudonym = p_pseudonym and sample_id = p_sample_id;
    end if;
    return jsonb_build_object('ok', updated_count = 1);
end;
$$;
create or replace function public.release_crowd_presence_broadcast(
    p_pseudonym text, p_sample_id text, p_claim_token text
) returns jsonb language plpgsql security definer set search_path = public as $$
begin
    update public.crowd_presence_deliveries set claimed_at = null, claim_token = null
        where pseudonym = p_pseudonym and sample_id = p_sample_id and claim_token = p_claim_token;
    return jsonb_build_object('ok', true);
end;
$$;

-- Keep old RPC names/signatures resolvable, but never mutate an unfenced claim.
-- Mixed-version API workers must upgrade before they can acknowledge/release delivery.
create or replace function public.mark_crowd_presence_broadcasted(
    p_pseudonym text, p_sample_id text, p_broadcasted_at timestamptz
) returns jsonb language sql security definer set search_path = public as $$
    select jsonb_build_object('ok', false, 'code', 'claim_token_required');
$$;
create or replace function public.release_crowd_presence_broadcast(
    p_pseudonym text, p_sample_id text
) returns jsonb language sql security definer set search_path = public as $$
    select jsonb_build_object('ok', false, 'code', 'claim_token_required');
$$;

revoke all on function public.record_crowd_presence from public, anon, authenticated;
revoke all on function public.claim_crowd_presence_broadcast from public, anon, authenticated;
revoke all on function public.mark_crowd_presence_broadcasted(text,text,timestamptz,text) from public, anon, authenticated;
revoke all on function public.mark_crowd_presence_broadcasted(text,text,timestamptz) from public, anon, authenticated;
revoke all on function public.release_crowd_presence_broadcast(text,text,text) from public, anon, authenticated;
revoke all on function public.release_crowd_presence_broadcast(text,text) from public, anon, authenticated;
grant execute on function public.record_crowd_presence to service_role;
grant execute on function public.claim_crowd_presence_broadcast to service_role;
grant execute on function public.mark_crowd_presence_broadcasted(text,text,timestamptz,text) to service_role;
grant execute on function public.mark_crowd_presence_broadcasted(text,text,timestamptz) to service_role;
grant execute on function public.release_crowd_presence_broadcast(text,text,text) to service_role;
grant execute on function public.release_crowd_presence_broadcast(text,text) to service_role;

-- Preserve the legacy incident aggregator behind a stricter, serialized configuration boundary.
do $$
begin
    if to_regprocedure('public.record_stall_report_base(text,text,text,double precision,double precision,text,text,double precision,text,text,text,integer,timestamp with time zone)') is null then
        alter function public.record_stall_report(text,text,text,double precision,double precision,text,text,double precision,text,text,text,integer,timestamptz)
            rename to record_stall_report_base;
    end if;
end;
$$;

create or replace function public.record_stall_report(
    p_report_id text, p_device_hash text, p_line_id text, p_lat double precision, p_lng double precision,
    p_nearest_station_id text, p_nearest_station_name text, p_nearest_station_distance_km double precision,
    p_severity text, p_reason text, p_message text, p_stall_duration_minutes integer, p_reported_at timestamptz,
    p_device_cooldown_ms integer default 300000, p_max_reports_per_hour integer default 6,
    p_min_duration_min double precision default 3, p_max_station_distance_km double precision default 1.5
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
    existing public.stall_reports%rowtype;
    incident public.crowd_incidents%rowtype;
    latest timestamptz;
    report_count integer;
begin
    perform pg_advisory_xact_lock(hashtextextended('stall-device:' || p_device_hash, 0));
    perform pg_advisory_xact_lock(hashtextextended('stall-line:' || p_line_id, 0));
    select * into existing from public.stall_reports where id = p_report_id;
    if found then
        if existing.device_hash <> p_device_hash then
            return jsonb_build_object('ok', false, 'code', 'report_owner_mismatch');
        end if;
        select * into incident from public.crowd_incidents where id = existing.incident_id;
        return jsonb_build_object('ok', true, 'duplicate', true, 'incident', to_jsonb(incident));
    end if;
    if p_stall_duration_minutes < greatest(3, least(15, p_min_duration_min))
        or p_nearest_station_distance_km > greatest(0.5, least(1.5, p_max_station_distance_km)) then
        return jsonb_build_object('ok', false, 'code', 'invalid_report');
    end if;
    select max(reported_at), count(*) filter(where reported_at >= p_reported_at - interval '1 hour')
        into latest, report_count from public.stall_reports where device_hash = p_device_hash;
    if latest > p_reported_at - greatest(300000, least(900000, p_device_cooldown_ms)) * interval '1 millisecond' then
        return jsonb_build_object('ok', false, 'code', 'rate_limited');
    end if;
    if report_count >= greatest(1, least(6, p_max_reports_per_hour)) then
        return jsonb_build_object('ok', false, 'code', 'hourly_limit');
    end if;
    return public.record_stall_report_base(p_report_id, p_device_hash, p_line_id, p_lat, p_lng,
        p_nearest_station_id, p_nearest_station_name, p_nearest_station_distance_km,
        p_severity, p_reason, p_message, p_stall_duration_minutes, p_reported_at);
end;
$$;
revoke all on function public.record_stall_report_base from public, anon, authenticated;
revoke all on function public.record_stall_report from public, anon, authenticated;
grant execute on function public.record_stall_report to service_role;

-- Operational retention: delete expired delivery rows after 24 hours in an authorized maintenance job.
commit;
