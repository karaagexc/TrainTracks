import { useCallback, useEffect, useRef, useState } from 'react';

export function useWakeLock(active = true) {
    const sentinelRef = useRef<WakeLockSentinel | null>(null);
    const [isHeld, setIsHeld] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const releaseWakeLock = useCallback(async () => {
        const sentinel = sentinelRef.current;
        sentinelRef.current = null;
        if (sentinel && !sentinel.released) await sentinel.release().catch(() => undefined);
        setIsHeld(false);
    }, []);

    const requestWakeLock = useCallback(async () => {
        if (!active || document.visibilityState !== 'visible' || !('wakeLock' in navigator)) return;
        if (sentinelRef.current && !sentinelRef.current.released) return;
        try {
            const sentinel = await navigator.wakeLock.request('screen');
            sentinelRef.current = sentinel;
            setIsHeld(true);
            setError(null);
            sentinel.addEventListener('release', () => {
                if (sentinelRef.current === sentinel) sentinelRef.current = null;
                setIsHeld(false);
            }, { once: true });
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Unable to keep the screen awake.');
        }
    }, [active]);

    useEffect(() => {
        if (active) void requestWakeLock();
        else void releaseWakeLock();

        const onVisibility = () => {
            if (!active || document.visibilityState !== 'visible') void releaseWakeLock();
            else void requestWakeLock();
        };
        document.addEventListener('visibilitychange', onVisibility);
        return () => {
            document.removeEventListener('visibilitychange', onVisibility);
            void releaseWakeLock();
        };
    }, [active, releaseWakeLock, requestWakeLock]);

    return { wakeLock: sentinelRef.current, isHeld, error, requestWakeLock, releaseWakeLock };
}