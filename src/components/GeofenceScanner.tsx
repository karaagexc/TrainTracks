"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, MapPin, Navigation, RefreshCw } from "lucide-react";
import { useTripStore } from "@/store/useTripStore";
import { useSmartLocation } from "@/hooks/useSmartLocation";
import { getOperationalMode } from "@/domain/railway";
import { getStationProximity } from "@/domain/location/stationProximity";
import { FareSelector } from "@/components/FareSelector";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const GEOFENCE_RADIUS_KM = 0.25;

function getLineTextClass(lineId: string | undefined): string {
    if (lineId === 'LRT1') return 'text-lrt1';
    if (lineId === 'LRT2') return 'text-lrt2';
    if (lineId === 'MRT7') return 'text-[#d46a6a]';
    if (lineId === 'EDSA') return 'text-[#f1e4d1]';
    return 'text-mrt3';
}

function getLineSurfaceClass(lineId: string | undefined): string {
    if (lineId === 'LRT1') return 'bg-lrt1 text-black';
    if (lineId === 'LRT2') return 'bg-lrt2 text-white';
    if (lineId === 'MRT7') return 'bg-mrt7 text-white';
    if (lineId === 'EDSA') return 'bg-[#8b7355] text-white';
    return 'bg-mrt3 text-black';
}

