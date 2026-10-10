import type { IncidentView } from './incidentAggregator';

export type IncidentVoteState = 'pending' | 'queued' | 'confirmed' | 'error';

export function isIncidentView(value: unknown): value is IncidentView {
    if (!value || typeof value !== 'object') return false;
    const incident = value as Partial<IncidentView>;
    return typeof incident.id === 'string' && ['LRT1', 'LRT2', 'MRT3'].includes(String(incident.lineId))
        && ['PENDING', 'CONFIRMED', 'RESOLVED'].includes(String(incident.status))
        && typeof incident.lastReportedAt === 'string' && Number.isFinite(Date.parse(incident.lastReportedAt))
        && typeof incident.expiresAt === 'string' && Number.isFinite(Date.parse(incident.expiresAt))
        && Number.isFinite(incident.lat) && Number.isFinite(incident.lng);
}

export function reconcileIncidentSnapshot(current: IncidentView[], incoming: IncidentView[],
    startedAt: number, eventsReceivedAt: Map<string, number>, now = Date.now()): IncidentView[] {
    const merged = new Map(incoming.map((incident) => [incident.id, incident]));
    for (const [id, receivedAt] of eventsReceivedAt) {
        if (receivedAt < startedAt) continue;
        const latest = current.find((incident) => incident.id === id);
        if (latest) merged.set(id, latest);
        else merged.delete(id);
    }
    return Array.from(merged.values()).filter((incident) => incident.status === 'CONFIRMED'
        && Date.parse(incident.expiresAt) > now);
}
