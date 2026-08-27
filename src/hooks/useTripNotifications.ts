import { useCallback, useEffect, useRef, useState } from 'react';
import { useTripStore } from '@/store/useTripStore';
import { LineId, Station } from '@/types';
import { JourneyStatusCode } from '@/domain/journey/types';

interface TripNotificationState {
    statusCode?: JourneyStatusCode;
    transferTargetLineId?: LineId | null;
}

export function useTripNotifications(
    statusText: string,
    displayStation: Station | null,
    state: TripNotificationState = {},
) {
    const { notificationPreference, destination, isMuted } = useTripStore();
    const lastNotifiedStatus = useRef<string>('');
    const [swRegistration, setSwRegistration] = useState<ServiceWorkerRegistration | null>(null);
    const [permission, setPermission] = useState<NotificationPermission>('default');

    useEffect(() => {
        if (typeof window !== 'undefined' && 'Notification' in window) {
            setPermission(Notification.permission);
        }

        if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
            navigator.serviceWorker.ready.then((registration) => {
                setSwRegistration(registration);
            });
        }
    }, []);

    const sendNotification = useCallback((title: string, body: string, vibratePattern: number | number[] = [200, 100, 200]) => {
        if (isMuted || notificationPreference === 'none') return;
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
            navigator.vibrate(vibratePattern);
        }

        if (typeof window === 'undefined' || Notification.permission !== 'granted') return;

        const options = {
            body,
            icon: '/gps-markers/lrt1.png',
            tag: 'train-tracks-alert',
            requireInteraction: true,
        };

        if (swRegistration) {
            swRegistration.showNotification(title, {
                ...options,
                silent: false,
            });
            return;
        }

        try {
            new Notification(title, options);
        } catch (error) {
            console.error('Notification failed', error);
        }
    }, [isMuted, notificationPreference, swRegistration]);

    useEffect(() => {
        if (!statusText || !displayStation) return;

        const uniqueKey = `${state.statusCode ?? statusText}-${displayStation.id}-${state.transferTargetLineId ?? ''}`;
        if (lastNotifiedStatus.current === uniqueKey) return;

        let shouldNotify = false;
        let title = '';
        let body = '';
        let vibratePattern: number | number[] = [200];

        if (state.statusCode === 'AT_STATION' && displayStation.id === destination?.id) {
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

        if (!shouldNotify) return;

        sendNotification(title, body, vibratePattern);
        lastNotifiedStatus.current = uniqueKey;
    }, [statusText, displayStation, destination, notificationPreference, sendNotification, state.statusCode, state.transferTargetLineId]);

    const requestPermission = useCallback(async () => {
        if (typeof window === 'undefined' || !('Notification' in window)) return;

        const result = await Notification.requestPermission();
        setPermission(result);
    }, []);

    return {
        permission,
        requestPermission
    };
}
