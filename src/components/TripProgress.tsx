
import { Coordinates, LineId, Station } from "@/types";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";
import { getLineColor, getStationBadge, getThemeColors, getDoorSide } from "@/utils/stationUtils";
import { getFareBreakdown } from "@/utils/fareNew";
import { LINES } from "@/data/stations";
import { Navigation, ArrowRight, CornerUpRight, CornerUpLeft, ArrowUp, ArrowDown, Volume2, VolumeX, Gauge } from "lucide-react";
import { useTripStore } from "@/store/useTripStore";
import { Marquee } from "@/components/ui/Marquee";

import { useDeviceOrientation } from "@/hooks/useDeviceOrientation";
import { useLocationStore } from "@/store/useLocationStore";
import { getBearing } from "@/utils/geo";
import { formatDirection } from "@/domain/railway";
import { JourneyStatusCode, JourneyTransferEdge, TransferTurnDirection } from "@/domain/journey/types";

interface Props {
    prev: Station | null;
    current: Station | null;
    next: Station | null;
    progress: number;

    origin?: Station | null;
    destination?: Station | null;
    totalProgress?: number;
    ticketType?: string | null;
    runningFare?: number;
    stopsRemaining?: number | null;
    statusText?: string;
    statusCode?: JourneyStatusCode;
    distanceToNext?: number | null;
    distanceToDest?: number | null;
    stopsToTransfer?: number | null;
    stopsAfterTransfer?: number | null;
    nextLegLineId?: string | null;
    isTransferActive?: boolean;
    transferFrom?: Station | null;
    transferTo?: Station | null;
    transferEdge?: JourneyTransferEdge | null;
    transferTargetLineId?: LineId | null;
    transferInstruction?: string | null;
    transferRouteDescription?: string | null;
    transferTargetCoordinates?: Coordinates | null;
    transferDistanceMeters?: number | null;
    transferTurnDirection?: TransferTurnDirection | null;
}

// Helper to get interchange name
function getTransferStationName(from: string, to: string) {
    const pair = [from, to].sort().join('-');
    switch (pair) {
        case 'LRT1-MRT3': return 'EDSA / Taft Ave';
        case 'LRT1-LRT2': return 'D. Jose / Recto';
        case 'LRT1-MRT7': return 'Roosevelt / Common Station';
        case 'LRT2-MRT3': return 'Araneta - Cubao';
        case 'MRT3-MRT7': return 'North Avenue / Common Station';
        default: return 'Interchange';
    }
}

function clampPercent(value: number | null | undefined) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(100, value));
}

function clampSpeedKph(value: number | null | undefined) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(120, value));
}

function getLineGradientClass(lineId: LineId | string | null | undefined): string {
    if (lineId === 'LRT1') return 'from-green-500';
    if (lineId === 'LRT2') return 'from-purple-500';
    if (lineId === 'MRT7') return 'from-mrt7';
    if (lineId === 'EDSA') return 'from-[#8b7355]';
    return 'from-yellow-500';
}

function LiveSpeedCounter() {
    const speedKph = useLocationStore((state) => state.sample?.speedKph ?? null);
    const displaySpeedKph = clampSpeedKph(speedKph);

    return (
        <div className="-mr-2 flex min-w-[56px] flex-col items-center justify-center rounded-2xl border border-white/5 bg-black/20 px-3 py-1.5">
            <Gauge className="mb-0.5 h-3.5 w-3.5 text-white/50" />
            <span className="text-lg font-black leading-none text-white tabular-nums">
                {Math.round(displaySpeedKph)}
            </span>
            <span className="text-[8px] font-bold uppercase tracking-wider text-white/40">km/h</span>
        </div>
    );
}

function TransferCompassRuntime({
    targetCoordinates,
}: {
    targetCoordinates: Coordinates | null | undefined;
}) {
    const location = useLocationStore((state) => state.sample?.location ?? null);
    const { heading: deviceHeading } = useDeviceOrientation();
    const rotation = location && targetCoordinates && deviceHeading !== null
        ? getBearing(location, targetCoordinates) - deviceHeading
        : 0;

    useEffect(() => {
        document.documentElement.style.setProperty('--tt-transfer-rotation', rotation + 'deg');
    }, [rotation]);

    useEffect(() => () => {
        document.documentElement.style.removeProperty('--tt-transfer-rotation');
    }, []);

    return null;
}

