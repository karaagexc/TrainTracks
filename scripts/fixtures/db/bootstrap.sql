-- Local-only Supabase database boundary, not an implementation of GoTrue/PostgREST.
create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;
create role authenticator nologin noinherit;
grant anon, authenticated, service_role to authenticator;

create schema auth;
create schema storage;
grant usage on schema public, auth, storage to anon, authenticated, service_role;

create function auth.jwt() returns jsonb language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb;
$$;
create function auth.uid() returns uuid language sql stable as $$
    select nullif(auth.jwt()->>'sub', '')::uuid;
$$;
create function auth.role() returns text language sql stable as $$
    select coalesce(auth.jwt()->>'role', nullif(current_setting('request.jwt.claim.role', true), ''));
$$;

create table auth.users (
    id uuid primary key,
    email text,
    phone text,
    raw_user_meta_data jsonb not null default '{}'::jsonb,
    raw_app_meta_data jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);
create table storage.buckets (id text primary key, name text not null, public boolean not null default false);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$
    select (string_to_array(name, '/'))[1:greatest(array_length(string_to_array(name, '/'), 1) - 1, 0)];
$$;

-- Supabase supplies these defaults outside the app migrations. Security migrations
-- must narrow them, not rely on a fixture that starts with artificially few grants.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

create schema smoke;
create table smoke.realtime_observations (
    sequence bigint generated always as identity primary key,
    sample_id text not null,
    payload jsonb not null,
    observed_at timestamptz not null default clock_timestamp()
);
grant usage on schema smoke to service_role;
grant insert, select on smoke.realtime_observations to service_role;
grant usage on all sequences in schema smoke to service_role;
