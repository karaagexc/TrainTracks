import type { LineId } from '@/types';
import type { StallReason, StallReport, StallSeverity } from '@/domain/crowd/stallReport';

export type IncidentStatus = 'PENDING' | 'CONFIRMED' | 'RESOLVED';
export type IncidentSeverity = 'traffic' | 'emergency';
export type IncidentResolvedBy = 'auto_expired' | 'user_vote' | 'admin' | null;
export type IncidentEventName = 'incident_confirmed' | 'incident_updated' | 'incident_resolved';

export interface Incident {
    id: string;
    lineId: LineId;
    status: IncidentStatus;
    severity: IncidentSeverity;
    reason: StallReason;
    nearestStationId: string;
    nearestStationName: string;
    lat: number;
    lng: number;
    reportCount: number;
    uniqueDevices: Set<string>;
    firstReportedAt: number;
    lastReportedAt: number;
    confirmedAt: number | null;
    resolvedAt: number | null;
    resolvedBy: IncidentResolvedBy;
    ttlMs: number;
    resolveVotes: Set<string>;
    reports: StallReport[];
}

export interface IncidentView {
    id: string;
    lineId: LineId;
    status: IncidentStatus;
    severity: IncidentSeverity;
    reason: StallReason;
    nearestStationId: string;
    nearestStationName: string;
    nearestStation: string;
    lat: number;
    lng: number;
    reportCount: number;
    uniqueDeviceCount: number;
    firstReportedAt: string;
    lastReportedAt: string;
    confirmedAt: string | null;
    resolvedAt: string | null;
    resolvedBy: IncidentResolvedBy;
    expiresAt: string;
    resolveVoteCount: number;
    psa: string;
}

export interface IncidentEventPayload {
    event: IncidentEventName;
    incident: IncidentView;
    psa: string;
    generatedAt: string;
}

export interface IncidentAggregationResult {
    accepted: boolean;
    incident: IncidentView | null;
    event: IncidentEventPayload | null;
    ignoredReason?: 'active_cap_reached';
}

export interface IncidentResolveResult {
    ok: boolean;
    status: number;
    code: 'ok' | 'not_found' | 'already_resolved';
    message: string;
    incident: IncidentView | null;
    event: IncidentEventPayload | null;
}

export const INCIDENT_CHANNEL = 'traintracks:incidents';

export const INCIDENT_CONFIG = {
    quorumDevices: 3,
    quorumWindowMs: 600_000,
    clusterRadiusKm: 2.0,
    ttlMs: 1_800_000,
    resolveQuorum: 3,
    maxActivePerLine: 3,
} as const;

const incidents = new Map<string, Incident>();

function approxDistKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const earthRadiusKm = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180 * Math.cos((lat1 + lat2) / 2 * Math.PI / 180);
    return earthRadiusKm * Math.sqrt(dLat * dLat + dLng * dLng);
}

function toSeverity(severity: StallSeverity): IncidentSeverity {
    return severity === 'confirmed_emergency' ? 'emergency' : 'traffic';
}

function severityRank(severity: IncidentSeverity): number {
    return severity === 'emergency' ? 2 : 1;
}

function iso(ms: number | null): string | null {
    return ms === null ? null : new Date(ms).toISOString();
}

function getReasonLabel(reason: StallReason): string {
    switch (reason) {
        case 'slow_traffic':
            return 'slow traffic';
        case 'full_stop':
            return 'full stop';
        case 'door_issue':
            return 'door issue';
        case 'medical_emergency':
            return 'medical emergency';
        case 'power_outage':
            return 'power outage';
        case 'signal_fault':
            return 'signal fault';
        case 'crowd_surge':
            return 'crowd surge';
        case 'unknown':
        default:
            return 'service disruption';
    }
}

function buildPsa(incident: Incident): string {
    const label = incident.severity === 'emergency' ? 'Service disruption' : 'Possible delays';
    return `${label} on ${incident.lineId} near ${incident.nearestStationName}: ${getReasonLabel(incident.reason)} reported by ${incident.uniqueDevices.size} commuters.`;
}

