"use client";

import { useEffect, useState } from "react";
import { Direction, LineId, LocationStatus, Station, TicketType } from "@/types";
import { cn } from "@/lib/utils";
import { getLineColor, getStationBadge, getThemeColors, getDoorSide } from "@/utils/stationUtils";
import { Marquee } from "@/components/ui/Marquee";
import { AlertTriangle, MapPin, Navigation, Loader2, Ruler, Timer, Coins, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useTripStore } from "@/store/useTripStore";
import { getDistanceKm } from "@/utils/geo";
import { getPrecisionFare } from "@/utils/fareNew";
import {
    BUS_STOP_BOARDING_RADIUS_KM,
    RAIL_STATION_BOARDING_RADIUS_KM,
} from "@/domain/location/stationProximity";

const TERMINUS_IDS = ['L1-20', 'L1-25', 'L2-01', 'L2-13', 'M3-01', 'M3-13', 'M7-01', 'M7-14', 'EC-01', 'EC-25'];
const AUTO_CLOSE_DELAY = 60; // seconds

// Common Station cycling badge config
const COMMON_BADGES = [
    { code: 'GL27', bg: 'bg-green-600', text: 'text-white', gradient: 'from-green-500', glass: 'bg-emerald-600/60', border: 'border-green-500/30 border-t-white/20' },
    { code: 'YL01', bg: 'bg-yellow-500', text: 'text-black', gradient: 'from-yellow-500', glass: 'bg-amber-500/60', border: 'border-yellow-500/30 border-t-white/20' },
    { code: 'ML01', bg: 'bg-mrt7', text: 'text-white', gradient: 'from-mrt7', glass: 'bg-mrt7/60', border: 'border-[#a83a3a]/30 border-t-white/20' },
];

function getLineTextClass(lineId: LineId | string | undefined): string {
    if (lineId === 'LRT1') return 'text-lrt1';
    if (lineId === 'LRT2') return 'text-lrt2';
    if (lineId === 'MRT7') return 'text-[#d46a6a]';
    if (lineId === 'EDSA') return 'text-[#f1e4d1]';
    return 'text-mrt3';
}

function getLineGradientClass(lineId: LineId | string | undefined): string {
    if (lineId === 'LRT1') return 'from-green-500';
    if (lineId === 'LRT2') return 'from-purple-500';
    if (lineId === 'MRT7') return 'from-mrt7';
    if (lineId === 'EDSA') return 'from-[#8b7355]';
    return 'from-yellow-500';
}

function getLineDisplayName(lineId: LineId | string | undefined): string {
    if (lineId === 'LRT1') return 'LRT Line 1';
    if (lineId === 'LRT2') return 'LRT Line 2';
    if (lineId === 'MRT7') return 'MRT Line 7';
    if (lineId === 'EDSA') return 'EDSA Carousel';
    return 'MRT Line 3';
}

function getDetectionBadgeTone(lineId: LineId | string | undefined, isFar: boolean): string {
    if (lineId === 'EDSA') {
        return isFar
            ? 'border-[#c2aa86]/45 bg-black/35 text-[#f1e4d1]'
            : 'border-[#c2aa86]/55 bg-[#8b7355]/30 text-[#fff8ee] animate-pulse';
    }
    return isFar ? 'text-white/70' : 'text-emerald-400 animate-pulse';
}

function getReadyDistanceTone(lineId: LineId | string | undefined, isFar: boolean): string {
    if (lineId === 'EDSA') return isFar ? 'text-[#dcc6a6]' : 'text-[#fff8ee]';
    if (isFar) return 'text-white/70';
    return 'text-emerald-400';
}

function getBoardingRadiusKm(lineId: LineId | string | undefined): number {
    return lineId === 'EDSA' ? BUS_STOP_BOARDING_RADIUS_KM : RAIL_STATION_BOARDING_RADIUS_KM;
}

function clampPercent(value: number | null | undefined) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(100, value));
}

interface Props {
    origin: Station | null;
    ticketType: TicketType | null;
    direction: Direction | 'ARRIVED' | null;
    runningFare: number;
    onTicketClick: () => void;
    isArrived?: boolean;
    // New Props for TrenKo UI
    nextStation?: Station | null;
    prevStation?: Station | null;
    progress?: number;
    // Dynamic Logic
    statusText?: string;
    displayStation?: Station | null;
    isTransferActive?: boolean;
    transferFrom?: Station | null;
    transferTo?: Station | null;
    transferTargetLineId?: LineId | null;

