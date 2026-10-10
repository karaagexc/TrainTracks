-- Entirely synthetic identities and values; no environment or production seed.
alter table public.profiles add column email text;
alter table public.profiles add column is_admin boolean not null default false;
alter table public.profiles add column has_password boolean not null default false;

insert into auth.users(id, email, phone, raw_user_meta_data, raw_app_meta_data) values
    ('11111111-1111-4111-8111-111111111111', 'commuter-a@invalid.test', '+00000000001', '{"full_name":"Commuter A"}', '{"provider":"email"}'),
    ('22222222-2222-4222-8222-222222222222', 'commuter-b@invalid.test', '+00000000002', '{"full_name":"Commuter B"}', '{"provider":"google"}'),
    ('33333333-3333-4333-8333-333333333333', 'admin@invalid.test', null, '{"full_name":"Admin"}', '{"provider":"email"}');
update public.profiles set email = auth.users.email from auth.users where profiles.id = auth.users.id;
update public.profiles set username = 'commuter_a', has_password = true where id = '11111111-1111-4111-8111-111111111111';
update public.profiles set username = 'commuter_b' where id = '22222222-2222-4222-8222-222222222222';
update public.profiles set username = 'admin_fixture', is_admin = true, has_password = true where id = '33333333-3333-4333-8333-333333333333';
update public.app_config set maintenance_mode = true, maintenance_message = 'Preserve this legacy fixture',
    congestion_config = '{"calendar":[{"date":"2026-10-09","mode":"special_event","label":"Legacy test event"}]}'::jsonb;
insert into public.trip_history(id, user_id, origin_id, origin_name, destination_id, destination_name,
    line_id, ticket_type, fare, distance_km, direction, duration_minutes, started_at, completed_at)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111',
    'L2-01', 'Recto', 'L2-02', 'Legarda', 'LRT2', 'SJT', 8, 1.25, 'EASTBOUND', 10,
    '2026-10-08 10:00:00+00', '2026-10-08 10:10:00+00');
