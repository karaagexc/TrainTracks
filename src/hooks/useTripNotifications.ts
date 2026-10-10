import { useCallback, useEffect, useRef, useState } from 'react';
import { useTripStore } from '@/store/useTripStore';
import { LineId, Station } from '@/types';
import { JourneyStatusCode } from '@/domain/journey/types';

interface TripNotificationState {
    statusCode?: JourneyStatusCode;
    transferTargetLineId?: LineId | null;
}

export async function deliverTripNotification(
    registration: ServiceWorkerRegistration | null,
    title: string,
    body: string,
    eventKey: string,
): Promise<boolean> {
    if (typeof window === 'undefined' || !('Notification' in window) || Notification.permission !== 'granted') return false;
    const options = { body, icon: '/gps-markers/lrt1.png', tag: eventKey, requireInteraction: true };
    try {
        if (registration) await registration.showNotification(title, { ...options, silent: false });
        else new Notification(title, options);
        return true;
    } catch (error) {
        console.error('Notification failed', error);
        return false;
    }
}

export function useTripNotifications(
    statusText: string,
    displayStation: Station | null,
    state: TripNotificationState = {},
) {
    const notificationPreference = useTripStore((store) => store.notificationPreference);
    const destination = useTripStore((store) => store.destination);
    const isMuted = useTripStore((store) => store.isMuted);
    const tripId = useTripStore((store) => store.journeySnapshot.tripId);
    const edgeIndex = useTripStore((store) => store.journeySnapshot.activeEdgeIndex);
    const notifiedEvents = useRef(new Set<string>());
    const pendingEvents = useRef(new Set<string>());
    const vibratedEvents = useRef(new Set<string>());
    const [swRegistration, setSwRegistration] = useState<ServiceWorkerRegistration | null>(null);
    const [permission, setPermission] = useState<NotificationPermission>('default');

    useEffect(() => {
        if (typeof window !== 'undefined' && 'Notification' in window) {
            setPermission(Notification.permission);
        }

        if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
            let disposed = false;
            void navigator.serviceWorker.ready.then((registration) => {
                if (disposed) return;
                setSwRegistration(registration);
            }).catch((error) => console.warn('Notification worker unavailable', error));
            return () => { disposed = true; };
        }
    }, []);

    const sendNotification = useCallback((title: string, body: string, eventKey: string) => {
        if (isMuted || notificationPreference === 'none') return Promise.resolve(false);
        return deliverTripNotification(swRegistration, title, body, eventKey);
    }, [isMuted, notificationPreference, swRegistration]);

    useEffect(() => {
        if (!tripId || !statusText || !displayStation) return;

        const uniqueKey = `${tripId}:${edgeIndex}:${state.statusCode ?? statusText}:${displayStation.id}:${state.transferTargetLineId ?? ''}`;
        if (notifiedEvents.current.has(uniqueKey) || pendingEvents.current.has(uniqueKey)) return;
        try {
            if (sessionStorage.getItem(`traintracks-notified:${uniqueKey}`)) return;
        } catch { /* Storage can be unavailable in private browsing. */ }

        let shouldNotify = false;
        let title = '';
        let body = '';
        let vibratePattern: number | number[] = [200];

        if (state.statusCode === 'ARRIVED' && displayStation.id === destination?.id) {
            if (notificationPreference !== 'none') {
                shouldNotify = true;
                title = 'You have arrived!';
                body = `Welcome to ${displayStation.name}. Thank you for riding.`;
                vibratePattern = [1000, 500, 1000, 500, 1000, 500, 1000, 500, 1000];
            }
        } else if (notificationPreference === 'all') {
            if (state.statusCode === 'APPROACHING_STATION') {
                shouldNotify = true;
                title = 'Approaching Station';
                body = `Now approaching ${displayStation.name}.`;
                vibratePattern = [500];
            } else if (state.statusCode === 'AT_STATION') {
                shouldNotify = true;
                title = 'Arrived at Station';
                body = `Now at ${displayStation.name}.`;
                vibratePattern = [500];
            } else if (state.statusCode === 'TRANSFER_ACTIVE' && state.transferTargetLineId) {
                const targetLine = state.transferTargetLineId;
                shouldNotify = true;
                title = `Transfer to ${targetLine}`;
                body = `Transfer at ${displayStation.name} for ${targetLine}.`;
                vibratePattern = [200, 100, 200, 100, 500];
            }
        }

        if (!shouldNotify || isMuted) return;
        if (!vibratedEvents.current.has(uniqueKey) && typeof navigator !== 'undefined' && navigator.vibrate) {
            try { navigator.vibrate(vibratePattern); } catch { /* Haptics are optional, never a delivery acknowledgement. */ }
            vibratedEvents.current.add(uniqueKey);
        }
        pendingEvents.current.add(uniqueKey);
        void sendNotification(title, body, uniqueKey).then((delivered) => {
            if (!delivered) return;
            notifiedEvents.current.add(uniqueKey);
            try { sessionStorage.setItem(`traintracks-notified:${uniqueKey}`, '1'); } catch { /* Best-effort reload deduplication. */ }
        }).finally(() => pendingEvents.current.delete(uniqueKey));
    }, [tripId, edgeIndex, statusText, displayStation, destination, notificationPreference, isMuted, permission, sendNotification, state.statusCode, state.transferTargetLineId]);

    const requestPermission = useCallback(async () => {
        if (typeof window === 'undefined' || !('Notification' in window)) return;

        try {
            const result = await Notification.requestPermission();
            setPermission(result);
        } catch (error) {
            console.warn('Notification permission failed', error);
            setPermission(Notification.permission);
        }
    }, []);

    return {
        permission,
        requestPermission
    };
}
