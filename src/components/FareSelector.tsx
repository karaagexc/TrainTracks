"use client";

import { useTripStore } from "@/store/useTripStore";
import { Ticket, CreditCard, ChevronDown, ChevronUp, User, X, ChevronLeft, MapPin } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { getDistanceKm } from "@/utils/geo";
import { getRoute } from "@/utils/simRoute";
import { getPrecisionFare } from "@/utils/fareNew";
import { cn } from "@/lib/utils";
import { getDirectionForStations, getNetworkStations, getOperationalMode } from "@/domain/railway";
import type { TicketType } from "@/types";

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function FareSelector({ open, onOpenChange }: Props) {
    const { setTicketType, startTrip, destination, setDestination, origin, setOrigin, setDirection, ticketType } = useTripStore();
    const line7Mode = useTripStore(s => s.line7Mode);
    const isDevMode = useTripStore(s => s.isDevMode);
    const rawTransitMode = useTripStore(s => s.transitMode);
    const transitMode = isDevMode ? rawTransitMode : 'train';
    const isBusMode = transitMode === 'bus';
    const displayStations = getNetworkStations(getOperationalMode(isDevMode, line7Mode), line7Mode, transitMode);
    const [step, setStep] = useState<'ORIGIN' | 'TYPE' | 'DESTINATION'>('TYPE');
    const [showDist, setShowDist] = useState(false);
    const [isStoredValueOpen, setIsStoredValueOpen] = useState(false);

    // Reset Step on Open
    useEffect(() => {
        if (open) {
            // If no origin is set (Mid-Trip or forgot to tap in), start at Origin selection
            if (!origin) {
                setStep('ORIGIN');
            } else {
                setStep('TYPE');
            }
            document.body.style.overflow = 'hidden';
            return () => { document.body.style.overflow = ''; };
        }
    }, [open, origin]);

    // Dynamic Badge Cycle
    useEffect(() => {
        const interval = setInterval(() => {
            setShowDist(prev => !prev);
        }, 3000);
        return () => clearInterval(interval);
    }, []);

    if (!open) return null;

    const handleSelectOrigin = (station: any) => {
        setOrigin(station);
        setStep('TYPE');
    };

    const handleSelectType = (type: TicketType) => {
        // ALWAYS go to destination picker for better UX (Fare Estimate & Tracking)
        if (!destination) {
            setTicketType(type); // Set type first
            setStep('DESTINATION'); // Then go to picker
            return;
        }

        // If destination already set (e.g. from previous), just update type and start
        setTicketType(type);
        startTrip();
        onOpenChange(false);
    };

    const handleSelectDestination = (station: any) => {
        setDestination(station);

        // Infer Direction from station ORDER, not lat/lon.
        // Latitude comparison fails on East-West lines like LRT-2
        // (Cubao→Betty Go: lat barely changes, but order decreases = NORTH).
        if (origin) {
            const route = getRoute(origin, station);
            const direction = route.length >= 2
                ? getDirectionForStations(route[0], route[1])
                : getDirectionForStations(origin, station);
            if (direction) {
                setDirection(direction);
            }
        }

        startTrip();
        onOpenChange(false);
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center px-8 py-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="w-full max-w-xs md:max-w-sm bg-zinc-900 border border-zinc-800 rounded-3xl p-5 shadow-2xl relative animate-in zoom-in-95 duration-300 flex flex-col max-h-[80vh]">

                {/* STEP 0: ORIGIN PICKER (For Mid-Trip / Manual Start) */}
                {step === 'ORIGIN' && (
                    <div className="flex flex-col h-full overflow-hidden animate-in slide-in-from-left-4 duration-300 fade-in">
                        <div className="text-center mb-6 pt-4">
                            <h2 className="text-xl font-bold tracking-tight text-white">Select Origin</h2>
                            <p className="text-white/70 text-sm mt-1">Where did you board?</p>
                        </div>

                        <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 space-y-2">
                            {displayStations.map((station) => (
                                <button
                                    key={station.id}
                                    onClick={() => handleSelectOrigin(station)}
                                    className="w-full flex items-center justify-between p-3 rounded-xl bg-zinc-800/50 border border-zinc-700/50 hover:bg-white hover:text-black transition-all group text-left"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={`w-2 h-2 rounded-full shrink-0 ${getDotColor(station.lineId)}`} />
                                        <span className="font-bold">{station.name}</span>
                                    </div>
                                    <div className="text-[10px] uppercase font-bold tracking-wider opacity-50 group-hover:opacity-100">
                                        {station.lineId}
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* STEP 1: FARE TYPE */}
                {step === 'TYPE' && (
                    <div className="flex flex-col h-full animate-in slide-in-from-right-4 duration-300 fade-in">
                        <div className="flex items-center gap-4 mb-4 flex-shrink-0 relative">
                            {/* Only show back button if we came from ORIGIN selection (meaning origin was manually set just now is tricky to track, but if we are in manual flow... logic: if we have separate tracking mod, but here simply: if we want to allow going back to Origin? Maybe not needed for MVP) */}
                            {/* Actually, if user selected Origin manually, they might want to go back. But 'UseTripStore' origin persists. */}
                            {/* For now, no back button on TYPE step unless we really need it. */}
                            <div className="w-full text-center pt-4">
                                <h2 className="text-xl font-bold tracking-tight text-white">{isBusMode ? 'Select Bus Fare' : 'Select Fare Type'}</h2>
                                <p className="text-white/70 text-sm mt-1">{isBusMode ? 'Choose your EDSA Carousel fare' : 'Choose your ticket to perform entry'}</p>
                            </div>
                        </div>

                        <div className="flex flex-col gap-3 overflow-y-auto pr-2 custom-scrollbar">
                            {isBusMode ? (
                                <>
                                    <button
                                        onClick={() => handleSelectType('BUS_REGULAR')}
                                        className="flex items-center gap-4 p-4 rounded-xl border border-zinc-700 bg-zinc-800/50 hover:bg-white hover:text-black hover:border-white transition-all group shrink-0"
                                    >
                                        <div className="p-3 rounded-full bg-zinc-900 group-hover:bg-zinc-200">
                                            <Ticket className="w-6 h-6" />
                                        </div>
                                        <div className="text-left min-w-0">
                                            <div className="font-bold text-lg">Regular</div>
                                            <div className="text-xs opacity-70">Standard EDSA Carousel fare</div>
                                        </div>
                                    </button>

                                    <button
                                        onClick={() => handleSelectType('CONCESSION')}
                                        className="flex items-center gap-4 p-4 rounded-xl border border-zinc-700 bg-zinc-800/50 hover:bg-white hover:text-black hover:border-white transition-all group shrink-0"
                                    >
                                        <div className="p-3 rounded-full bg-zinc-900 group-hover:bg-zinc-200">
                                            <User className="w-6 h-6" />
                                        </div>
                                        <div className="text-left min-w-0">
                                            <div className="font-bold text-lg">Student/PWD/Senior</div>
                                            <div className="text-xs opacity-70">Concession fare</div>
                                        </div>
                                    </button>
                                </>
                            ) : (
                                <>
                                    {/* 1. Single Journey */}
                                    <button
                                        onClick={() => handleSelectType('SJT')}
                                        className="flex items-center gap-4 p-4 rounded-xl border border-zinc-700 bg-zinc-800/50 hover:bg-white hover:text-black hover:border-white transition-all group shrink-0"
                                    >
                                        <div className="p-3 rounded-full bg-zinc-900 group-hover:bg-zinc-200">
                                            <Ticket className="w-6 h-6" />
                                        </div>
                                        <div className="text-left">
                                            <div className="font-bold text-lg">Single Journey</div>
                                            <div className="text-xs opacity-70">Standard ticket for one-way trip</div>
                                        </div>
                                    </button>

                                    {/* 2. Stored Value (Accordion) */}
                                    <div className="flex flex-col rounded-xl border border-zinc-700 bg-zinc-800/50 overflow-hidden shrink-0">
                                        <button
                                            onClick={() => setIsStoredValueOpen(!isStoredValueOpen)}
                                            className={cn(
                                                "flex items-center gap-4 p-4 w-full text-left transition-all hover:bg-white hover:text-black hover:border-white group",
                                                isStoredValueOpen ? "bg-zinc-800" : ""
                                            )}
                                        >
                                            <div className="p-3 rounded-full bg-zinc-900 group-hover:bg-zinc-200 flex items-center justify-center">
                                                <CreditCard className="w-6 h-6" />
                                            </div>
                                            <div className="flex-1">
                                                <div className="font-bold text-lg">Stored Value</div>
                                                <div className="text-xs opacity-70">Beep Card (Lower fares)</div>
                                            </div>
                                            {isStoredValueOpen ? <ChevronUp className="w-5 h-5 text-white/70" /> : <ChevronDown className="w-5 h-5 text-white/70" />}
                                        </button>

                                        {/* Dropdown Content */}
                                        {isStoredValueOpen && (
                                            <div className="flex flex-col p-2 gap-2 bg-zinc-900/50 border-t border-zinc-700 animate-in slide-in-from-top-2 duration-200">
                                                {/* Regular SVC */}
                                                <button
                                                    onClick={() => handleSelectType('SVC')}
                                                    className="flex items-center gap-3 p-3 rounded-lg hover:bg-zinc-800 transition-colors"
                                                >
                                                    <div className="w-2 h-2 rounded-full bg-blue-500 ml-2" />
                                                    <div className="text-left">
                                                        <div className="font-bold text-sm text-white">Regular</div>
                                                        <div className="text-[10px] text-white/60">Regular Beep / Debit / Credit</div>
                                                    </div>
                                                </button>

                                                {/* Concessionary */}
                                                <button
                                                    onClick={() => handleSelectType('CONCESSION')}
                                                    className="flex items-center gap-3 p-3 rounded-lg hover:bg-zinc-800 transition-colors"
                                                >
                                                    <div className="w-2 h-2 rounded-full bg-yellow-500 ml-2" />
                                                    <div className="text-left">
                                                        <div className="font-bold text-sm text-white">Concessionary</div>
                                                        <div className="text-[10px] text-white/60">Senior / PWD / Student (50% off)</div>
                                                    </div>
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                )}

                {/* STEP 2: DESTINATION PICKER */}
                {step === 'DESTINATION' && (
                    <div className="flex flex-col h-full overflow-hidden animate-in slide-in-from-right-4 duration-300 fade-in">
                        {/* Header with Back Button */}
                        <div className="flex items-center gap-4 mb-6 flex-shrink-0 relative">
                            <button
                                onClick={() => setStep('TYPE')}
                                className="p-2 rounded-full bg-zinc-800 hover:bg-zinc-700 text-white/70 hover:text-white transition-colors absolute left-0"
                            >
                                <ChevronLeft className="w-5 h-5" />
                            </button>
                            <div className="w-full text-center">
                                <h2 className="text-xl font-bold tracking-tight text-white">Select Destination</h2>
                                <p className="text-white/70 text-sm">Where are you headed?</p>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 space-y-2">
                            {displayStations
                                .filter(s => s.id !== origin?.id)
                                .filter(s => !isInvalidEdsaDirection(origin, s))
                                .map((station) => {
                                // Calculate Multi-Leg
                                let isMultiLeg = false;
                                if (origin) {
                                    const route = getRoute(origin, station);
                                    const distinctLines = new Set(route.map(r => r.lineId));
                                    isMultiLeg = distinctLines.size > 2;
                                }

                                return (
                                    <DestinationItem
                                        key={station.id}
                                        station={station}
                                        origin={origin}
                                        onClick={handleSelectDestination}
                                        showDist={showDist}
                                        isMultiLeg={isMultiLeg}
                                        ticketType={ticketType}
                                    />
                                );
                            })}
                        </div>
                    </div>
                )}

            </div>
        </div >
    );
}

function getDotColor(lineId: string): string {
    if (lineId === 'LRT1') return 'bg-lrt1';
    if (lineId === 'LRT2') return 'bg-lrt2';
    if (lineId === 'MRT7') return 'bg-mrt7';
    if (lineId === 'EDSA') return 'bg-[#8b7355]';
    return 'bg-mrt3';
}

function isInvalidEdsaDirection(origin: any, station: any): boolean {
    if (!origin || origin.lineId !== 'EDSA' || station.lineId !== 'EDSA') return false;
    if (station.order > origin.order) {
        return origin.directionAvailability === 'northbound_only' || station.directionAvailability === 'northbound_only';
    }
    if (station.order < origin.order) {
        return origin.directionAvailability === 'southbound_only' || station.directionAvailability === 'southbound_only';
    }
    return false;
}

// Sub-component to handle fade logic cleaner
function DestinationItem({ station, origin, onClick, showDist, isMultiLeg, ticketType }: { station: any, origin: any, onClick: any, showDist: boolean, isMultiLeg: boolean, ticketType: TicketType | null }) {
    // Distance Calculation
    const distMeters = origin ? Math.round(getDistanceKm(origin, station) * 1000) : 0;
    const distText = distMeters < 1000 ? `${distMeters}m` : `${(distMeters / 1000).toFixed(1)}km`;

    // Fare Calculation
    let fareText = '';
    if (origin && (ticketType === 'SJT' || origin.lineId === 'EDSA')) {
        const fare = getPrecisionFare(origin, station, ticketType ?? 'BUS_REGULAR');
        if (fare > 0) fareText = `₱${fare}`;
    }

    return (
        <button
            onClick={() => onClick(station)}
            className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all group text-left border relative overflow-hidden
                ${isMultiLeg
                    ? 'bg-amber-900/20 border-amber-500/30 hover:bg-amber-100 hover:text-amber-900'
                    : 'bg-zinc-800/50 border-zinc-700/50 hover:bg-white hover:text-black'
                }`}
        >
            {/* 1. Left Icon (Line Color) */}
            <div className={`w-2 h-2 rounded-full shrink-0 ${getDotColor(station.lineId)}`} />

            {/* 2. Middle Text (Flex Grow + Min Width 0 for Truncation) */}
            <div className="flex flex-col min-w-0 flex-1">
                <span className="font-bold truncate" title={station.name}>{station.name}</span>
                {isMultiLeg && (
                    <span className="text-[10px] uppercase font-bold text-amber-500 flex items-center gap-1">
                        ⚠️ Multi-Leg • High Fare
                    </span>
                )}
            </div>

            {/* 3. Right Badge (Flex Shrink 0) */}
            <div className="flex flex-col items-end justify-center gap-0.5 shrink-0 z-10">

                {/* Fare Text */}
                {fareText && (
                    <span className="font-bold text-emerald-400 text-sm tracking-tight whitespace-nowrap">
                        {fareText}
                    </span>
                )}

                {/* Cycling Info (Line ID / Distance) - Stacked for simplicity or cycled */}
                <div className="relative h-4 w-16 flex items-center justify-end">
                    {/* Line ID */}
                    <span
                        className={`absolute right-0 text-[10px] uppercase font-bold tracking-wider transition-all duration-500 ease-in-out transform
                        ${showDist
                                ? 'opacity-0 translate-y-4'
                                : 'opacity-50 group-hover:opacity-100 translate-y-0'
                            }`}
                    >
                        {station.lineId}
                    </span>

                    {/* Distance Text */}
                    <span
                        className={`absolute right-0 text-[10px] font-mono font-bold tracking-wider transition-all duration-500 ease-in-out transform
                        ${showDist
                                ? 'opacity-100 translate-y-0'
                                : 'opacity-0 -translate-y-4'
                            } ${isMultiLeg ? 'text-amber-500' : 'text-emerald-500'}`}
                    >
                        {distText}
                    </span>
                </div>
            </div>
        </button >
    );
}
