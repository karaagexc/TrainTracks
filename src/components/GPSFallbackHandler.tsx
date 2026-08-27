"use client";

import { useEffect, useState } from "react";
import { useTripStore } from "@/store/useTripStore";
import { useSmartLocation } from "@/hooks/useSmartLocation";
import { AlertTriangle, MapPin, RefreshCw } from "lucide-react";
import { getNetworkStations } from "@/domain/railway";

export function GPSFallbackHandler() {
    const {
        isDevMode,
        line7Mode,
        setGpsOverride,
        setSimulatedLocation,
    } = useTripStore();

    const {
        isOverride,
        location,
        permissionState,
        isRequestingLocation,
        locationStatus,
        requestLocation,
    } = useSmartLocation();
    const [isOpen, setIsOpen] = useState(false);

    useEffect(() => {
        const hasBlockingIssue = !isOverride && locationStatus.isBlocking && (!locationStatus.isUsable || !location);

        if (hasBlockingIssue) {
            const delay = locationStatus.code === 'checking' ? 2500 : 0;
            const timer = setTimeout(() => setIsOpen(true), delay);
            return () => clearTimeout(timer);
        }

        setIsOpen(false);
    }, [isOverride, location, locationStatus]);

    if (!isOpen) return null;

    const startDevSimulation = () => {
        const sandboxStations = getNetworkStations('sandbox', line7Mode);
        const fallbackStation = sandboxStations.find(station => station.id === 'L1-01') ?? sandboxStations[0];
        if (!fallbackStation) return;

        setSimulatedLocation({
            latitude: fallbackStation.latitude,
            longitude: fallbackStation.longitude,
        });
        setGpsOverride(true);
        setIsOpen(false);
    };

    const title = locationStatus.title;
    const detail = locationStatus.message;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/95 backdrop-blur-xl animate-in fade-in duration-500">
            <div className="w-full max-w-md text-center space-y-6">
                <div className="w-24 h-24 rounded-full bg-red-500/10 flex items-center justify-center mx-auto ring-1 ring-red-500/50 animate-pulse">
                    {permissionState === 'denied' || locationStatus.code === 'insecure_context' ? (
                        <AlertTriangle className="w-10 h-10 text-red-500" />
                    ) : (
                        <MapPin className="w-10 h-10 text-red-500" />
                    )}
                </div>

                <div className="space-y-2">
                    <h1 className="text-2xl font-black text-white tracking-tight">{title}</h1>
                    <p className="text-zinc-400 text-lg leading-relaxed">
                        This app is designed to work <span className="text-white font-bold">automatically</span>.
                    </p>
                    <div className="p-4 bg-zinc-900/50 rounded-xl border border-white/5 mt-4">
                        <p className="text-sm text-zinc-300">
                            {detail}
                        </p>
                        <p className="text-[10px] text-zinc-500 font-mono uppercase tracking-wider mt-3">
                            Permission: {permissionState}
                        </p>
                    </div>
                </div>

                <div className="space-y-3 pt-2">
                    <button
                        onClick={requestLocation}
                        disabled={isRequestingLocation || !locationStatus.canRequest}
                        className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-white text-black py-3 text-sm font-black uppercase tracking-wider disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        <RefreshCw className={`w-4 h-4 ${isRequestingLocation ? 'animate-spin' : ''}`} />
                        {isRequestingLocation ? 'Requesting...' : 'Allow / Retry Location'}
                    </button>

                    {isDevMode && (
                        <button
                            onClick={startDevSimulation}
                            className="w-full rounded-xl bg-zinc-900 text-white py-3 text-sm font-bold uppercase tracking-wider border border-white/10"
                        >
                            Use DevOpts Simulation
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