function serializeIncident(incident: Incident): IncidentView {
    const expiresAt = incident.lastReportedAt + incident.ttlMs;
    return {
        id: incident.id,
        lineId: incident.lineId,
        status: incident.status,
        severity: incident.severity,
        reason: incident.reason,
        nearestStationId: incident.nearestStationId,
        nearestStationName: incident.nearestStationName,
        nearestStation: incident.nearestStationName,
        lat: Math.round(incident.lat * 1_000_000) / 1_000_000,
        lng: Math.round(incident.lng * 1_000_000) / 1_000_000,
        reportCount: incident.reportCount,
        uniqueDeviceCount: incident.uniqueDevices.size,
        firstReportedAt: new Date(incident.firstReportedAt).toISOString(),
        lastReportedAt: new Date(incident.lastReportedAt).toISOString(),
        confirmedAt: iso(incident.confirmedAt),
        resolvedAt: iso(incident.resolvedAt),
        resolvedBy: incident.resolvedBy,
        expiresAt: new Date(expiresAt).toISOString(),
        resolveVoteCount: incident.resolveVotes.size,
        psa: buildPsa(incident),
    };
}

function buildEvent(event: IncidentEventName, incident: Incident, now: number): IncidentEventPayload {
    const view = serializeIncident(incident);
    return {
        event,
        incident: view,
        psa: view.psa,
        generatedAt: new Date(now).toISOString(),
    };
}

function getRecentUniqueDevices(incident: Incident, now: number): Set<string> {
    const cutoff = now - INCIDENT_CONFIG.quorumWindowMs;
    return new Set(
        incident.reports
            .filter((report) => report.reportedAt >= cutoff)
            .map((report) => report.deviceHash),
    );
}

function chooseReason(reports: StallReport[]): StallReason {
    const counts = new Map<StallReason, { count: number; lastSeen: number }>();
    reports.forEach((report) => {
        const current = counts.get(report.reason) ?? { count: 0, lastSeen: 0 };
        counts.set(report.reason, {
            count: current.count + 1,
            lastSeen: Math.max(current.lastSeen, report.reportedAt),
        });
    });

    return Array.from(counts.entries())
        .sort((left, right) => right[1].count - left[1].count || right[1].lastSeen - left[1].lastSeen)[0]?.[0]
        ?? 'unknown';
}

function recalculateIncident(incident: Incident) {
    const reports = incident.reports;
    const reportCount = reports.length;
    const lat = reports.reduce((sum, report) => sum + report.lat, 0) / Math.max(1, reportCount);
    const lng = reports.reduce((sum, report) => sum + report.lng, 0) / Math.max(1, reportCount);
    const nearestReport = reports
        .filter((report) => report.nearestStationId && report.nearestStationName)
        .sort((left, right) => left.nearestStationDistKm - right.nearestStationDistKm || right.reportedAt - left.reportedAt)[0];
    const worstSeverity = reports
        .map((report) => toSeverity(report.severity))
        .sort((left, right) => severityRank(right) - severityRank(left))[0] ?? 'traffic';

    incident.lat = lat;
    incident.lng = lng;
    incident.reportCount = reportCount;
    incident.uniqueDevices = new Set(reports.map((report) => report.deviceHash));
    incident.firstReportedAt = Math.min(...reports.map((report) => report.reportedAt));
    incident.lastReportedAt = Math.max(...reports.map((report) => report.reportedAt));
    incident.severity = worstSeverity;
    incident.reason = chooseReason(reports);
    incident.nearestStationId = nearestReport?.nearestStationId ?? incident.nearestStationId;
    incident.nearestStationName = nearestReport?.nearestStationName ?? incident.nearestStationName;
}

function findCluster(report: StallReport): Incident | null {
    return Array.from(incidents.values())
        .filter((incident) => (
            incident.lineId === report.lineId &&
            incident.status !== 'RESOLVED' &&
            approxDistKm(incident.lat, incident.lng, report.lat, report.lng) <= INCIDENT_CONFIG.clusterRadiusKm
        ))
        .sort((left, right) => (
            approxDistKm(left.lat, left.lng, report.lat, report.lng) -
            approxDistKm(right.lat, right.lng, report.lat, report.lng)
        ))[0] ?? null;
}

function activeIncidentCountForLine(lineId: LineId): number {
    return Array.from(incidents.values())
        .filter((incident) => incident.lineId === lineId && incident.status !== 'RESOLVED')
        .length;
}

