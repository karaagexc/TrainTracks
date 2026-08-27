'use client';

import { useEffect, useRef, useState } from 'react';
import { useTripStore } from '@/store/useTripStore';

interface CompassOrientationEvent extends DeviceOrientationEvent {
    webkitCompassHeading?: number;
}

interface PermissionCapableOrientationConstructor {
    requestPermission?: () => Promise<'granted' | 'denied'>;
}

function getAngularDifference(a: number, b: number): number {
    return ((a - b + 540) % 360) - 180;
}

export function useDeviceOrientation() {
    const isGpsOverride = useTripStore((state) => state.isGpsOverride);
    const simulatedHeading = useTripStore((state) => state.simulatedHeading);
    const [heading, setHeading] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);
    const smoothedRef = useRef<number | null>(null);

    useEffect(() => {
        if (isGpsOverride) {
            const overrideHeading = simulatedHeading ?? 0;
            setHeading(overrideHeading);
            smoothedRef.current = overrideHeading;
            return;
        }

        const alpha = 0.3;
        let disposed = false;
        let frame: number | null = null;
        let pendingHeading: number | null = null;

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

            if (typeof compassEvent.webkitCompassHeading === 'number') {
                compass = compassEvent.webkitCompassHeading;
            } else if (event.alpha !== null) {
                compass = (360 - event.alpha) % 360;
            }

            if (compass === null) return;
            pendingHeading = compass;
            if (frame === null) frame = window.requestAnimationFrame(commitHeading);
        };

        const addOrientationListener = () => {
            const hasAbsolute = 'ondeviceorientationabsolute' in window;
            if (hasAbsolute) {
                window.addEventListener('deviceorientationabsolute', handleOrientation);
            } else {
                window.addEventListener('deviceorientation', handleOrientation);
            }
        };

        const requestAccess = async () => {
            const orientationConstructor =
                DeviceOrientationEvent as unknown as PermissionCapableOrientationConstructor;

            if (typeof orientationConstructor.requestPermission !== 'function') {
                addOrientationListener();
                return;
            }

            try {
                const permission = await orientationConstructor.requestPermission();
                if (disposed) return;
                if (permission === 'granted') {
                    window.addEventListener('deviceorientation', handleOrientation);
                } else {
                    setError('Permission denied');
                }
            } catch (caught) {
                if (!disposed) {
                    setError(caught instanceof Error ? caught.message : 'Orientation unavailable');
                }
            }
        };

        void requestAccess();

        return () => {
            disposed = true;
            if (frame !== null) window.cancelAnimationFrame(frame);
            window.removeEventListener('deviceorientationabsolute', handleOrientation);
            window.removeEventListener('deviceorientation', handleOrientation);
        };
    }, [isGpsOverride, simulatedHeading]);

    return { heading, error };
}