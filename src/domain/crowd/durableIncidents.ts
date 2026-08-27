import 'server-only';

import { createCrowdPseudonym } from '@/domain/crowd/identity';
import {
    INCIDENT_CONFIG,
    type IncidentEventName,
    type IncidentEventPayload,
    type IncidentResolvedBy,
    type IncidentSeverity,
    type IncidentStatus,
    type IncidentView,
} from '@/domain/crowd/incidentAggregator';
import {
    hashStallDeviceId,
    sanitizeStallReportPayload,
    type StallReason,
    type StallReport,
} from '@/domain/crowd/stallReport';
import { broadcastIncidentEvent } from '@/domain/crowd/incidentBroadcast';
import { broadcastStallReport } from '@/domain/crowd/stallBroadcast';
import { createAdminClient, hasAdminSupabaseConfig } from '@/lib/supabase/admin';
import type { LineId } from '@/types';

interface IncidentRow {
    id: string;
    line_id: LineId;
    status: IncidentStatus;
    severity: IncidentSeverity;
    reason: StallReason;
    nearest_station_id: string;
    nearest_station_name: string;
    lat: number;
    lng: number;
    report_count: number;
    unique_device_count: number;
    first_reported_at: string;
    last_reported_at: string;
    confirmed_at: string | null;
    resolved_at: string | null;
    resolved_by: IncidentResolvedBy;
    expires_at: string;
}

export interface DurableIncidentResult {
    ok: boolean;
    status: number;
    code: string;
    message: string;
    report?: StallReport;
    incident?: IncidentView | null;
    event?: IncidentEventPayload | null;
    duplicate?: boolean;
}

function reasonLabel(reason: StallReason) {
    switch (reason) {
        case 'slow_traffic': return 'slow traffic';
        case 'full_stop': return 'full stop';
        case 'door_issue': return 'door issue';
        case 'medical_emergency': return 'medical emergency';
        case 'power_outage': return 'power outage';
        case 'signal_fault': return 'signal fault';
        case 'crowd_surge': return 'crowd surge';
        default: return 'service disruption';
    }
}

function toIncidentView(row: IncidentRow, resolveVoteCount = 0): IncidentView {
    const psaPrefix = row.severity === 'emergency' ? 'Service disruption' : 'Possible delays';
    const psa = `${psaPrefix} on ${row.line_id} near ${row.nearest_station_name}: ${reasonLabel(row.reason)} reported by ${row.unique_device_count} commuters.`;

    return {
        id: row.id,
        lineId: row.line_id,
        status: row.status,
        severity: row.severity,
        reason: row.reason,
        nearestStationId: row.nearest_station_id,
        nearestStationName: row.nearest_station_name,
        nearestStation: row.nearest_station_name,
        lat: row.lat,
        lng: row.lng,
        reportCount: row.report_count,
        uniqueDeviceCount: row.unique_device_count,
        firstReportedAt: row.first_reported_at,
        lastReportedAt: row.last_reported_at,
        confirmedAt: row.confirmed_at,
        resolvedAt: row.resolved_at,
        resolvedBy: row.resolved_by,
        expiresAt: row.expires_at,
        resolveVoteCount,
        psa,
    };
}

function toEvent(
    eventName: IncidentEventName | null | undefined,
    incident: IncidentView,
): IncidentEventPayload | null {
    if (!eventName) return null;
    return {
        event: eventName,
        incident,
        psa: incident.psa,
        generatedAt: new Date().toISOString(),
    };
}

function crowdSecret() {
    return process.env.TRAINTRACKS_CROWD_ID_SECRET
        ?? process.env.SUPABASE_SERVICE_ROLE_KEY
        ?? process.env.SUPABASE_SECRET_KEY
        ?? null;
}