function TransferDirectionIndicator({
    turnDirection,
    containerClassName,
    iconClassName,
}: {
    turnDirection: TransferTurnDirection | null | undefined;
    containerClassName: string;
    iconClassName: string;
}) {
    const direction = turnDirection || 'STRAIGHT';

    return (
        <div
            className={containerClassName}
            style={{ transform: 'rotate(var(--tt-transfer-rotation, 0deg))' }}
        >
            {direction === 'RIGHT' && <CornerUpRight className={iconClassName} />}
            {direction === 'LEFT' && <CornerUpLeft className={iconClassName} />}
            {direction === 'UP' && <ArrowUp className={iconClassName} />}
            {direction === 'DOWN' && <ArrowDown className={iconClassName} />}
            {direction === 'STRAIGHT' && <ArrowUp className={iconClassName} />}
        </div>
    );
}

export function TripProgress({
    prev,
    current,
    next,
    progress,
    origin,
    destination,
    totalProgress = 0,
    ticketType,
    runningFare,
    stopsRemaining,
    statusText,
    statusCode,
    distanceToNext,
    distanceToDest,
    stopsToTransfer,
    stopsAfterTransfer,
    nextLegLineId,
    isTransferActive = false,
    transferFrom,
    transferTo,
    transferEdge,
    transferTargetLineId,
    transferInstruction,
    transferRouteDescription,
    transferTargetCoordinates,
    transferDistanceMeters,
    transferTurnDirection,
}: Props) {
    const destStore = useTripStore((state) => state.destination);
    const walkingDistance = useTripStore((state) => state.walkingDistance);
    const isMuted = useTripStore((state) => state.isMuted);
    const setIsMuted = useTripStore((state) => state.setIsMuted);
    const direction = useTripStore((state) => state.direction);

    // Event-driven gradient flash (triggers on station change)
    const [gradientFlash, setGradientFlash] = useState(false);
    useEffect(() => {
        if (!current) return;
        setGradientFlash(true);
        const t = setTimeout(() => setGradientFlash(false), 3000);
        return () => clearTimeout(t);
    }, [current]);

    // Fallback to store destination if prop is missing (fixes Simulation/CommandCenter sync issues)
    const activeDest = destination || destStore;

    const [showDestination, setShowDestination] = useState(true);

    // Rotate Display every 10s
    useEffect(() => {
        const interval = setInterval(() => {
            setShowDestination(prev => !prev);
        }, 10000);
        return () => clearInterval(interval);
    }, []);

    const targetStation = showDestination ? activeDest : origin;
    const label = showDestination ? "Destination" : "Entry Point";
    const targetBadge = targetStation ? getStationBadge(targetStation.lineId, targetStation.order) : '??';
    const targetLineColor = targetStation ? getLineColor(targetStation.lineId) : 'bg-zinc-700';

    const isTransferring = Boolean(isTransferActive && transferFrom && transferTo);

    // Dynamic Theme: Prioritize the active segment (current/next) over the origin
    const activeLineId = isTransferring
        ? transferTargetLineId ?? transferTo?.lineId ?? next?.lineId ?? current?.lineId ?? origin?.lineId
        : current?.lineId || next?.lineId || origin?.lineId;

    const theme = getThemeColors(activeLineId);

    const legPercent = clampPercent(progress);
    const tripPercent = clampPercent(totalProgress);

    const transferDistance = walkingDistance ?? transferDistanceMeters ?? transferEdge?.distanceMeters ?? 150;
    const transferTargetLabel = transferTargetLineId ?? transferTo?.lineId ?? 'Next line';

    // Stats Cycle (Next Station <-> Destination <-> Doors <-> Direction)
    const [statsMode, setStatsMode] = useState<'NEXT' | 'DEST' | 'DOOR' | 'DIRECTION'>('NEXT');
    const [doorSide, setDoorSide] = useState<'LEFT' | 'RIGHT' | 'EITHER' | null>(null);
    const [arrivalPhase, setArrivalPhase] = useState(false);

    // Detect Station Change to Trigger Door Indicator
    useEffect(() => {
        if (!current || !origin) return;
        if (current.id === origin.id) return; // Don't trigger at start

        // Determine Door Side
        const side = getDoorSide(current.name, current.lineId);
        setDoorSide(side);

        // Enter Arrival Phase (Cycles Door <-> Direction)
        setArrivalPhase(true);
        setStatsMode('DOOR');

        const timer = setTimeout(() => {
            setArrivalPhase(false);
            setStatsMode('NEXT'); // Revert to standard cycle
        }, 30000);

        return () => clearTimeout(timer);
    }, [current, origin]);

    useEffect(() => {
        if (!arrivalPhase) return;
        const hasDepartedStation =
            statusCode === 'LEAVING_STATION' ||
            statusCode === 'BETWEEN_STATIONS';

        if (hasDepartedStation) {
            setArrivalPhase(false);
            setStatsMode('NEXT');
        }
    }, [arrivalPhase, statusCode]);

    // Cycle Logic
    useEffect(() => {
        const interval = setInterval(() => {
            setStatsMode(prev => {
                // Arrival Phase: Cycle DOOR <-> DIRECTION
                if (arrivalPhase) {
                    if (prev === 'DOOR') return 'DIRECTION';
                    if (prev === 'DIRECTION') return 'DOOR';
                    return 'DOOR'; // Entry/Recovery
                }

                // Normal Phase: Cycle NEXT <-> DEST
                // (Recover if stuck in DOOR/DIRECTION)
                if (prev === 'DOOR' || prev === 'DIRECTION') return 'NEXT';
                return prev === 'NEXT' ? 'DEST' : 'NEXT';
            });
        }, 5000);
        return () => clearInterval(interval);
    }, [arrivalPhase]);

    // Time Estimation Helper
    const formatTime = (meters: number, stops: number = 0) => {
        if (!meters) return '';
        const lineSpeedKph = activeLineId ? LINES[activeLineId].avgCommercialSpeedKph : 30;
        const metersPerMinute = Math.max(1, (lineSpeedKph * 1000) / 60);
        const travelMinutes = meters / metersPerMinute;
        const dwellMinutes = stops * 0.5; // 30s per stop
        const totalMinutes = Math.ceil(travelMinutes + dwellMinutes);
        return totalMinutes < 1 ? '<1 min' : `~${totalMinutes} min`;
    };

    const isNext = statsMode === 'NEXT';
    // Logic: Fallback to DEST if NEXT is N/A (e.g. at station?), or just always cycle?
    // If distanceToNext is null, force DEST.
    const effectiveMode = distanceToNext ? statsMode : 'DEST';

    const renderStats = () => {
        const dist = effectiveMode === 'NEXT' ? distanceToNext : distanceToDest;
        const label = effectiveMode === 'NEXT' ? 'Next Station' : 'Destination';
        // For Next Station, stops = 0. For Dest, use stopsRemaining.
        const stops = effectiveMode === 'NEXT' ? 0 : (stopsRemaining || 0);

        if (!dist) return (
            <div className="flex items-center gap-2">
                <Navigation className={cn("w-4 h-4 animate-pulse", theme.text)} />
                <span className="text-sm font-bold text-white uppercase tracking-wider">Live Tracking</span>
            </div>
        );

        if (effectiveMode === 'DOOR' && doorSide) {
            return (
                <div key={effectiveMode} className="flex flex-col animate-in fade-in slide-in-from-top-1 duration-500">
                    <div className="flex items-center gap-1.5 text-[10px] text-white/60 uppercase font-bold tracking-wider mb-0.5">
                        <Navigation className="w-3 h-3 fill-current" />
                        DOORS WILL OPEN ON
                    </div>
                    <div className={cn("text-lg font-black leading-none tracking-tight uppercase", theme.text)}>
                        {doorSide === 'EITHER' ? 'EITHER SIDE' : `${doorSide} SIDE`}
                    </div>
                </div>
            );
        }

        if (effectiveMode === 'DIRECTION') {
            const displayDir = direction ? formatDirection(direction).toUpperCase() : '---';

            return (
                <div key={effectiveMode} className="flex flex-col animate-in fade-in slide-in-from-top-1 duration-500">
                    <div className="flex items-center gap-1.5 text-[10px] text-white/60 uppercase font-bold tracking-wider mb-0.5">
                        <Navigation className="w-3 h-3 fill-current" />
                        THIS TRAIN IS GOING
                    </div>
                    <div className={cn("text-lg font-black leading-none tracking-tight uppercase", theme.text)}>
                        {displayDir}
                    </div>
                </div>
            );
        }

        const distText = dist < 1000 ? `${dist}m` : `${(dist / 1000).toFixed(1)}km`;
        const timeText = formatTime(dist, stops);

        return (
            <div key={effectiveMode} className="flex flex-col animate-in fade-in slide-in-from-top-1 duration-500">
                <div className="flex items-center gap-1.5 text-[10px] text-white/60 uppercase font-bold tracking-wider mb-0.5">
                    <Navigation className="w-3 h-3 fill-current" />
                    {label}
                </div>
                <div className="text-lg font-black text-white leading-none tracking-tight">
                    {distText} <span className="text-white/40 mx-1">•</span> <span className={theme.text}>{timeText}</span>
                </div>
            </div>
        );
    };

    const isDarkMode = useTripStore((state) => state.isDarkMode);

    return (
        <div className={cn("w-full max-w-md md:max-w-2xl lg:max-w-3xl backdrop-blur-3xl backdrop-saturate-150 border rounded-3xl overflow-hidden relative transition-all duration-700 transform hover:scale-[1.02]",
            isDarkMode ? "shadow-[0_0_40px_-5px_rgba(255,255,255,0.15)]" : "shadow-[0_35px_60px_-15px_rgba(0,0,0,0.8)]",
            theme.glass, theme.border // Apply Tint + Border to Main Card
        )}>
            {isTransferring && (
                <TransferCompassRuntime targetCoordinates={transferTargetCoordinates} />
            )}

            {/* Dynamic Gradient (Event-driven: flashes on station change) */}
            <div className={cn("absolute inset-0 bg-gradient-to-b pointer-events-none -z-10 transition-opacity duration-1000",
                gradientFlash ? "opacity-20" : "opacity-0",
                getLineGradientClass(activeLineId)
            )} />

            {/* Header: Live Tracking or Navigation (Transparent) */}
            <div className={cn("px-6 py-3 flex items-center justify-between transition-colors duration-500 border-b h-[72px]", // Fixed height to prevent layout shift
                theme.borderLight // Subtle separator
            )}>
                <div className="flex items-center gap-3">
                    {isTransferring ? (
                        <div className="flex flex-col items-start animate-in fade-in slide-in-from-top-2">
                            <div className="flex items-center gap-2 mb-1">
                                <Navigation className="w-5 h-5 text-white fill-white" style={{ transform: 'rotate(var(--tt-transfer-rotation, 0deg))', transition: 'transform 0.5s ease-out' }} />
                                <span className="text-sm font-black text-white uppercase tracking-wider">NAV MODE</span>
                            </div>
                            <p className="text-[10px] text-white/90 font-medium opacity-90">Guidance Active</p>
                        </div>
                    ) : (
                        // Custom Key ensures animation triggers on switch
                        <div key={effectiveMode} className="min-w-[140px]">
                            {renderStats()}
                        </div>
                    )}
                </div>

                {/* Speed Counter */}
                <LiveSpeedCounter />
            </div>

            {isTransferring ? (
                <div className="p-6 flex flex-col items-center text-center space-y-6 animate-in zoom-in-95 duration-500">

                    {/* Direction Instruction */}
                    <div className="space-y-2">
                        {/* Main Big Direction Icon */}
                        <TransferDirectionIndicator
                            turnDirection={transferTurnDirection}
                            containerClassName={cn(
                                "p-4 rounded-full inline-block mb-2 border transition-transform duration-500 ease-out",
                                theme.lightAccent,
                                theme.border,
                                theme.shadow,
                            )}
                            iconClassName={cn("w-12 h-12", theme.text)}
                        />
                        <div className="flex flex-col items-center">
                            <p className={cn("font-bold text-sm tracking-wide uppercase mb-1", theme.text)}>
                                {transferRouteDescription || 'Follow Signs'}
                            </p>
                            <p className="text-white/60 text-xs px-4 max-w-[200px] leading-relaxed">
                                {transferInstruction || `Transfer to ${transferTargetLabel}`}
                            </p>
                        </div>
                    </div>

                    {/* Distance Metric */}
                    <div className="flex items-center justify-center gap-8 w-full border-t border-white/5 pt-6">
                        <div className="text-center">
                            <p className="text-4xl font-black text-white">
                                {transferDistance}
                                <span className="text-lg text-white/50 ml-1">m</span>
                            </p>
                            <p className="text-[10px] text-white/50 uppercase tracking-widest mt-1">Distance</p>
                        </div>
                        <div className="text-center">
                            <p className="text-4xl font-black text-white">
                                {(() => {
                                    // Live walk time from GPS distance (1.2 m/s avg walking speed = 72 m/min)
                                    const dist = transferDistance;
                                    const walkMin = Math.ceil(dist / 72);
                                    return walkMin < 1 ? '<1' : `~${walkMin}`;
                                })()}
                                <span className="text-lg text-white/50 ml-1">min</span>
                            </p>
                            <p className="text-[10px] text-white/50 uppercase tracking-widest mt-1">Walk Time</p>
                        </div>
                    </div>

                    {/* Destination Context */}
                    <div className={cn("w-full p-3 rounded-xl border", theme.lightAccent, theme.border)}>
                        <p className={cn("text-xs mb-1", theme.text)}>Transferring to</p>
                        <p className="text-lg font-bold text-white">{transferTargetLabel}</p>
                    </div>

                </div>
            ) : (
                <div className="p-6 grid grid-cols-3 gap-6">

                    {/* Left: Destination / Entry Info */}
                    <div className="col-span-2 space-y-4">
                        <div key={showDestination ? 'dest' : 'entry'} className="animate-in fade-in slide-in-from-left-2 duration-700">
                            <div className="text-xs text-white/60 uppercase tracking-wide mb-1 flex items-center gap-2">
                                {label} <ArrowRight className="w-3 h-3" /> {targetStation?.lineId}
                            </div>

                            <div className="flex items-center gap-3">
                                {targetStation && (
                                    <div className={cn("px-2 py-1 rounded-md text-xs font-bold", targetLineColor, targetStation?.lineId === 'MRT3' ? 'text-black' : 'text-white')}>
                                        {targetBadge}
                                    </div>
                                )}
                                <div className="flex-1 min-w-0">
                                    <Marquee
                                        text={targetStation ? targetStation.name : "Select Destination"}
                                        className="text-2xl font-bold text-white leading-tight"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Transfer Info (Dynamic) */}
                        {origin && activeDest && origin.lineId !== activeDest.lineId && (
                            <div>
                                <div className="text-xs text-white/60 mb-1">Transfer Point</div>
                                <div className="flex items-center gap-2">
                                    <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-bold", getLineColor(activeDest.lineId), activeDest.lineId === 'MRT3' ? 'text-black' : 'text-white')}>
                                        {activeDest.lineId}
                                    </span>
                                    <span className="text-sm font-bold text-white">
                                        {getTransferStationName(origin.lineId, activeDest.lineId)}
                                    </span>
                                </div>
                            </div>
                        )}

                        {/* Footer: Ticket Type & Fare */}
                        <div className="pt-4 border-t border-zinc-800/50 flex flex-col gap-2">
                            {/* Fare Breakdown Details */}
                            {origin && activeDest && origin.lineId !== activeDest.lineId && (
                                (() => {
                                    // Calculate Breakdown
                                    const breakdown = getFareBreakdown(origin, activeDest, ticketType as any || 'SJT');
                                    return (
                                        <div className="bg-black/40 rounded-lg p-3 mb-2 text-xs space-y-2 border border-white/5 animate-in fade-in slide-in-from-top-2">
                                            <div className="flex justify-between text-white/60 uppercase font-bold tracking-wider text-[10px]">
                                                <span>Fare Breakdown</span>
                                            </div>
                                            <div className="space-y-1">
                                                {breakdown.lrt1 > 0 && (
                                                    <div className="flex justify-between text-white/80">
                                                        <span>LRT-1</span>
                                                        <span>₱{breakdown.lrt1}</span>
                                                    </div>
                                                )}
                                                {breakdown.lrt2 > 0 && (
                                                    <div className="flex justify-between text-white/80">
                                                        <span>LRT-2</span>
                                                        <span>₱{breakdown.lrt2}</span>
                                                    </div>
                                                )}
                                                {breakdown.mrt3 > 0 && (
                                                    <div className="flex justify-between text-white/80">
                                                        <span>MRT-3</span>
                                                        <span>₱{breakdown.mrt3}</span>
                                                    </div>
                                                )}
                                                {breakdown.mrt7 > 0 && (
                                                    <div className="flex justify-between text-white/80">
                                                        <span>MRT-7</span>
                                                        <span>₱{breakdown.mrt7}</span>
                                                    </div>
                                                )}
                                                <div className="border-t border-white/10 pt-1 flex justify-between font-bold text-white mt-1">
                                                    <span>Total</span>
                                                    <span>₱{breakdown.total}</span>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })()
                            )}

                            <div className="flex items-center justify-between">
                                <div className="text-sm text-white/70">Total Fare</div>
                                <div className="flex items-center gap-2">
                                    <span className="text-xl font-bold text-white">₱{runningFare}</span>
                                    <span className="text-xs text-white/60 uppercase border border-white/20 rounded px-1.5 py-0.5">
                                        {ticketType === 'BUS_REGULAR' ? 'REGULAR' : ticketType}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Progress Bar Moved to Footer */}
                    </div>

                    {/* Right: Steps / Visualizer */}
                    <div className="col-span-1 bg-zinc-950/50 rounded-2xl p-4 flex flex-col items-center justify-center space-y-2 border border-zinc-800/50">
                        <div className="text-xs text-white/60 uppercase tracking-wider text-center">Stops</div>

                        {/* Big Counter or Split View */}
                        <div className="flex-1 flex flex-col items-center justify-center w-full">
                            {stopsToTransfer !== null && stopsToTransfer !== undefined && stopsAfterTransfer !== null && origin && destination ? (
                                // Split View (Transfer)
                                <div className="flex flex-col items-center gap-3 animate-in fade-in slide-in-from-right-4 my-1">
                                    {/* Leg 1 */}
                                    <div className="text-center">
                                        <div className="text-3xl font-black text-white leading-none tracking-tighter">
                                            {stopsToTransfer}
                                        </div>
                                        <div className={cn("text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full mt-1", getLineColor(origin.lineId), origin.lineId === 'MRT3' ? 'text-black' : 'text-white')}>
                                            {origin.lineId}
                                        </div>
                                    </div>

                                    {/* Arrow */}
                                    <ArrowDown className="w-5 h-5 text-white/60 animate-bounce" />

                                    {/* Leg 2 */}
                                    <div className="text-center">
                                        <div className="text-2xl font-black text-white/40 leading-none tracking-tighter">
                                            {stopsAfterTransfer}
                                        </div>
                                        <div className={cn("text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full mt-1", getLineColor((nextLegLineId || destination.lineId) as any), (nextLegLineId || destination.lineId) === 'MRT3' ? 'text-black' : 'text-white')}>
                                            {nextLegLineId || destination.lineId}
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                // Standard Single Counter
                                <>
                                    <div className="text-5xl font-black text-white tracking-tighter">
                                        {stopsRemaining ?? '-'}
                                    </div>
                                    <div className="text-[10px] text-white/60 uppercase text-center mt-2">
                                        {activeLineId} Line
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                </div>
            )
            }

            {/* Shared Footer: Trip Progress */}
            <div className="px-6 pb-6">
                <div className="space-y-1">
                    <div className="flex justify-between text-[10px] text-white/60 uppercase font-bold tracking-wider">
                        <span>Trip Progress</span>
                        <span>{Math.round(tripPercent)}%</span>
                    </div>
                    <div
                        className="w-full h-1 bg-zinc-800 rounded-full overflow-hidden"
                        aria-label={`Trip progress ${Math.round(tripPercent)} percent`}
                        title={`Leg ${Math.round(legPercent)}%, trip ${Math.round(tripPercent)}%`}
                    >
                        <div
                            className={cn("h-full transition-all duration-500 ease-out", theme.accent)}
                            style={{ width: `${tripPercent}%` }}
                        />
                    </div>
                </div>
            </div>
        </div >
    );
}
