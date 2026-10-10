-- Synthetic preexisting secured records must survive incremental repair/replay.
insert into public.crowd_incidents (
    id, line_id, status, severity, reason, nearest_station_id, nearest_station_name,
    lat, lng, report_count, unique_device_count, first_reported_at,
    last_reported_at, resolved_at, resolved_by, expires_at
) values (
    'legacy-fixture-incident', 'MRT3', 'RESOLVED', 'traffic', 'Synthetic legacy fixture',
    'M3-01', 'North Avenue', 14.652, 121.032, 1, 1,
    '2026-10-08 09:00:00+00', '2026-10-08 09:00:00+00',
    '2026-10-08 09:10:00+00', 'fixture', '2026-10-08 09:30:00+00'
);
insert into public.stall_reports (
    id, incident_id, device_hash, line_id, lat, lng, nearest_station_id,
    nearest_station_name, nearest_station_distance_km, severity, reason,
    message, stall_duration_minutes, reported_at
) values (
    'legacy-fixture-report', 'legacy-fixture-incident', repeat('a', 64), 'MRT3',
    14.652, 121.032, 'M3-01', 'North Avenue', 0.1, 'traffic',
    'Synthetic legacy fixture', 'Preserve this existing report', 5,
    '2026-10-08 09:00:00+00'
);
insert into public.incident_resolution_votes(incident_id, device_hash, voted_at)
values ('legacy-fixture-incident', repeat('b', 64), '2026-10-08 09:10:00+00');
