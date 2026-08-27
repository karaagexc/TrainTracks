import { useState, useEffect } from 'react';
import { useTripStore } from '@/store/useTripStore';

export function useOperatingHours() {
    const [isOpen, setIsOpen] = useState(true);
    const { isDevMode } = useTripStore();

    useEffect(() => {
        const checkTime = () => {
            // BYPASS:
            // 1. Local Development (npm run dev)
            // 2. Admin/Dev Mode (Unlocked via /admin PIN)
            if (isDevMode || process.env.NODE_ENV === 'development') {
                setIsOpen(true);
                return;
            }

            const now = new Date();
            const hour = now.getHours();
            const minute = now.getMinutes();
            const timeInMinutes = hour * 60 + minute;

            // OPEN: 4:30 AM (270 min)
            // CLOSE: 11:20 PM (23:20 -> 1400 min)
            const openTime = 4 * 60 + 30;
            const closeTime = 23 * 60 + 20;

            if (timeInMinutes >= openTime && timeInMinutes < closeTime) {
                setIsOpen(true);
            } else {
                setIsOpen(false);
            }
        };

        checkTime(); // Initial check
        const interval = setInterval(checkTime, 60000); // Check every minute

        return () => clearInterval(interval);
    }, [isDevMode]);

    return isOpen;
}
