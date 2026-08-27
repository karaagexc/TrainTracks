'use client';

import { useEffect, useState } from 'react';

export function useMinuteClock(): Date {
    const [now, setNow] = useState(() => new Date());

    useEffect(() => {
        let interval: ReturnType<typeof setInterval> | null = null;
        const msUntilNextMinute = 60_000 - (Date.now() % 60_000);

        const timeout = setTimeout(() => {
            setNow(new Date());
            interval = setInterval(() => setNow(new Date()), 60_000);
        }, msUntilNextMinute);

        return () => {
            clearTimeout(timeout);
            if (interval) clearInterval(interval);
        };
    }, []);

    return now;
}
