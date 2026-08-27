"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import { LINES } from "@/data/stations";
import { getLineColor, getStationBadge, getThemeColors, getDoorSide } from "@/utils/stationUtils";
import { Navigation, ArrowUp, ArrowDown, ArrowLeft, ArrowRight } from "lucide-react";
import { useTripStore } from "@/store/useTripStore";
import { Direction, Station } from "@/types";
import { StationInfoModal } from "@/components/StationInfoModal";
import { directionShortLabel, getNetworkStations, getOperationalMode, isForwardDirection } from "@/domain/railway";

export function LineExplorer() {
    const { origin, direction: tripDirection, currentStation, line7Mode } = useTripStore();
    const isDevMode = useTripStore(s => s.isDevMode);
    const [activeLine, setActiveLine] = useState<'LRT1' | 'LRT2' | 'MRT3' | 'MRT7'>('LRT1');
    const [viewDirection, setViewDirection] = useState<Direction>('NORTHBOUND');
    const [selectedStation, setSelectedStation] = useState<Station | null>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const lastInteraction = useRef<number>(0);

    // Event-driven gradient flash (triggers on line switch or station change)
    const [gradientFlash, setGradientFlash] = useState(false);
    useEffect(() => {
        setGradientFlash(true);
        const t = setTimeout(() => setGradientFlash(false), 3000);
        return () => clearTimeout(t);
    }, [activeLine, currentStation?.id]);

    // Auto-Select Line based on Origin/Current
    useEffect(() => {
        if (currentStation) {
            setActiveLine(currentStation.lineId as any);
        } else if (origin) {
            setActiveLine(origin.lineId as any);
        }
    }, [origin, currentStation]);

    // Auto-Switch Direction based on Real Movement
    useEffect(() => {
        if (tripDirection) {
            // If the app detects we are moving South, switch POV to South
            // If moving North, switch POV to North
            setViewDirection(tripDirection);
        }
    }, [tripDirection]);

    // Filter and Sort Stations based on Direction
    const operationalMode = getOperationalMode(isDevMode, line7Mode);
    const allFilteredStations = getNetworkStations(operationalMode, line7Mode);
    const filteredStations = allFilteredStations
        .filter(s => s.lineId === activeLine)
        .sort((a, b) => {
            return isForwardDirection(viewDirection)
                ? b.order - a.order // Descending for Southbound
                : a.order - b.order; // Ascending for Northbound
        });

    // Auto-Revert Logic
    const isBrowsingRef = useRef(false);
    const interactionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const isProgrammaticScroll = useRef(false); // Prevent scroll events from programmatic scrolls

    const scrollToCurrent = useCallback((forceLineSwitch = false) => {
        if (!currentStation) return;

        // If we need to switch lines first, do that and scroll after React re-renders
        if (forceLineSwitch && currentStation.lineId !== activeLine) {
            setActiveLine(currentStation.lineId as any);
            isBrowsingRef.current = false;
            // The useEffect on [activeLine, currentStation] will handle scrolling after re-render
            return;
        }

        if (!listRef.current) return;

        const container = listRef.current;
        const activeItem = container.querySelector(`[data-station-id="${currentStation.id}"]`) as HTMLElement;

        if (activeItem) {
            const containerRect = container.getBoundingClientRect();
            const itemRect = activeItem.getBoundingClientRect();
            const scrollOffset = itemRect.left - containerRect.left - (containerRect.width / 2) + (itemRect.width / 2);

            isProgrammaticScroll.current = true;
            container.scrollTo({
                left: container.scrollLeft + scrollOffset,
                behavior: 'smooth'
            });
            // Release the lock after the smooth scroll finishes (~500ms)
            setTimeout(() => { isProgrammaticScroll.current = false; }, 600);
            isBrowsingRef.current = false;
        }
    }, [activeLine, currentStation]);

    const startInactivityTimer = useCallback(() => {
        if (interactionTimeoutRef.current) clearTimeout(interactionTimeoutRef.current);
        interactionTimeoutRef.current = setTimeout(() => {
            scrollToCurrent(true); // Force revert (including line switch) after 10s
        }, 10000);
    }, [scrollToCurrent]);

    const handleScroll = () => {
        // Ignore scroll events caused by our own scrollTo calls
        if (isProgrammaticScroll.current) return;
        isBrowsingRef.current = true;
        startInactivityTimer();
    };

    // Auto-scroll on station change or line switch (always, even if browsing — station change is a real event)
    useEffect(() => {
        if (!listRef.current || !filteredStations.length) return;

        // Small delay to ensure layout is ready after line switch
        const t = setTimeout(() => scrollToCurrent(false), 150);
        return () => clearTimeout(t);
    }, [currentStation?.id, activeLine, filteredStations.length, scrollToCurrent]);

    const theme = getThemeColors(activeLine);

    return (
        <div className={cn("w-full max-w-md md:max-w-2xl lg:max-w-3xl backdrop-blur-3xl backdrop-saturate-150 rounded-3xl p-6 md:p-8 shadow-xl border text-white relative overflow-hidden transition-colors transform transition-all duration-500 hover:scale-[1.02]",
            theme.glass, theme.border
        )}>

            {/* Dynamic Gradient (Event-driven: flashes on line/station change) */}
            <div className={cn("absolute inset-0 bg-gradient-to-b pointer-events-none -z-10 transition-opacity duration-1000",
                gradientFlash ? "opacity-20" : "opacity-0",
                activeLine === 'LRT1' ? 'from-green-500' :
                    activeLine === 'LRT2' ? 'from-purple-500' :
                        activeLine === 'MRT7' ? 'from-mrt7' : 'from-yellow-500'
            )} />

            {/* Header Controls */}
            <div className="flex flex-col gap-4 mb-6">
                <div className="flex justify-between items-start">
                    <div>
                        <h2 className="text-xl font-bold text-white tracking-tight">Line Explorer</h2>
                        <div className="flex items-center gap-2 mt-1">
                            <span className={cn("w-2 h-2 rounded-full animate-pulse",
                                !isForwardDirection(viewDirection) ? "bg-emerald-400" : "bg-orange-400"
                            )} />
                            <p className="text-xs text-white/70 font-medium">
                                {activeLine === 'LRT2'
                                    ? (viewDirection === 'EASTBOUND' ? 'Eastbound (To Antipolo)' : 'Westbound (To Recto)')
                                    : (viewDirection === 'NORTHBOUND' ? 'Northbound POV' : 'Southbound POV')
                                }
                            </p>
                        </div>
                    </div>

                    {/* Checkbox-style Toggle for Direction */}
                    <div className="flex bg-black/40 p-1 rounded-full border border-zinc-800">
                        <button
                            onClick={() => setViewDirection(activeLine === 'LRT2' ? 'WESTBOUND' : 'NORTHBOUND')}
                            className={cn(
                                "px-3 py-1.5 rounded-full text-[10px] font-bold transition-all flex items-center gap-1",
                                !isForwardDirection(viewDirection) ? "bg-zinc-800 text-white shadow-sm hover:scale-105" : "text-white/60 hover:text-white"
                            )}
                        >
                            {directionShortLabel(activeLine === 'LRT2' ? 'WESTBOUND' : 'NORTHBOUND')}
                            {activeLine === 'LRT2' ? <ArrowLeft className="w-3 h-3" /> : <ArrowUp className="w-3 h-3" />}
                        </button>
                        <button
                            onClick={() => setViewDirection(activeLine === 'LRT2' ? 'EASTBOUND' : 'SOUTHBOUND')}
                            className={cn(
                                "px-3 py-1.5 rounded-full text-[10px] font-bold transition-all flex items-center gap-1",
                                isForwardDirection(viewDirection) ? "bg-zinc-800 text-white shadow-sm hover:scale-105" : "text-white/60 hover:text-white"
                            )}
                        >
                            {directionShortLabel(activeLine === 'LRT2' ? 'EASTBOUND' : 'SOUTHBOUND')}
                            {activeLine === 'LRT2' ? <ArrowRight className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
                        </button>
                    </div>
                </div>

                {/* Line Selector Tabs */}
                <div className="flex bg-zinc-950/50 p-1 rounded-xl border border-zinc-800/50">
                    {(['LRT1', 'LRT2', 'MRT3', 'MRT7'] as const)
                        .filter(lineId => lineId !== 'MRT7' || operationalMode === 'sandbox')
                        .map(lineId => (
                        <button
                            key={lineId}
                            onClick={() => setActiveLine(lineId)}
                            className={cn(
                                "flex-1 py-2 rounded-lg text-xs font-bold transition-all",
                                activeLine === lineId
                                    ? cn("text-white shadow-lg", getLineColor(lineId).replace('bg-', 'bg-').replace('text-', ''))
                                    : "text-white/60 hover:text-white hover:bg-white/5"
                            )}
                            style={{
                                backgroundColor: activeLine === lineId ? LINES[lineId].color : 'transparent'
                            }}
                        >
                            {LINES[lineId].name}
                        </button>
                    ))}
                </div>
            </div>

            {/* Timeline Visualization */}
            <div
                ref={listRef}
                onClick={() => { isBrowsingRef.current = true; startInactivityTimer(); }}
                onTouchStart={() => { isBrowsingRef.current = true; startInactivityTimer(); }}
                className="overflow-x-auto pb-6 no-scrollbar -mx-6 px-6" // Reduced padding
            >
                <div className="relative flex items-center min-w-max px-4 gap-12 text-center h-40"> {/* Compact Height h-40 */}

                    {/* The "Grey Rounded Slider" Track */}
                    {/* Positioned absolutely centered */}
                    <div className="absolute left-0 right-0 h-3 top-1/2 -translate-y-1/2 -z-20 bg-zinc-800/50 rounded-full mx-4" />

                    {/* Active Line Color Strip inside the track */}
                    <div className={cn("absolute left-0 right-0 h-1 top-1/2 -translate-y-1/2 -z-10 opacity-30 rounded-full transition-colors duration-500 mx-4",
                        activeLine === 'LRT1' ? 'bg-emerald-500' : activeLine === 'LRT2' ? 'bg-purple-500' : activeLine === 'MRT7' ? 'bg-mrt7' : 'bg-yellow-400'
                    )} />

                    {filteredStations.map((station, index) => {
                        // Highlight if this is the current station
                        const isCurrent = currentStation?.id === station.id;
                        const isOrigin = origin?.id === station.id;

                        const doorSide = getDoorSide(station.name, station.lineId);

                        // Determine colors

                        // Determine colors
                        const lineColor = getLineColor(station.lineId);
                        const badgeCode = getStationBadge(station.lineId, station.order);

                        // Render Helpers
                        // Renders a single centered bubble with optional arrows
                        const renderCenteredBubble = () => (
                            <div className={cn("absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center transition-all duration-300 z-20 hover:scale-110",
                                isCurrent ? "scale-110" : "scale-100"
                            )}>
                                {/* The Shape Body */}
                                <div className={cn("relative px-2 py-1 rounded-md shadow-lg flex items-center justify-center min-w-[36px]",
                                    lineColor, // bg-color
                                    // MRT-3 (yellow) keeps black text; all other lines use white
                                    station.lineId === 'MRT3' ? "text-black" : "text-white",
                                    // Current Station Glow
                                    isCurrent ? cn("transition-shadow duration-500",
                                        station.lineId === 'LRT1' ? "shadow-[0_0_20px_rgba(74,222,128,0.8)]" :
                                            station.lineId === 'LRT2' ? "shadow-[0_0_20px_rgba(192,132,252,0.8)]" :
                                                station.lineId === 'MRT7' ? "shadow-[0_0_20px_rgba(128,0,0,0.85)]" :
                                                    "shadow-[0_0_20px_rgba(250,204,21,0.8)]"
                                    ) : ""
                                )}>

                                    {/* ARROW UP (For Right Opening) */}
                                    {(doorSide === 'RIGHT' || doorSide === 'EITHER') && (
                                        <div className={cn("absolute w-0 h-0 border-x-[6px] border-x-transparent border-b-[6px]",
                                            "-top-[5px] border-b-current rotate-0",
                                            lineColor.replace('bg-', 'text-')
                                        )} />
                                    )}

                                    {/* ARROW DOWN (For Left Opening) */}
                                    {(doorSide === 'LEFT' || doorSide === 'EITHER') && (
                                        <div className={cn("absolute w-0 h-0 border-x-[6px] border-x-transparent border-b-[6px]",
                                            "-bottom-[5px] border-b-current rotate-180",
                                            lineColor.replace('bg-', 'text-')
                                        )} />
                                    )}

                                    <span className="text-[9px] font-black tracking-tighter">
                                        {badgeCode}
                                    </span>
                                </div>
                            </div>
                        );

                        return (
                            <div
                                key={station.id}
                                data-station-id={station.id}
                                className="flex flex-col items-center justify-center relative group cursor-pointer h-14 w-10 flex-shrink-0" // Reduced h-14 for centering
                                onClick={() => {
                                    setSelectedStation(station);
                                }}
                            >
                                {/* STATION NAME */}
                                <div className="absolute -top-8 left-1/2 -translate-x-1/2 w-32 text-center transition-all duration-300 z-10 flex justify-center pointer-events-none">
                                    <p className={cn("text-[10px] font-bold leading-tight transition-colors duration-300 whitespace-normal px-1 drop-shadow-md",
                                        isCurrent ? cn(
                                            station.lineId === 'LRT1' ? "text-green-400 scale-110" :
                                                station.lineId === 'LRT2' ? "text-purple-400 scale-110" :
                                                    station.lineId === 'MRT7' ? "text-[#d46a6a] scale-110" :
                                                        "text-yellow-400 scale-110"
                                        ) :
                                            "text-white/70 group-hover:text-white"
                                    )}>
                                        {station.name}
                                    </p>
                                </div>

                                {/* Render the Single Centered Bubble (No Ripple) */}
                                {renderCenteredBubble()}

                                {/* TRANSFER LABEL (Bottom) */}
                                {station.transfers && (
                                    <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 w-32 text-center z-10 flex flex-col items-center justify-center pointer-events-none">
                                        <p className="text-[8px] font-bold text-white/40 uppercase tracking-wider mb-0.5">
                                            Transfer to
                                        </p>
                                        {station.transfers.map(line => {
                                            let label: string = line;
                                            if (station.name === 'Taft Avenue' && line === 'LRT1') label = "LRT-1 EDSA";
                                            if (station.name === 'EDSA' && line === 'MRT3') label = "MRT-3 Taft";
                                            if (station.name === 'Doroteo Jose' && line === 'LRT2') label = "LRT-2 Recto";
                                            if (station.name === 'Recto' && line === 'LRT1') label = "LRT-1 D. Jose";
                                            if (station.name.includes('Cubao')) label = `${line} Cubao`;
                                            if (station.name === 'Roosevelt' || station.name === 'FPJ') label = `${line}`;

                                            return (
                                                <span key={line} className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded",
                                                    line === 'LRT1' ? "text-green-400 bg-green-900/20" :
                                                        line === 'LRT2' ? "text-purple-400 bg-purple-900/20" :
                                                            line === 'MRT7' ? "text-[#d46a6a] bg-mrt7/20" :
                                                                "text-yellow-400 bg-yellow-900/20"
                                                )}>
                                                    {label}
                                                </span>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Station Info Modal */}
            <StationInfoModal
                station={selectedStation}
                open={!!selectedStation}
                onClose={() => setSelectedStation(null)}
            />
        </div >
    );
}
