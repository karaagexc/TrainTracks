"use client";

import { useEffect, useState } from "react";
import { useTripStore } from "@/store/useTripStore";
import { useSmartLocation } from "@/hooks/useSmartLocation";
import { MapPinOff } from "lucide-react";

const ALLOWED_BOUNDS = {
    minLat: 13.4,
    maxLat: 16.1,
    minLon: 120.0,
    maxLon: 122.1,
};

function isInAllowedRegion(lat: number, lon: number): boolean {
    return (
        lat >= ALLOWED_BOUNDS.minLat &&
        lat <= ALLOWED_BOUNDS.maxLat &&
        lon >= ALLOWED_BOUNDS.minLon &&
        lon <= ALLOWED_BOUNDS.maxLon
    );
}

export function RegionGuard({ children }: { children: React.ReactNode }) {
    const { isDevMode } = useTripStore();
    const { location, locationStatus } = useSmartLocation();
    const [status, setStatus] = useState<'checking' | 'allowed' | 'blocked'>('checking');

    useEffect(() => {
        if (isDevMode) {
            setStatus('allowed');
            return;
        }

        if (!location || locationStatus.isBlocking) {
            setStatus('allowed');
            return;
        }

        setStatus(isInAllowedRegion(location.latitude, location.longitude) ? 'allowed' : 'blocked');
    }, [isDevMode, location, locationStatus.isBlocking]);

    if (status === 'checking') return null;

    if (status === 'blocked') {
        return (
            <div
                className="fixed inset-0 z-[200] bg-zinc-950 flex flex-col items-center justify-center text-center px-8 gap-5"
                style={{ fontFamily: 'var(--font-cabin), system-ui, sans-serif' }}
            >
                <MapPinOff className="w-16 h-16 text-zinc-600" strokeWidth={1.5} />
                <h1 className="text-2xl font-black uppercase tracking-tight text-white">
                    Region Unavailable
                </h1>
                <p className="text-zinc-400 max-w-xs text-base leading-relaxed">
                    TrainTracks is currently available only in
                    <span className="text-white font-semibold"> Metro Manila</span>,
                    <span className="text-white font-semibold"> Central Luzon</span>, and
                    <span className="text-white font-semibold"> CALABARZON</span>.
                </p>
                <p className="text-zinc-500 text-sm max-w-xs">
                    Please move to a supported region to use this app.
                </p>
                <div className="absolute bottom-8 text-xs text-zinc-700 font-mono tracking-widest">
                    ERROR_REGION_RESTRICTED
                </div>
            </div>
        );
    }

    return <>{children}</>;
}
