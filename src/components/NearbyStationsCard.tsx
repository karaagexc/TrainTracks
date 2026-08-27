"use client";

import { useSmartLocation } from "@/hooks/useSmartLocation";
import { Navigation, MapPin, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";
import { useTripStore } from "@/store/useTripStore";
import { getLineColor, getStationBadge } from "@/utils/stationUtils";
import { getStationProximity } from "@/domain/location/stationProximity";
import { getOperationalMode } from "@/domain/railway";

export function NearbyStationsCard() {
    const { location } = useSmartLocation();
    const { setOrigin, isDevMode, line7Mode, transitMode: selectedTransitMode } = useTripStore();
    const transitMode = isDevMode ? selectedTransitMode : 'train';
    const isBusMode = transitMode === 'bus';

    // Initialize with safe default values to prevent hydration mismatches
    // caused by conditional rendering of skeletons.
    const [nearest, setNearest] = useState<{ station: any; distance: number }>({
        station: { name: "Initializing...", lineId: "LRT1", order: 1 },
        distance: 0.1
    });
    const [isReady, setIsReady] = useState(false);

    useEffect(() => {
        if (!location) return;

        try {
            const closest = getStationProximity({
                location,
                mode: getOperationalMode(isDevMode, line7Mode),
                line7Mode,
                transitMode,
                radiusKm: 0.25,
            }).nearest;

            if (closest) {
                setNearest(closest);
                setIsReady(true);
            }
        } catch (err) {
            console.error("Calculation Error:", err);
        }
    }, [location, isDevMode, line7Mode, transitMode]);

    // Derived values with safe fallbacks
    const lineColor = getLineColor(nearest.station.lineId);
    const badge = getStationBadge(nearest.station.lineId, nearest.station.order);
    const isNear = nearest.distance <= 0.25;
    return (
        <div className="w-full bg-zinc-900 rounded-3xl p-6 shadow-xl border border-zinc-800 text-white">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-blue-500/10 text-blue-500 flex items-center justify-center border border-blue-500/20 shadow-lg shadow-blue-500/5">
                        <Navigation className="w-6 h-6 fill-current" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-bold text-zinc-300">{isBusMode ? "Bus Stops Near You" : "Stations Near You"}</span>
                            <ChevronDown className="w-3 h-3 text-zinc-500" />
                        </div>
                        <div className="flex items-center gap-2">
                            <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-bold", lineColor, nearest.station.lineId === 'MRT3' ? 'text-black' : 'text-white')}>
                                {badge}
                            </span>
                            <span className="font-bold text-lg leading-none">{nearest.station.name}</span>
                        </div>
                        <div className="text-xs text-zinc-500 mt-1 font-medium">
                            {isReady ? `${(nearest.distance * 1000).toFixed(0)}m away` : "Locating..."}
                        </div>
                    </div>
                </div>

                <div className="w-10 h-10 rounded-xl border border-orange-500/30 bg-orange-500/10 flex items-center justify-center hover:bg-orange-500/20 transition-colors">
                    <MapPin className="w-5 h-5 text-orange-500" />
                </div>
            </div>

            <button
                disabled={!isNear}
                onClick={() => setOrigin(nearest.station)}
                className={cn(
                    "w-full py-3 rounded-xl font-bold text-sm transition-all",
                    isNear
                        ? "bg-white text-black hover:bg-zinc-200 shadow-lg shadow-white/10"
                        : "bg-zinc-800 text-zinc-500 cursor-not-allowed border border-zinc-700"
                )}
            >
                {isNear ? "Start Trip" : isBusMode ? "Move Closer to Bus Stop" : "Move Closer to Station"}
            </button>
        </div>
    );
}
