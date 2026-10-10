'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { enqueueOutbox } from '@/domain/offline/outbox';
import { useTripStore } from '@/store/useTripStore';
import { createForegroundPoller, PollHttpError, parseRetryAfter } from '@/domain/network/runtime';
import { isIncidentView, reconcileIncidentSnapshot, type IncidentVoteState } from '@/domain/crowd/incidentReceiver';
import type { IncidentEventPayload, IncidentView } from '@/domain/crowd/incidentAggregator';
import { getAnonymousCrowdDeviceId } from '@/domain/crowd/lease';

const INCIDENT_CHANNEL = 'traintracks:incidents';

export interface UseIncidentListenerResult {
    activeIncidents: IncidentView[];
    hasActiveIncident: boolean;
    voteResolve: (incidentId: string) => Promise<IncidentVoteState>;
    voteStates: Record<string, IncidentVoteState>;
    channelStatus: string;
    reconciliationError: string | null;
}

export function useIncidentListener(): UseIncidentListenerResult {
    const selectedLine = useTripStore((state) => state.selectedLine);
    const [incidents, setIncidents] = useState<IncidentView[]>([]);
    const [channelStatus, setChannelStatus] = useState('connecting');
    const [reconciliationError, setReconciliationError] = useState<string | null>(null);
    const [voteStates, setVoteStates] = useState<Record<string, IncidentVoteState>>({});
    const votingRef = useRef(new Map<string, Promise<IncidentVoteState>>());
    const reconcileRef = useRef<() => void>(() => {});
    const mountedRef = useRef(false);
    const [active, setActive] = useState(() => typeof document === 'undefined' || (!document.hidden && navigator.onLine));

    useEffect(() => {
        mountedRef.current = true;
        const activity = () => setActive(!document.hidden && navigator.onLine);
        document.addEventListener('visibilitychange', activity);
        window.addEventListener('online', activity);
        window.addEventListener('offline', activity);
        return () => {
            mountedRef.current = false;
            document.removeEventListener('visibilitychange', activity);
            window.removeEventListener('online', activity);
            window.removeEventListener('offline', activity);
        };
    }, []);

    useEffect(() => {
        if (!selectedLine || !active) { setChannelStatus('idle'); return; }
        let disposed = false;
        const eventsReceivedAt = new Map<string, number>();
        const eventVersions = new Map<string, number>();
        const poller = createForegroundPoller({
            intervalMs: 60_000,
            isActive: () => !disposed && !document.hidden && navigator.onLine,
            run: async (signal, isCurrent) => {
                const startedAt = Date.now();
                const response = await fetch(`/api/incidents?line=${selectedLine}`, {
                    signal, cache: 'no-store', headers: { Accept: 'application/json' },
                });
                if (!response.ok) throw new PollHttpError(response.status, parseRetryAfter(response.headers.get('Retry-After')));
                const payload = await response.json() as { ok?: boolean; incidents?: unknown[] };
                if (!payload.ok || !Array.isArray(payload.incidents)) throw new Error('Invalid incident snapshot.');
                if (!isCurrent()) return;
                const incoming = payload.incidents.filter(isIncidentView).filter((incident) => incident.lineId === selectedLine);
                setIncidents((current) => reconcileIncidentSnapshot(current, incoming, startedAt, eventsReceivedAt));
                setReconciliationError(null);
            },
            onError: () => setReconciliationError('Incident reconciliation temporarily unavailable.'),
        });
        reconcileRef.current = () => poller.wake(true);
        const supabase = createClient();
        const channel = supabase.channel(INCIDENT_CHANNEL, { config: { broadcast: { self: false } } });
        const handleEvent = ({ payload }: { payload: IncidentEventPayload }) => {
            if (disposed || !isIncidentView(payload?.incident) || payload.incident.lineId !== selectedLine) return;
            const incident = payload.incident;
            const version = Date.parse(payload.generatedAt);
            if (!Number.isFinite(version) || version < (eventVersions.get(incident.id) ?? 0)) return;
            if (eventsReceivedAt.size >= 500 && !eventsReceivedAt.has(incident.id)) {
                const oldest = eventsReceivedAt.keys().next().value!;
                eventsReceivedAt.delete(oldest); eventVersions.delete(oldest);
            }
            eventsReceivedAt.set(incident.id, Date.now()); eventVersions.set(incident.id, version);
            setIncidents((current) => [...current.filter((item) => item.id !== incident.id), incident]
                .filter((item) => item.status === 'CONFIRMED' && Date.parse(item.expiresAt) > Date.now()));
        };
        channel.on('broadcast', { event: 'incident_confirmed' }, handleEvent);
        channel.on('broadcast', { event: 'incident_updated' }, handleEvent);
        channel.on('broadcast', { event: 'incident_resolved' }, handleEvent);
        channel.subscribe((status: string) => {
            if (disposed) return;
            setChannelStatus(status === 'SUBSCRIBED' ? 'live' : status.toLowerCase());
            if (status === 'SUBSCRIBED') poller.wake(true);
        });
        poller.wake();
        const prune = window.setInterval(() => setIncidents((current) => current.filter(
            (incident) => Date.parse(incident.expiresAt) > Date.now(),
        )), 5000);
        return () => {
            disposed = true; poller.stop(); reconcileRef.current = () => {};
            window.clearInterval(prune); void supabase.removeChannel(channel);
        };
    }, [active, selectedLine]);

    const voteResolve = useCallback((incidentId: string): Promise<IncidentVoteState> => {
        const pending = votingRef.current.get(incidentId);
        if (pending) return pending;
        const publish = (state: IncidentVoteState) => {
            if (mountedRef.current) setVoteStates((current) => ({ ...current, [incidentId]: state }));
            return state;
        };
        publish('pending');
        const vote = (async (): Promise<IncidentVoteState> => {
            const deviceId = await getAnonymousCrowdDeviceId();
            if (!deviceId) return publish('error');
            const body = { incidentId, deviceId };
            try {
                const response = await fetch('/api/incidents/resolve', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' }, cache: 'no-store',
                    body: JSON.stringify(body), signal: AbortSignal.timeout(10_000),
                });
                if (response.ok) {
                    const result = await response.json().catch(() => null) as { ok?: boolean } | null;
                    if (!result?.ok) return publish('error');
                    reconcileRef.current(); return publish('confirmed');
                }
                if (response.status !== 408 && response.status !== 429 && response.status < 500) return publish('error');
            } catch { /* Retain retryable votes below. */ }
            try {
                await enqueueOutbox('incident_vote', '/api/incidents/resolve', body, `${incidentId}:${deviceId}`);
                return publish('queued');
            } catch { return publish('error'); }
        })();
        votingRef.current.set(incidentId, vote);
        void vote.finally(() => votingRef.current.delete(incidentId));
        return vote;
    }, []);
    const activeIncidents = incidents.filter((incident) => incident.lineId === selectedLine
        && incident.status === 'CONFIRMED' && Date.parse(incident.expiresAt) > Date.now());
    return { activeIncidents, hasActiveIncident: activeIncidents.length > 0,
        voteResolve, voteStates, channelStatus, reconciliationError };
}
