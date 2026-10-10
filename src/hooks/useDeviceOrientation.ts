'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTripStore } from '@/store/useTripStore';

interface CompassOrientationEvent extends DeviceOrientationEvent {
    webkitCompassHeading?: number;
}

interface PermissionCapableOrientationConstructor {
    requestPermission?: () => Promise<'granted' | 'denied'>;
}

export type CompassStatus = 'unavailable' | 'prompt' | 'requesting' | 'waiting' | 'active' | 'denied' | 'error';

function getAngularDifference(a: number, b: number): number {
    return ((a - b + 540) % 360) - 180;
}

export function useDeviceOrientation() {
    const isGpsOverride = useTripStore((state) => state.isGpsOverride);
    const simulatedHeading = useTripStore((state) => state.simulatedHeading);
    const [heading, setHeading] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [status, setStatus] = useState<CompassStatus>('waiting');
    const smoothedRef = useRef<number | null>(null);
    const requestRef = useRef<() => Promise<boolean>>(async () => false);
    const requestPermission = useCallback(() => requestRef.current(), []);

    useEffect(() => {
        if (isGpsOverride) {
            const overrideHeading = simulatedHeading ?? 0;
            setHeading(overrideHeading);
            setStatus('active');
            setError(null);
            smoothedRef.current = overrideHeading;
            requestRef.current = async () => true;
            return;
        }

        setHeading(null);
        smoothedRef.current = null;
        setError(null);
        if (typeof window.DeviceOrientationEvent === 'undefined') {
            setStatus('unavailable');
            requestRef.current = async () => false;
            return;
        }

        const alpha = 0.3;
        let disposed = false;
        let frame: number | null = null;
        let pendingHeading: number | null = null;
        let waitingTimer: ReturnType<typeof setTimeout> | null = null;
        let listening = false;
        let requesting = false;

        const commitHeading = () => {
            frame = null;
            if (disposed || pendingHeading === null) return;

            const incoming = pendingHeading;
            pendingHeading = null;
            const previous = smoothedRef.current;
            const smoothed = previous === null
                ? incoming
                : (previous + alpha * getAngularDifference(incoming, previous) + 360) % 360;
            smoothedRef.current = smoothed;
            setStatus('active');

            setHeading((current) => {
                if (current !== null && Math.abs(getAngularDifference(smoothed, current)) < 0.25) {
                    return current;
                }
                return smoothed;
            });
        };

        const handleOrientation = (event: DeviceOrientationEvent) => {
            const compassEvent = event as CompassOrientationEvent;
            let compass: number | null = null;

            if (typeof compassEvent.webkitCompassHeading === 'number' && Number.isFinite(compassEvent.webkitCompassHeading)) {
                compass = compassEvent.webkitCompassHeading;
            } else if (event.absolute && event.alpha !== null && Number.isFinite(event.alpha)) {
                compass = (360 - event.alpha) % 360;
            }

            if (compass === null) return;
            pendingHeading = compass;
            if (frame === null) frame = window.requestAnimationFrame(commitHeading);
        };

        const addOrientationListener = () => {
            if (listening || disposed) return;
            listening = true;
            setStatus('waiting');
            const hasAbsolute = 'ondeviceorientationabsolute' in window;
            if (hasAbsolute) {
                window.addEventListener('deviceorientationabsolute', handleOrientation);
            } else {
                window.addEventListener('deviceorientation', handleOrientation);
            }
            waitingTimer = setTimeout(() => {
                if (!disposed && smoothedRef.current === null) setStatus('unavailable');
            }, 5000);
        };

        const requestAccess = async () => {
            const orientationConstructor =
                window.DeviceOrientationEvent as unknown as PermissionCapableOrientationConstructor;

            if (typeof orientationConstructor.requestPermission !== 'function') {
                addOrientationListener();
                return true;
            }

            if (requesting) return false;
            requesting = true;
            setStatus('requesting');
            setError(null);

            try {
                const permission = await orientationConstructor.requestPermission();
                if (disposed) return false;
                if (permission === 'granted') {
                    addOrientationListener();
                    return true;
                } else {
                    setError('Permission denied');
                    setStatus('denied');
                    return false;
                }
            } catch (caught) {
                if (!disposed) {
                    setError(caught instanceof Error ? caught.message : 'Orientation unavailable');
                    setStatus('error');
                }
                return false;
            } finally {
                requesting = false;
            }
        };

        requestRef.current = requestAccess;
        const constructor = window.DeviceOrientationEvent as unknown as PermissionCapableOrientationConstructor;
        if (typeof constructor.requestPermission === 'function') setStatus('prompt');
        else addOrientationListener();

        return () => {
            disposed = true;
            requestRef.current = async () => false;
            if (waitingTimer !== null) clearTimeout(waitingTimer);
            if (frame !== null) window.cancelAnimationFrame(frame);
            window.removeEventListener('deviceorientationabsolute', handleOrientation);
            window.removeEventListener('deviceorientation', handleOrientation);
        };
    }, [isGpsOverride, simulatedHeading]);

    return { heading, error, status, requestPermission };
}