function rawDeviceId(payload: unknown): string | null {
    if (!payload || typeof payload !== 'object') return null;
    const value = (payload as Record<string, unknown>).deviceId;
    return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export async function processStallReport(payload: unknown): Promise<DurableIncidentResult> {
    const now = Date.now();
    const validation = sanitizeStallReportPayload(payload, now, { enforceMemoryRateLimit: false });
    if (!validation.ok || !validation.report) {
        return {
            ok: false,
            status: validation.status,
            code: validation.code,
            message: validation.message,
        };
    }

    const deviceId = rawDeviceId(payload);
    const secret = crowdSecret();
    if (!deviceId || !secret || !hasAdminSupabaseConfig()) {
        return {
            ok: false,
            status: 503,
            code: 'incident_storage_not_configured',
            message: 'Trusted incident storage is not configured.',
        };
    }

    const payloadRecord = payload as Record<string, unknown>;
    const clientReportId = typeof payloadRecord.reportId === 'string'
        ? payloadRecord.reportId.replace(/[^a-zA-Z0-9:_-]/g, '').slice(0, 96)
        : '';
    const pseudonym = createCrowdPseudonym(deviceId, secret, now);
    const report: StallReport = {
        ...validation.report,
        id: clientReportId
            ? `STALL-${pseudonym}-${clientReportId}`
            : `STALL-${pseudonym}-${now}`,
        deviceHash: pseudonym,
    };

    const admin = createAdminClient();
    const { data, error } = await admin.rpc('record_stall_report', {
        p_report_id: report.id,
        p_device_hash: report.deviceHash,
        p_line_id: report.lineId,
        p_lat: report.lat,
        p_lng: report.lng,
        p_nearest_station_id: report.nearestStationId,
        p_nearest_station_name: report.nearestStationName,
        p_nearest_station_distance_km: report.nearestStationDistKm,
        p_severity: report.severity,
        p_reason: report.reason,
        p_message: report.message,
        p_stall_duration_minutes: report.stallDurationMin,
        p_reported_at: new Date(report.reportedAt).toISOString(),
    });

    if (error) {
        console.error('[Incidents] Durable report failed:', error.message);
        return {
            ok: false,
            status: 503,
            code: 'incident_storage_unavailable',
            message: 'The report could not be stored for retry.',
        };
    }

    const record = data as {
        ok?: boolean;
        code?: string;
        duplicate?: boolean;
        event?: IncidentEventName | null;
        incident?: IncidentRow;
    } | null;
    if (record?.ok === false) {
        return {
            ok: false,
            status: record.code?.includes('limit') ? 429 : 409,
            code: record.code ?? 'incident_rejected',
            message: 'The report was rejected by durable anti-abuse checks.',
        };
    }

    const incident = record?.incident ? toIncidentView(record.incident) : null;
    const event = incident ? toEvent(record?.event, incident) : null;

    const [stallBroadcast, incidentBroadcast] = await Promise.all([
        broadcastStallReport(report),
        event ? broadcastIncidentEvent(event) : Promise.resolve(null),
    ]);
    if (!stallBroadcast.ok) {
        console.warn('[Incidents] Report stored but realtime stall broadcast failed:', stallBroadcast.message);
    }
    if (incidentBroadcast && !incidentBroadcast.ok) {
        console.warn('[Incidents] Incident stored but realtime incident broadcast failed:', incidentBroadcast.message);
    }

    return {
        ok: true,
        status: record?.duplicate ? 200 : 201,
        code: 'ok',
        message: record?.duplicate ? 'Report already recorded.' : 'Stall report recorded.',
        report,
        incident,
        event,
        duplicate: record?.duplicate === true,
    };
}

export async function listDurableIncidents(lineId?: LineId | null): Promise<IncidentView[]> {
    if (!hasAdminSupabaseConfig()) return [];

    const admin = createAdminClient();
    const now = new Date().toISOString();
    await admin
        .from('crowd_incidents')
        .update({
            status: 'RESOLVED',
            resolved_at: now,
            resolved_by: 'auto_expired',
            updated_at: now,
        })
        .neq('status', 'RESOLVED')
        .lt('expires_at', now);

    let query = admin
        .from('crowd_incidents')
        .select('*')
        .eq('status', 'CONFIRMED')
        .gte('expires_at', now)
        .order('confirmed_at', { ascending: false })
        .limit(INCIDENT_CONFIG.maxActivePerLine * 3);
    if (lineId) query = query.eq('line_id', lineId);

    const { data, error } = await query;
    if (error) {
        console.error('[Incidents] Durable list failed:', error.message);
        return [];
    }
    return (data as IncidentRow[]).map((row) => toIncidentView(row));
}

export async function resolveDurableIncident(
    incidentId: string,
    deviceId: string,
): Promise<DurableIncidentResult> {
    const secret = crowdSecret();
    if (!secret || !hasAdminSupabaseConfig()) {
        return {
            ok: false,
            status: 503,
            code: 'incident_storage_not_configured',
            message: 'Trusted incident storage is not configured.',
        };
    }

    const deviceHash = createCrowdPseudonym(deviceId, secret);
    const { data, error } = await createAdminClient().rpc('resolve_crowd_incident', {
        p_incident_id: incidentId,
        p_device_hash: deviceHash || hashStallDeviceId(deviceId),
        p_voted_at: new Date().toISOString(),
    });

    if (error) {
        return {
            ok: false,
            status: 503,
            code: 'incident_storage_unavailable',
            message: 'Resolution vote could not be stored.',
        };
    }

    const record = data as {
        ok?: boolean;
        code?: string;
        event?: IncidentEventName;
        resolve_vote_count?: number;
        incident?: IncidentRow;
    } | null;
    if (record?.ok === false || !record?.incident) {
        return {
            ok: false,
            status: record?.code === 'not_found' ? 404 : 409,
            code: record?.code ?? 'incident_not_found',
            message: 'Incident could not be resolved.',
        };
    }

    const incident = toIncidentView(record.incident, record.resolve_vote_count ?? 0);
    const event = toEvent(record.event, incident);
    if (event) await broadcastIncidentEvent(event);

    return {
        ok: true,
        status: 200,
        code: record.code ?? 'ok',
        message: incident.status === 'RESOLVED'
            ? 'Incident resolved.'
            : 'Resolution vote recorded.',
        incident,
        event,
    };
}