    // Scanning Props (Gatekeeper Mode)
    scanningState?: {
        loading: boolean;
        nearest: { station: Station; distance: number } | null;
        conflicts: { station: Station; distance: number }[];
        isOverride: boolean;
        locationStatus?: LocationStatus;
        isRequestingLocation?: boolean;
        onRide: (station: Station) => void;
        onRequestLocation?: () => void | Promise<boolean>;
    };
    onManualEntry?: () => void;
}

export function TicketCard({
    origin, ticketType, direction, runningFare, onTicketClick,
    isArrived, nextStation, prevStation, progress = 0,
    statusText = "CURRENT STATION", displayStation,
    isTransferActive = false, transferFrom, transferTo, transferTargetLineId,
    scanningState, onManualEntry
}: Props) {

    // === ALL HOOKS AT TOP (React rules of hooks — no hooks after early returns) ===
    const { isDarkMode, status: tripStatus, destination, reset: resetTrip, isDevMode, transitMode: selectedTransitMode } = useTripStore();
    const isBusMode = isDevMode && selectedTransitMode === 'bus';
    const progressPercent = clampPercent(progress);
    const [arrivalCountdown, setArrivalCountdown] = useState(AUTO_CLOSE_DELAY);
    const [arrivalFading, setArrivalFading] = useState(false);

    // Event-driven gradient flash for Active Trip card
    const [gradientFlash, setGradientFlash] = useState(false);
    useEffect(() => {
        if (!displayStation) return;
        setGradientFlash(true);
        const t = setTimeout(() => setGradientFlash(false), 3000);
        return () => clearTimeout(t);
    }, [displayStation, statusText]);

    // Common Station cycling badge (5s interval)
    const [commonBadgeIdx, setCommonBadgeIdx] = useState(0);
    useEffect(() => {
        const interval = setInterval(() => {
            setCommonBadgeIdx(prev => (prev + 1) % COMMON_BADGES.length);
        }, 5000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        if (tripStatus !== 'ARRIVED' || !origin) return;
        setArrivalCountdown(AUTO_CLOSE_DELAY);
        setArrivalFading(false);

        const timer = setInterval(() => {
            setArrivalCountdown(prev => {
                if (prev <= 1) {
                    clearInterval(timer);
                    setArrivalFading(true);
                    setTimeout(() => resetTrip(), 500);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(timer);
    }, [tripStatus, origin, resetTrip]);

    // --- MODE 1: SCANNING / LOCATING (No Origin) ---
    if (!origin && scanningState) {
        const {
            loading,
            nearest,
            conflicts,
            isOverride,
            locationStatus,
            isRequestingLocation = false,
            onRide,
            onRequestLocation,
        } = scanningState;

        if (loading) {
            const isChecking = !locationStatus || locationStatus.code === 'checking';
            const canRequestLocation = Boolean(locationStatus?.canRequest && onRequestLocation);
            const showManualEntry = Boolean(isOverride && onManualEntry);

            return (
                <div key="locating" className="w-full max-w-md md:max-w-2xl lg:max-w-3xl mx-auto backdrop-blur-3xl backdrop-saturate-150 rounded-3xl overflow-hidden shadow-2xl border border-white/10 bg-black/40 p-5 md:p-8 flex flex-col items-center justify-center space-y-4 md:space-y-6 min-h-[220px] md:min-h-[280px] mb-4 md:mb-8 animate-in fade-in zoom-in-95 duration-500 relative">
                    <div className="relative">
                        <div className={cn("absolute inset-0 rounded-full blur-xl", isChecking ? "bg-emerald-500/20 animate-ping" : "bg-red-500/20")} />
                        <div className="w-20 h-20 rounded-full bg-black/50 border border-white/10 flex items-center justify-center relative backdrop-blur-md">
                            {isChecking ? (
                                <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
                            ) : (
                                <AlertTriangle className="w-8 h-8 text-red-400" />
                            )}
                        </div>
                    </div>
                    <div className="text-center space-y-2">
                        <h3 className="text-xl font-bold text-white tracking-widest uppercase">
                            {locationStatus?.title ?? 'Locating...'}
                        </h3>
                        <p className="text-xs text-white/70 max-w-xs leading-relaxed">
                            {locationStatus?.message ?? 'Acquiring GPS Signal'}
                        </p>
                        {locationStatus?.accuracyMeters !== null && locationStatus?.accuracyMeters !== undefined && (
                            <p className="text-[10px] text-white/35 font-mono uppercase tracking-wider">
                                Accuracy: {Math.round(locationStatus.accuracyMeters)}m
                            </p>
                        )}
                    </div>

                    {canRequestLocation && (
                        <button
                            onClick={onRequestLocation}
                            disabled={isRequestingLocation}
                            className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-3 text-xs font-black uppercase tracking-wider text-black disabled:opacity-40"
                        >
                            <RefreshCw className={cn("w-4 h-4", isRequestingLocation && "animate-spin")} />
                            {isRequestingLocation ? 'Requesting...' : 'Retry Location'}
                        </button>
                    )}

                    {/* Dev-only manual entry override */}
                    {showManualEntry && (
                        <button
                            onClick={onManualEntry}
                                className="mt-4 text-[10px] text-white/65 hover:text-white transition-colors border-b border-transparent hover:border-white/60 pb-0.5"
                        >
                            {isBusMode ? "Already on the bus? Choose your stop." : "Already on the train? Tap here."}
                        </button>
                    )}
                </div>
            );
        }

        // --- CONFLICT MODE: Transfer area or overlapping nearby bus stops ---
        if (conflicts.length > 1) {
            return (
                <div key="conflict" className="w-full max-w-md md:max-w-2xl lg:max-w-3xl mx-auto backdrop-blur-3xl backdrop-saturate-150 rounded-3xl overflow-hidden shadow-2xl border border-white/15 bg-black/75 mb-4 md:mb-8 animate-in fade-in zoom-in-95 duration-500 relative">
                    {/* Ambient glow */}
                    <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent pointer-events-none -z-10" />

                    {/* Header */}
                    <div className="flex flex-col items-center pt-6 pb-3 space-y-2">
                        <Badge variant="outline" className={cn("backdrop-blur text-xs tracking-widest animate-pulse", isBusMode ? "border-[#c2aa86]/50 bg-[#8b7355]/25 text-[#fff8ee]" : "border-amber-500/30 bg-amber-500/10 text-amber-400")}>
                            {isBusMode ? "NEARBY BUS STOPS" : "TRANSFER AREA"}
                        </Badge>
                        <p className="text-[11px] text-white/75 font-medium">{isBusMode ? "GPS overlaps nearby stops - choose where you are boarding" : "Multiple lines detected - choose your station"}</p>
                    </div>

                    {/* Station Cards */}
                    <div className="px-4 pb-4 md:px-6 md:pb-6 space-y-3">
                        {conflicts.map((c, idx) => {
                            const lineColor = getLineColor(c.station.lineId);
                            const badgeCode = getStationBadge(c.station.lineId, c.station.order);
                            const isFar = c.distance > getBoardingRadiusKm(c.station.lineId);
                            const lineName = getLineDisplayName(c.station.lineId);

                            return (
                                <button
                                    key={c.station.id}
                                    disabled={isFar && !isOverride}
                                    onClick={() => onRide(c.station)}
                                    className={cn(
                                        "w-full rounded-2xl border p-4 flex items-center gap-4 transition-all duration-300 group relative overflow-hidden",
                                        "backdrop-blur-xl bg-white/5 hover:bg-white/10 active:scale-[0.98]",
                                        isFar && !isOverride
                                            ? "border-white/10 bg-black/25 cursor-not-allowed"
                                            : "border-white/10 hover:border-white/20 shadow-lg",
                                        "animate-in slide-in-from-bottom-2 fade-in duration-500"
                                    )}
                                    style={{ animationDelay: `${idx * 100}ms`, animationFillMode: 'both' }}
                                >
                                    {/* Line accent bar */}
                                    <div className={cn("absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl", lineColor)} />

                                    {/* Station badge */}
                                    <div className={cn("px-2.5 py-1.5 rounded-lg text-xs font-black shrink-0 ml-2", lineColor, c.station.lineId === 'MRT3' ? 'text-black' : 'text-white')}>
                                        {badgeCode}
                                    </div>

                                    {/* Info */}
                                    <div className="flex-1 text-left min-w-0">
                                        <div className="font-bold text-white text-base truncate">{c.station.name}</div>
                                        <div className="flex items-center gap-2 mt-0.5">
                                            <span className="text-[10px] text-white/70 font-bold uppercase tracking-wider">{lineName}</span>
                                            <span className="text-[10px] text-white/50">•</span>
                                            <span className={cn("text-[10px] font-bold", getReadyDistanceTone(c.station.lineId, isFar))}>
                                                {(c.distance * 1000).toFixed(0)}m
                                            </span>
                                        </div>
                                    </div>

                                    {/* Action indicator */}
                                    <div className={cn(
                                        "px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider shrink-0 transition-colors",
                                        isFar && !isOverride
                                            ? "border border-white/10 bg-black/35 text-white/70"
                                            : c.station.lineId === 'EDSA'
                                                ? "bg-[#8b7355] text-white group-hover:bg-[#8b7355]/90"
                                            : "bg-white text-black group-hover:bg-emerald-400 group-hover:text-black"
                                    )}>
                                        {isFar ? "FAR" : c.station.lineId === "EDSA" ? "BOARD" : "TAP IN"}
                                    </div>
                                </button>
                            );
                        })}
                    </div>

                    {/* Manual Entry */}
                    {onManualEntry && (
                        <div className="flex justify-center pb-5">
                            <button
                                onClick={onManualEntry}
                                className="text-[10px] text-white/65 hover:text-white transition-colors border-b border-transparent hover:border-white/60 pb-0.5"
                            >
                                {isBusMode ? "Already on the bus? Choose your stop." : "Already on the train? Tap here."}
                            </button>
                        </div>
                    )}
                </div>
            );
        }

        if (nearest) {
            const isBusStop = nearest.station.lineId === 'EDSA';
            const isFar = nearest.distance > getBoardingRadiusKm(nearest.station.lineId);
            const lineColor = getLineColor(nearest.station.lineId);
            const badgeCode = getStationBadge(nearest.station.lineId, nearest.station.order);
            const theme = getThemeColors(nearest.station.lineId);
            const isTerminus = TERMINUS_IDS.includes(nearest.station.id) || nearest.station.stopType === 'terminal';

            const isCommon = nearest.station.name === 'Common Station';

            return (
                <div key="detected" className={cn("w-full max-w-md md:max-w-2xl lg:max-w-3xl mx-auto backdrop-blur-3xl backdrop-saturate-150 shadow-[inset_0_0_20px_rgba(255,255,255,0.1)] rounded-3xl overflow-hidden border transition-all duration-1000 hover:scale-[1.02] relative mb-4 md:mb-8 animate-in fade-in zoom-in-95 duration-500",
                    isDarkMode ? "shadow-[0_0_40px_-5px_rgba(255,255,255,0.15)]" : "shadow-[0_35px_60px_-15px_rgba(0,0,0,0.8)]",
                    isCommon ? COMMON_BADGES[commonBadgeIdx].glass : theme.glass,
                    isCommon ? COMMON_BADGES[commonBadgeIdx].border : theme.border
                )}>
                    {/* Dynamic Gradient (cycles for Common Station) */}
                    <div className={cn("absolute inset-0 bg-gradient-to-b opacity-20 pointer-events-none animate-pulse -z-10 transition-all duration-1000",
                        isCommon ? COMMON_BADGES[commonBadgeIdx].gradient : getLineGradientClass(nearest.station.lineId)
                    )} />
                    {/* Header */}
                    <div className="flex justify-center pt-6 pb-2">
                        <Badge variant="outline" className={cn(
                            "bg-black/20 backdrop-blur border-white/10 text-xs tracking-widest",
                            getDetectionBadgeTone(nearest.station.lineId, isFar)
                        )}>
                            {isFar ? (isBusStop ? "NEAREST BUS STOP" : "NEAREST STATION") : (isBusStop ? "BUS STOP DETECTED" : "DETECTED")}
                        </Badge>
                    </div>

                    {/* Station Name */}
                    <div className="flex flex-col items-center justify-center py-4 md:py-6 space-y-2 md:space-y-3">
                        <div className="flex items-center gap-3 justify-center w-full px-6">
                            {isCommon ? (
                                <div className="relative h-7 w-12 shrink-0">
                                    {COMMON_BADGES.map((b, i) => (
                                        <div key={b.code}
                                            className={cn("absolute inset-0 px-2 py-1 rounded-md text-xs font-bold shrink-0 flex items-center justify-center transition-all duration-1000",
                                                b.bg, b.text,
                                                i === commonBadgeIdx ? 'opacity-100 scale-100' : 'opacity-0 scale-90'
                                            )}
                                        >
                                            {b.code}
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className={cn("px-2 py-1 rounded-md text-xs font-bold shrink-0", lineColor, nearest.station.lineId === 'MRT3' ? 'text-black' : 'text-white')}>
                                    {badgeCode}
                                </div>
                            )}
                            <h1 className="text-2xl md:text-3xl lg:text-4xl font-black text-white text-center leading-tight">
                                {nearest.station.name}
                            </h1>
                        </div>

                        <div className={cn("flex items-center gap-2 text-sm font-medium", getLineTextClass(nearest.station.lineId))}>
                            <Navigation className="w-4 h-4" />
                            <span>{nearest.distance.toFixed(2)} km away</span>
                        </div>
                    </div>

                    {/* Action Button */}
                    <div className="px-5 pb-5 md:px-8 md:pb-8">
                        <button
                            onClick={() => onRide(nearest.station)}
                            className={cn(
                                "w-full py-3 md:py-4 rounded-2xl font-black text-base md:text-lg shadow-lg flex items-center justify-center gap-2 transition-all active:scale-95",
                                isFar
                                    ? "bg-black/50 text-white/80 cursor-not-allowed border border-white/15"
                                    : nearest.station.lineId === 'EDSA'
                                        ? "bg-[#8b7355] text-white hover:bg-[#8b7355]/90 shadow-[0_12px_30px_rgba(139,115,85,0.28)]"
                                    : "bg-white text-black hover:bg-zinc-100 shadow-white/10"
                            )}
                            disabled={isFar && !isOverride}
                        >
                            {isFar ? (
                                <>
                                    <span>{isBusStop ? "TOO FAR TO BOARD" : "TOO FAR TO SCAN"}</span>
                                </>
                            ) : (
                                <>
                                    <MapPin className="w-5 h-5" />
                                    <span>{isBusStop ? "BOARD BUS" : "TAP IN"}</span>
                                </>
                            )}
                        </button>
                        {isOverride && isFar && <div className="text-[10px] text-red-500 text-center mt-2 font-mono">DEV OVERRIDE ENABLED</div>}
                        {isFar && <p className="text-[11px] text-white/80 text-center mt-3">Move closer to this {isBusStop ? "bus stop" : "station"} to start your trip.</p>}

                        {/* Only show "Already on train" if NOT at a Terminus (Intermediate Station) */}
                        {!isTerminus && onManualEntry && (
                            <button
                                onClick={onManualEntry}
                                className="mt-4 text-[10px] text-white/65 hover:text-white transition-colors border-b border-transparent hover:border-white/60 pb-0.5"
                            >
                                {isBusMode ? "Already on the bus? Choose your stop." : "Already on the train? Tap here."}
                            </button>
                        )}
                    </div>
                </div>
            );
        }

        // Fallback for no station found
        return (
            <div key="fallback" className="w-full mx-auto backdrop-blur-3xl backdrop-saturate-150 rounded-3xl overflow-hidden shadow-2xl border border-white/10 bg-black/40 p-8 flex flex-col items-center justify-center space-y-6 min-h-[280px] mb-8 animate-in fade-in zoom-in-95 duration-500">
                <MapPin className="w-12 h-12 text-zinc-600" />
                <div className="text-center">
                    <h3 className="text-lg font-bold text-white">{isBusMode ? "No Bus Stops Found" : "No Stations Found"}</h3>
                    <p className="text-xs text-white/70 mt-1">{isBusMode ? "No EDSA Carousel stop is near your location." : "You are seemingly in the middle of nowhere."}</p>

                    {onManualEntry && (
                        <button
                            onClick={onManualEntry}
                            className="mt-6 px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-bold text-white transition-all"
                        >
                            Start Trip Manually
                        </button>
                    )}
                </div>
            </div>
        );
    }


    // --- MODE 2: ARRIVED AT DESTINATION ---

    if (tripStatus === 'ARRIVED' && origin) {
        const arrivedStation = destination || displayStation || origin;
        const arrTheme = getThemeColors(arrivedStation.lineId);
        const arrBadge = getStationBadge(arrivedStation.lineId, arrivedStation.order);
        const arrColor = getLineColor(arrivedStation.lineId);

        // Trip Stats Calculation
        const distKm = getDistanceKm(origin, arrivedStation);
        const distText = distKm < 1 ? `${Math.round(distKm * 1000)}m` : `${distKm.toFixed(1)}km`;

        // Est Duration (Mock 30km/h avg speed + 2 mins buffer)
        const durationMin = Math.ceil((distKm / 30) * 60) + 2;

        // Fare Calculation
        const finalFare = getPrecisionFare(origin, arrivedStation, ticketType || (origin.lineId === 'EDSA' ? 'BUS_REGULAR' : 'SJT'));

        // Reminder Text
        const exitCard = origin.lineId === 'EDSA'
            ? 'bus fare'
            : ticketType === 'SJT'
                ? 'Single Journey Ticket'
                : 'Beep Card';

        return (
            <div
                key="arrived"
                className={cn(
                    "w-full max-w-md md:max-w-2xl lg:max-w-3xl mx-auto backdrop-blur-3xl backdrop-saturate-150 rounded-3xl overflow-hidden border relative mb-4 md:mb-8 transition-all duration-1000",
                    arrivalFading ? "opacity-0 scale-95" : "opacity-100 scale-100 animate-in fade-in zoom-in-95 duration-500",
                    isDarkMode ? "shadow-[0_0_40px_-5px_rgba(255,255,255,0.15)]" : "shadow-[0_35px_60px_-15px_rgba(0,0,0,0.8)]",
                    arrivedStation.name === 'Common Station' ? COMMON_BADGES[commonBadgeIdx].glass : arrTheme.glass,
                    arrivedStation.name === 'Common Station' ? COMMON_BADGES[commonBadgeIdx].border : arrTheme.border
                )}
            >
                {/* Celebration Pulse (cycles for Common Station) */}
                <div className={cn("absolute inset-0 bg-gradient-to-b opacity-20 pointer-events-none animate-pulse -z-10 transition-all duration-1000",
                    arrivedStation.name === 'Common Station' ? COMMON_BADGES[commonBadgeIdx].gradient : getLineGradientClass(arrivedStation.lineId)
                )} />

                {/* Header Badge */}
                <div className="flex justify-center pt-6 pb-2 relative z-10">
                    <div className={cn("flex items-center gap-2 px-4 py-1.5 rounded-full backdrop-blur border shadow-lg animate-bounce",
                        arrTheme.bg, arrTheme.border
                    )}>
                        <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
                        <span className="text-[10px] font-bold uppercase tracking-wider text-white">
                            ARRIVED
                        </span>
                    </div>
                </div>

                {/* Arrival Station */}
                <div className="flex flex-col items-center justify-center py-4 md:py-6 space-y-2 relative z-10">
                    <p className="text-xs text-white/60 uppercase tracking-widest font-bold">You have arrived at</p>
                    <div className="flex items-center gap-3 justify-center w-full px-6">
                        {arrivedStation.name === 'Common Station' ? (
                            <div className="relative h-8 w-14 shrink-0">
                                {COMMON_BADGES.map((b, i) => (
                                    <div key={b.code}
                                        className={cn("absolute inset-0 px-3 py-1.5 rounded-md text-sm font-bold shrink-0 shadow-lg flex items-center justify-center transition-all duration-1000",
                                            b.bg, b.text,
                                            i === commonBadgeIdx ? 'opacity-100 scale-100' : 'opacity-0 scale-90'
                                        )}
                                    >
                                        {b.code}
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className={cn("px-3 py-1.5 rounded-md text-sm font-bold shrink-0 shadow-lg",
                                arrColor,
                                arrivedStation.lineId === 'MRT3' ? 'text-black' : 'text-white'
                            )}>
                                {arrBadge}
                            </div>
                        )}
                        <h1 className="text-3xl md:text-4xl font-black text-white text-center leading-tight drop-shadow-lg">
                            {arrivedStation.name}
                        </h1>
                    </div>
                    {/* Doors Open Indicator */}
                    <div className="mt-[-10px] mb-6 px-4 py-1.5 rounded-full bg-black/40 border border-white/10 backdrop-blur-sm animate-in zoom-in-50 duration-700 delay-300">
                        <p className="text-[10px] font-bold text-white uppercase tracking-wider">
                            Doors open on <span className={arrivedStation.lineId === 'EDSA' ? 'text-[#f1e4d1]' : 'text-emerald-400'}>{getDoorSide(arrivedStation.name, arrivedStation.lineId)}</span> side
                        </p>
                    </div>
                </div>

                {/* Trip Stats Grid */}
                <div className="grid grid-cols-3 gap-2 px-5 md:px-8 mb-4 relative z-10">
                    <div className="flex flex-col items-center p-3 rounded-2xl bg-black/20 border border-white/5">
                        <Ruler className="w-4 h-4 text-white/50 mb-1" />
                        <span className="text-[10px] text-white/50 uppercase tracking-wider">Distance</span>
                        <span className="text-lg font-bold text-white">{distText}</span>
                    </div>
                    <div className="flex flex-col items-center p-3 rounded-2xl bg-black/20 border border-white/5">
                        <Timer className="w-4 h-4 text-white/50 mb-1" />
                        <span className="text-[10px] text-white/50 uppercase tracking-wider">Time</span>
                        <span className="text-lg font-bold text-white">{durationMin}<span className="text-xs font-normal text-white/50 ml-0.5">min</span></span>
                    </div>
                    <div className="flex flex-col items-center p-3 rounded-2xl bg-black/20 border border-white/5">
                        <Coins className={cn("w-4 h-4 mb-1", arrivedStation.lineId === 'EDSA' ? 'text-[#f1e4d1]' : 'text-emerald-400')} />
                        <span className="text-[10px] text-white/50 uppercase tracking-wider">Total Fare</span>
                        <span className={cn("text-lg font-bold", arrivedStation.lineId === 'EDSA' ? 'text-[#f1e4d1]' : 'text-emerald-400')}>₱{finalFare}</span>
                    </div>
                </div>

                {/* Exit Reminder */}
                <div className="mx-5 md:mx-8 mb-4 p-3 rounded-xl bg-white/5 border border-white/10 text-center relative z-10">
                    <p className="text-xs text-white/80">
                        Prepare your <span className="font-bold text-white">{exitCard}</span> for exit.
                    </p>
                </div>

                {/* End Trip Button */}
                <div className="px-5 md:px-8 pb-2 relative z-10">
                    <button
                        onClick={() => {
                            setArrivalFading(true);
                            setTimeout(() => resetTrip(), 400);
                        }}
                        className={cn(
                            "w-full py-4 rounded-2xl font-black text-lg shadow-xl flex items-center justify-center gap-2 transition-all active:scale-95",
                            arrivedStation.lineId === 'EDSA'
                                ? 'bg-[#8b7355] text-white hover:bg-[#8b7355]/90 shadow-[0_12px_30px_rgba(139,115,85,0.28)]'
                                : 'bg-white text-black hover:bg-zinc-200'
                        )}
                    >
                        <MapPin className="w-5 h-5" />
                        <span>END TRIP</span>
                    </button>
                </div>

                {/* Auto-Close Timer */}
                <div className="px-5 md:px-8 pb-5 md:pb-8 relative z-10 flex flex-col items-center justify-center pt-3">
                    <p className="text-[10px] text-white/40 font-mono mb-2">
                        Auto-closing in {arrivalCountdown}s
                    </p>
                    <div className="w-full h-1 bg-zinc-800 rounded-full overflow-hidden max-w-[200px]">
                        <div
                            className="h-full bg-white/50 transition-all duration-1000 ease-linear"
                            style={{ width: `${(arrivalCountdown / AUTO_CLOSE_DELAY) * 100}%` }}
                        />
                    </div>
                </div>
            </div>
        );
    }

    // --- MODE 3: ACTIVE TRIP (Original Logic) ---
    // If we have an origin, we show the ticket details
    if (!origin) return null; // Should be handled above, but safety check

    // Determine which station to show
    const currentDisplay = displayStation || origin;

    // Line Colors (Official)
    const lineColor = getLineColor(currentDisplay.lineId);
    const badgeCode = getStationBadge(currentDisplay.lineId, currentDisplay.order);
    const theme = getThemeColors(currentDisplay.lineId);

    const isTransferring = Boolean(isTransferActive && transferTo);
    const transferSource = transferFrom || currentDisplay;
    const transferTargetLine = transferTargetLineId || transferTo?.lineId || null;
    const transferTargetName = transferTo?.name || null;

    return (
        <div key="active-trip" className={cn("w-full max-w-md md:max-w-2xl lg:max-w-3xl mx-auto backdrop-blur-3xl backdrop-saturate-150 rounded-3xl overflow-hidden transform transition-all duration-500 hover:scale-[1.02] border relative mb-6 md:mb-8 animate-in fade-in zoom-in-95 duration-500",
            isDarkMode ? "shadow-[0_0_40px_-5px_rgba(255,255,255,0.15)]" : "shadow-[0_35px_60px_-15px_rgba(0,0,0,0.8)]",
            theme.glass, theme.border
        )}>
            {/* Dynamic Gradient (Event-driven: flashes on station change) */}
            <div className={cn("absolute inset-0 bg-gradient-to-b pointer-events-none -z-10 transition-opacity duration-1000",
                gradientFlash ? "opacity-20" : "opacity-0",
                getLineGradientClass(currentDisplay.lineId)
            )} />
            {/* Top Indicator */}
            <div className="flex justify-center pt-4 pb-1">
                <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-800/50 backdrop-blur border border-zinc-700">
                    <div className={cn("w-2 h-2 rounded-full animate-pulse", isArrived ? "bg-emerald-500" : "bg-blue-500")} />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-white/80">
                        {statusText}
                    </span>
                </div>
            </div>

            {/* Main Station Info */}
            <div className="flex flex-col items-center justify-center py-4 space-y-2">
                <div className="flex items-center gap-3 w-full px-8 justify-center">
                    <div className={cn("px-2 py-1 rounded-md text-xs font-bold shrink-0", lineColor, currentDisplay.lineId === 'MRT3' ? 'text-black' : 'text-white')}>
                        {badgeCode}
                    </div>
                    {/* Marquee for Long Names */}
                    <div className="h-10 flex items-center justify-center w-full overflow-hidden">
                        <Marquee
                            text={currentDisplay.name}
                            className="text-2xl md:text-3xl lg:text-4xl font-bold text-white text-center leading-tight"
                        />
                    </div>
                </div>

                {/* Transfer Info (Mock for now, can be real later) */}
                {currentDisplay.transfers && (
                    <div className="flex items-center gap-2 mt-2">
                        <span className="text-xs text-white/70">Transfer to</span>
                        {currentDisplay.transfers.map(t => (
                            <span key={t} className={cn("px-1.5 py-0.5 rounded text-[10px] font-bold", getLineColor(t), t === 'MRT3' ? 'text-black' : 'text-white')}>
                                {t}
                            </span>
                        ))}
                    </div>
                )}
            </div>

            {/* Leg Progress Bar */}
            <div className="w-full px-8 pb-4">
                <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                        className={cn("h-full transition-all duration-500 ease-out", isArrived ? "bg-emerald-500" : "bg-white")}
                        style={{ width: `${progressPercent}%` }}
                        aria-label={`Leg progress ${Math.round(progressPercent)} percent`}
                    />
                </div>
            </div>

            {/* Footer Connection Info */}
            <div className="grid grid-cols-2 px-6 pb-6 pt-2 gap-4">
                {isTransferring && transferTargetLine && transferTargetName ? (
                    // Transfer Mode Footer
                    <>
                        <div className="text-left">
                            <div className="text-[10px] text-white/60 uppercase tracking-wider mb-1">FROM</div>
                            <div className="text-lg font-bold text-white leading-tight">
                                {transferSource.name}
                            </div>
                            <div className={cn("inline-block px-1.5 py-0.5 rounded text-[10px] font-bold mt-1", getLineColor(transferSource.lineId), transferSource.lineId === 'MRT3' ? 'text-black' : 'text-white')}>
                                {transferSource.lineId}
                            </div>
                        </div>
                        <div className="text-right">
                            <div className="text-[10px] text-white/60 uppercase tracking-wider mb-1">TO</div>
                            <div className="text-lg font-bold text-white leading-tight">
                                {transferTargetName}
                            </div>
                            <div className={cn("inline-block px-1.5 py-0.5 rounded text-[10px] font-bold mt-1", getLineColor(transferTargetLine), transferTargetLine === 'MRT3' ? 'text-black' : 'text-white')}>
                                {transferTargetLine}
                            </div>
                        </div>
                    </>
                ) : (
                    // Normal Mode Footer
                    <>
                        {/* Previous Station */}
                        <div className="text-left">
                            <div className="text-[10px] text-white/60 uppercase tracking-wider mb-1">Previous</div>
                            {prevStation ? (
                                <>
                                    <div className={cn("inline-block px-1.5 py-0.5 rounded text-[10px] font-bold mb-1", getLineColor(prevStation.lineId), prevStation.lineId === 'MRT3' ? 'text-black' : 'text-white')}>
                                        {getStationBadge(prevStation.lineId, prevStation.order)}
                                    </div>
                                    <div className="text-sm font-bold text-white truncate">{prevStation.name}</div>
                                </>
                            ) : (
                                <div className="text-sm font-bold text-white/50 italic">Terminus</div>
                            )}
                        </div>

                        {/* Next Station */}
                        <div className="text-right">
                            <div className="text-[10px] text-white/60 uppercase tracking-wider mb-1">Next Station</div>
                            {nextStation ? (
                                <>
                                    <div className={cn("inline-block px-1.5 py-0.5 rounded text-[10px] font-bold mb-1", getLineColor(nextStation.lineId), nextStation.lineId === 'MRT3' ? 'text-black' : 'text-white')}>
                                        {getStationBadge(nextStation.lineId, nextStation.order)}
                                    </div>
                                    <div className="text-sm font-bold text-white truncate">{nextStation.name}</div>
                                </>
                            ) : (
                                <div className="text-sm font-bold text-white/50 italic">Terminus</div>
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
