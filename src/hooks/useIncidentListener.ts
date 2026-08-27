'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { enqueueOutbox } from '@/domain/offline/outbox';
import { useTripStore } from '@/store/useTripStore';
import type { IncidentEventName, IncidentView } from '@/domain/crowd/incidentAggregator';

const INCIDENT_CHANNEL = 'traintracks:incidents';
const DEVICE_ID_KEY = 'traintracks_anonymous_device_id';

function getDeviceId(): string {
    if (typeof window === 'undefined') return 'server';

    let id = window.localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
        id = typeof crypto !== 'undefined' && crypto.randomUUID
            ? crypto.randomUUID()
            : `tt-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        window.localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
}

export interface UseIncidentListenerResult {
    activeIncidents: IncidentView[];
    hasActiveIncident: boolean;
    voteResolve: (incidentId: string) => void;
    channelStatus: string;
}

export function useIncidentListener(): UseIncidentListenerResult {
    const selectedLine = useTripStore((state) => state.selectedLine);
    const [incidents, setIncidents] = useState<IncidentView[]>([]);
    const [channelStatus, setChannelStatus] = useState('connecting');
    const votingRef = useRef<Set<string>>(new Set());

    const reconcile = useCallback(async () => {
        if (!selectedLine) {
            setIncidents([]);
            return;
        }

        const response = await fetch(`/api/incidents?line=${selectedLine}`, {
            cache: 'no-store',
            headers: { Accept: 'application/json' },
        });
        if (!response.ok) return;

        const payload = await response.json() as { ok?: boolean; incidents?: IncidentView[] };
        if (payload.ok && Array.isArray(payload.incidents)) {
            setIncidents(payload.incidents);
        }
    }, [selectedLine]);

    useEffect(() => {
        let cancelled = false;
        const refresh = () => {
            if (!cancelled && !document.hidden && navigator.onLine) {
                void reconcile();
            }
        };

        refresh();
        const interval = window.setInterval(refresh, 60_000);
        window.addEventListener('online', refresh);
        document.addEventListener('visibilitychange', refresh);

        return () => {
            cancelled = true;
            window.clearInterval(interval);
            window.removeEventListener('online', refresh);
            document.removeEventListener('visibilitychange', refresh);
        };
    }, [reconcile]);

    useEffect(() => {
        const supabase = createClient();
        const channel = supabase.channel(INCIDENT_CHANNEL, {
            config: { broadcast: { self: false } },
        });

        const handleEvent = ({
            payload,
        }: {
            payload: { event: IncidentEventName; incident: IncidentView };
        }) => {
            const incident = payload?.incident;
            if (!incident) return;

            if (payload.event === 'incident_resolved') {
                setIncidents((current) => current.filter((item) => item.id !== incident.id));
                return;
            }

            setIncidents((current) => {
                const withoutIncident = current.filter((item) => item.id !== incident.id);
                return [...withoutIncident, incident]
                    .sort((left, right) => Date.parse(right.confirmedAt ?? right.firstReportedAt)
                        - Date.parse(left.confirmedAt ?? left.firstReportedAt));
            });
        };

        channel.on('broadcast', { event: 'incident_confirmed' }, handleEvent);
        channel.on('broadcast', { event: 'incident_updated' }, handleEvent);
        channel.on('broadcast', { event: 'incident_resolved' }, handleEvent);
        channel.subscribe((status: string) => {
            setChannelStatus(status === 'SUBSCRIBED' ? 'live' : status.toLowerCase());
            if (status === 'SUBSCRIBED') void reconcile();
        });

        return () => {
            void supabase.removeChannel(channel);
        };
    }, [reconcile]);

    const activeIncidents = selectedLine
        ? incidents.filter((incident) => (
            incident.lineId === selectedLine && incident.status === 'CONFIRMED'
        ))
        : [];

    const voteResolve = useCallback((incidentId: string) => {
        if (votingRef.current.has(incidentId)) return;
        votingRef.current.add(incidentId);

        const deviceId = getDeviceId();
        const body = { incidentId, deviceId };
        void fetch('/api/incidents/resolve', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            cache: 'no-store',
            body: JSON.stringify(body),
        }).then(async (response) => {
            if (!response.ok) {
                await enqueueOutbox(
                    'incident_vote',
                    '/api/incidents/resolve',
                    body,
                    `${incidentId}:${deviceId}`,
                );
            } else {
                await reconcile();
            }
        }).catch(() => enqueueOutbox(
            'incident_vote',
            '/api/incidents/resolve',
            body,
            `${incidentId}:${deviceId}`,
        )).finally(() => {
            votingRef.current.delete(incidentId);
        });
    }, [reconcile]);

    return {
        activeIncidents,
        hasActiveIncident: activeIncidents.length > 0,
        voteResolve,
        channelStatus,
    };
}