function createIncident(report: StallReport): Incident {
    const incident: Incident = {
        id: `INC-${report.lineId}-${report.reportedAt}`,
        lineId: report.lineId,
        status: 'PENDING',
        severity: toSeverity(report.severity),
        reason: report.reason,
        nearestStationId: report.nearestStationId ?? 'unknown',
        nearestStationName: report.nearestStationName ?? 'Unknown station',
        lat: report.lat,
        lng: report.lng,
        reportCount: 1,
        uniqueDevices: new Set([report.deviceHash]),
        firstReportedAt: report.reportedAt,
        lastReportedAt: report.reportedAt,
        confirmedAt: null,
        resolvedAt: null,
        resolvedBy: null,
        ttlMs: INCIDENT_CONFIG.ttlMs,
        resolveVotes: new Set(),
        reports: [report],
    };
    incidents.set(incident.id, incident);
    return incident;
}

function markResolved(incident: Incident, resolvedBy: Exclude<IncidentResolvedBy, null>, now: number): IncidentEventPayload {
    incident.status = 'RESOLVED';
    incident.resolvedAt = now;
    incident.resolvedBy = resolvedBy;
    return buildEvent('incident_resolved', incident, now);
}

export function sweepExpiredIncidents(now = Date.now()): IncidentEventPayload[] {
    const events: IncidentEventPayload[] = [];
    incidents.forEach((incident) => {
        if (incident.status === 'RESOLVED') return;
        if (now - incident.lastReportedAt <= incident.ttlMs) return;
        const event = markResolved(incident, 'auto_expired', now);
        if (incident.confirmedAt) events.push(event);
    });
    return events;
}

export function recordIncidentReport(report: StallReport, now = report.reportedAt): IncidentAggregationResult {
    sweepExpiredIncidents(now);
    let incident = findCluster(report);

    if (!incident) {
        if (activeIncidentCountForLine(report.lineId) >= INCIDENT_CONFIG.maxActivePerLine) {
            return {
                accepted: false,
                incident: null,
                event: null,
                ignoredReason: 'active_cap_reached',
            };
        }
        incident = createIncident(report);
    } else {
        incident.reports.push(report);
        incident.resolveVotes.clear();
        recalculateIncident(incident);
    }

    const recentUniqueDevices = getRecentUniqueDevices(incident, now);
    let event: IncidentEventPayload | null = null;

    if (incident.status === 'PENDING' && recentUniqueDevices.size >= INCIDENT_CONFIG.quorumDevices) {
        incident.status = 'CONFIRMED';
        incident.confirmedAt = now;
        event = buildEvent('incident_confirmed', incident, now);
    } else if (incident.status === 'CONFIRMED') {
        event = buildEvent('incident_updated', incident, now);
    }

    return {
        accepted: true,
        incident: serializeIncident(incident),
        event,
    };
}

export function listActiveIncidents(options: { lineId?: LineId | null; now?: number } = {}): IncidentView[] {
    const now = options.now ?? Date.now();
    sweepExpiredIncidents(now);
    return Array.from(incidents.values())
        .filter((incident) => (
            incident.status === 'CONFIRMED' &&
            (!options.lineId || incident.lineId === options.lineId)
        ))
        .sort((left, right) => right.confirmedAt! - left.confirmedAt!)
        .map(serializeIncident);
}

export function voteIncidentResolved(incidentId: string, deviceHash: string, now = Date.now()): IncidentResolveResult {
    const expiredEvents = sweepExpiredIncidents(now);
    const expiredEvent = expiredEvents.find((event) => event.incident.id === incidentId) ?? null;
    if (expiredEvent) {
        return {
            ok: true,
            status: 200,
            code: 'ok',
            message: 'Incident was already auto-resolved.',
            incident: expiredEvent.incident,
            event: expiredEvent,
        };
    }

    const incident = incidents.get(incidentId);
    if (!incident) {
        return {
            ok: false,
            status: 404,
            code: 'not_found',
            message: 'Incident was not found.',
            incident: null,
            event: null,
        };
    }

    if (incident.status === 'RESOLVED') {
        return {
            ok: false,
            status: 409,
            code: 'already_resolved',
            message: 'Incident is already resolved.',
            incident: serializeIncident(incident),
            event: null,
        };
    }

    incident.resolveVotes.add(deviceHash);
    if (incident.resolveVotes.size >= INCIDENT_CONFIG.resolveQuorum) {
        const event = markResolved(incident, 'user_vote', now);
        return {
            ok: true,
            status: 200,
            code: 'ok',
            message: 'Incident resolved.',
            incident: serializeIncident(incident),
            event,
        };
    }

    return {
        ok: true,
        status: 200,
        code: 'ok',
        message: 'Resolution vote recorded.',
        incident: serializeIncident(incident),
        event: buildEvent('incident_updated', incident, now),
    };
}

export function resetIncidentAggregatorForTests() {
    incidents.clear();
}
