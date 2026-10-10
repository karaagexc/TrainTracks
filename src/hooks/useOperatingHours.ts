import { useState, useEffect } from 'react';
import { useTripStore } from '@/store/useTripStore';
import { getTrainServiceAvailability } from '@/domain/predictions/engine';
import { isRailLine } from '@/domain/railway';

export function useOperatingHours() {
    const [isOpen, setIsOpen] = useState(true);
    const isDevMode = useTripStore((state) => state.isDevMode);
    const selectedLine = useTripStore((state) => state.selectedLine);

    useEffect(() => {
        const checkTime = () => {
            // BYPASS:
            // 1. Local Development (npm run dev)
            // 2. Admin/Dev Mode (Unlocked via /admin PIN)
            if (isDevMode || process.env.NODE_ENV === 'development') {
                setIsOpen(true);
                return;
            }

            setIsOpen(getTrainServiceAvailability({
                lineId: selectedLine && isRailLine(selectedLine) ? selectedLine : null,
            }));
        };

        checkTime(); // Initial check
        const interval = setInterval(checkTime, 60000); // Check every minute

        return () => clearInterval(interval);
    }, [isDevMode, selectedLine]);

    return isOpen;
}