export function GeofenceScanner() {
    const { setOrigin, origin, isDarkMode, line7Mode, isDevMode, transitMode: selectedTransitMode } = useTripStore();
    const {
        location,
        isOverride,
        bridgeName,
        locationStatus,
        isRequestingLocation,
        requestLocation,
        gpsAccuracy,
    } = useSmartLocation();

    const [showFareModal, setShowFareModal] = useState(false);
    const transitMode = isDevMode ? selectedTransitMode : 'train';
    const isBusMode = transitMode === 'bus';
    const previousStationIdRef = useRef<string | null>(null);

    const proximity = useMemo(() => {
        if (origin || !location || !locationStatus.isUsable) {
            return null;
        }

        return getStationProximity({
            location,
            mode: getOperationalMode(isDevMode, line7Mode),
            line7Mode,
            transitMode,
            radiusKm: GEOFENCE_RADIUS_KM,
            accuracyMeters: gpsAccuracy,
            previousStationId: previousStationIdRef.current,
        });
    }, [gpsAccuracy, location, locationStatus.isUsable, origin, line7Mode, isDevMode, transitMode]);

    useEffect(() => {
        if (proximity?.nearest && proximity.conflicts.length === 0) {
            previousStationIdRef.current = proximity.nearest.station.id;
        }
    }, [proximity]);

    const nearest = proximity && proximity.conflicts.length === 0 ? proximity.nearest : null;
    const conflicts = proximity?.conflicts ?? [];
    const loading = !origin && proximity === null;

    const handleRide = (station: any) => {
        setOrigin(station);
        setShowFareModal(true);
    };

    if (loading || !location || !locationStatus.isUsable) {
        const isChecking = locationStatus.code === 'checking';
        return (
            <div className="flex h-full flex-col items-center justify-center space-y-8 bg-black p-6 text-center text-white animate-in fade-in">
                <div className="relative mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-zinc-900">
                    {isChecking && <div className="absolute inset-0 rounded-full border-4 border-lrt1/20 border-t-lrt1 animate-spin" />}
                    {isChecking ? (
                        <MapPin className="h-10 w-10 animate-pulse text-zinc-700" />
                    ) : (
                        <AlertTriangle className="h-10 w-10 text-red-400" />
                    )}
                </div>
                <div className="space-y-2">
                    <h1 className="text-2xl font-bold text-zinc-500">{locationStatus.title}</h1>
                    <p className="max-w-xs text-sm text-zinc-500">{locationStatus.message}</p>
                    {locationStatus.accuracyMeters !== null && (
                        <p className="text-[10px] uppercase tracking-wider text-zinc-700">
                            Accuracy: {Math.round(locationStatus.accuracyMeters)}m
                        </p>
                    )}
                </div>
                {locationStatus.canRequest && (
                    <button
                        onClick={requestLocation}
                        disabled={isRequestingLocation}
                        className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-3 text-xs font-black uppercase tracking-wider text-black disabled:opacity-40"
                    >
                        <RefreshCw className={`h-4 w-4 ${isRequestingLocation ? 'animate-spin' : ''}`} />
                        {isRequestingLocation ? 'Requesting...' : 'Retry Location'}
                    </button>
                )}
                {isOverride && <Badge className="mt-4 border-0 bg-red-500 text-white hover:bg-red-600">SIMULATION ACTIVE</Badge>}
            </div>
        );
    }

    if (nearest && nearest.distance > GEOFENCE_RADIUS_KM && conflicts.length === 0) {
        return (
            <div className="flex min-h-[100dvh] w-full touch-none flex-col items-center justify-center space-y-8 overflow-hidden bg-black p-6 text-center text-white animate-in fade-in">
                <div className="relative mx-auto mt-[-20%] flex h-24 w-24 items-center justify-center rounded-full bg-zinc-900">
                    <div className="absolute inset-0 rounded-full border-4 border-zinc-800" />
                    <Navigation className="h-10 w-10 text-zinc-500" />
                </div>
                <div className="space-y-4">
                    <h1 className="text-xl font-bold uppercase tracking-widest text-zinc-500">{isBusMode ? "Nearest Bus Stop" : "Nearest Station"}</h1>
                    <div className="space-y-1">
                        <div className="text-3xl font-black text-white">{nearest.station.name}</div>
                        <div className={cn("text-lg font-bold", getLineTextClass(nearest.station.lineId))}>
                            {nearest.distance.toFixed(2)} km <span className="ml-1 text-sm font-medium text-zinc-600">away</span>
                        </div>
                    </div>
                </div>
                <p className="max-w-xs text-sm text-zinc-600">Move closer to this {isBusMode ? "bus stop" : "station"} to start.</p>
                {isOverride && <Badge className="mt-4 border-0 bg-red-500 text-white hover:bg-red-600">SIMULATION ACTIVE</Badge>}
            </div>
        );
    }

    return (
        <>
            <div className="flex h-full flex-col items-center justify-center space-y-8 bg-black p-6 text-center text-white">
                <div className="space-y-4">
                    <div className="relative mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-zinc-900">
                        {loading && <div className="absolute inset-0 rounded-full border-4 border-white/20 animate-[spin_3s_linear_infinite]" />}
                        <MapPin className={cn(
                            "h-10 w-10",
                            nearest || conflicts.length > 0
                                ? `animate-bounce ${getLineTextClass(nearest?.station?.lineId ?? conflicts[0]?.station?.lineId)}`
                                : 'animate-pulse text-white'
                        )} />
                    </div>
                    <h1 className="text-3xl font-black tracking-tight">
                        {conflicts.length > 0 ? (isBusMode ? "Nearby Bus Stops" : "Multiple Stations") : nearest ? `You are at ${nearest.station.name}` : "Locating..."}
                    </h1>
                    {isOverride && <p className="font-mono text-xs text-red-500">GPS OVERRIDE ENABLED</p>}
                </div>

                {conflicts.length > 0 && (
                    <div className="grid w-full max-w-sm gap-3">
                        {conflicts.map(({ station }) => (
                            <button
                                key={station.id}
                                onClick={() => handleRide(station)}
                                className={cn(
                                    "rounded-xl border border-white/10 p-4 text-left transition-all hover:scale-105",
                                    getLineSurfaceClass(station.lineId)
                                )}
                            >
                                <div className="text-lg font-bold">{station.name}</div>
                                <div className="text-xs font-semibold uppercase opacity-80">{station.lineId}</div>
                            </button>
                        ))}
                    </div>
                )}

                {nearest && conflicts.length === 0 && (
                    <Card className={cn(
                        "w-full max-w-sm border-zinc-800 bg-zinc-900/50 p-6 backdrop-blur-sm transition-all duration-500 animate-in fade-in slide-in-from-bottom-4 hover:scale-[1.02]",
                        isDarkMode ? "shadow-[0_0_40px_-5px_rgba(255,255,255,0.15)]" : "shadow-[0_35px_60px_-15px_rgba(0,0,0,0.8)]"
                    )}>
                        <div className="flex flex-col items-center gap-4">
                            <Badge variant="outline" className="border-zinc-700 text-zinc-400">DETECTED</Badge>
                            <h3 className="text-3xl font-black">{nearest.station.name}</h3>
                            <div className={cn("flex items-center gap-2 font-medium", getLineTextClass(nearest.station.lineId))}>
                                <Navigation className="h-4 w-4" />
                                <span>{nearest.distance.toFixed(2)} km away</span>
                            </div>
                            <button
                                onClick={() => handleRide(nearest.station)}
                                className={cn(
                                    "mt-4 w-full rounded-xl py-4 text-xl font-black shadow-lg transition-colors",
                                    nearest.station.lineId === 'EDSA'
                                        ? 'bg-[#8b7355] text-white shadow-[0_12px_30px_rgba(139,115,85,0.28)] hover:bg-[#8b7355]/90'
                                        : 'bg-white text-black shadow-white/10 hover:bg-zinc-200'
                                )}
                            >
                                {nearest.station.lineId === 'EDSA' ? 'RIDE BUS' : 'RIDE TRAIN'}
                            </button>
                        </div>
                    </Card>
                )}

                {!nearest && conflicts.length === 0 && bridgeName && (
                    <Card className="w-full max-w-sm border-blue-500/30 bg-zinc-900/50 p-6 backdrop-blur-sm animate-in fade-in slide-in-from-bottom-4">
                        <div className="flex flex-col items-center gap-4">
                            <Badge className="border-blue-500/50 bg-blue-500/20 text-blue-400 animate-pulse">TRANSFER ZONE</Badge>
                            <h3 className="text-center text-2xl font-bold text-blue-200">{bridgeName}</h3>
                            <div className="flex items-center gap-2 text-sm text-zinc-400">
                                <Navigation className="h-4 w-4" />
                                <span>Walking to Transfer...</span>
                            </div>
                        </div>
                    </Card>
                )}
            </div>

            <FareSelector open={showFareModal} onOpenChange={setShowFareModal} />
        </>
    );
}
