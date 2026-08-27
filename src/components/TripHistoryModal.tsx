'use client';

import { useState, useEffect } from 'react';
import { X, History, ChevronDown, ChevronUp, TrainFront, Coins, Ruler, Timer, ArrowRight, Ticket, Compass, Calendar, Clock } from 'lucide-react';
import { TripRecord, TripStats } from '@/hooks/useTripHistory';
import { cn } from '@/lib/utils';
import { formatTripHistoryDirection } from '@/domain/tripHistory';

interface TripHistoryModalProps {
    isOpen: boolean;
    onClose: () => void;
    trips: TripRecord[];
    stats: TripStats;
    loading: boolean;
    onLoad: () => void;
}

function getLineAccent(lineId: string): string {
    switch (lineId) {
        case 'LRT1': return 'bg-green-500';
        case 'LRT2': return 'bg-purple-500';
        case 'MRT3': return 'bg-yellow-500';
        case 'EDSA': return 'bg-[#8b7355]';
        default: return 'bg-white/20';
    }
}

function getLineText(lineId: string): string {
    switch (lineId) {
        case 'LRT1': return 'text-green-400';
        case 'LRT2': return 'text-purple-400';
        case 'MRT3': return 'text-yellow-400';
        case 'EDSA': return 'text-[#8b7355]';
        default: return 'text-white/60';
    }
}

function getLineName(lineId: string): string {
    switch (lineId) {
        case 'LRT1': return 'LRT Line 1';
        case 'LRT2': return 'LRT Line 2';
        case 'MRT3': return 'MRT Line 3';
        case 'EDSA': return 'EDSA Carousel';
        default: return lineId;
    }
}

function formatDate(dateStr: string): string {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTime(dateStr: string): string {
    const d = new Date(dateStr);
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function getTicketLabel(type: string): string {
    switch (type) {
        case 'SJT': return 'Single Journey';
        case 'SVC': return 'Beep Card';
        case 'CONCESSION': return 'Student/PWD/Senior';
        case 'DEBIT': return 'Debit Card';
        case 'CREDIT': return 'Credit Card';
        case 'BUS_REGULAR': return 'Regular';
        default: return type;
    }
}

// Group trips by date
function groupByDate(trips: TripRecord[]): { date: string; trips: TripRecord[] }[] {
    const groups: Map<string, TripRecord[]> = new Map();
    for (const trip of trips) {
        const key = new Date(trip.completed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(trip);
    }
    return Array.from(groups.entries()).map(([date, trips]) => ({ date, trips }));
}

export default function TripHistoryModal({ isOpen, onClose, trips, stats, loading, onLoad }: TripHistoryModalProps) {
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [fadeIn, setFadeIn] = useState(false);

    useEffect(() => {
        if (isOpen) {
            onLoad();
            requestAnimationFrame(() => setFadeIn(true));
        } else {
            setFadeIn(false);
            setExpandedId(null);
        }
    }, [isOpen, onLoad]);

    if (!isOpen) return null;

    const handleClose = () => {
        setFadeIn(false);
        setTimeout(onClose, 250);
    };

    const grouped = groupByDate(trips);

    return (
        <div className={cn(
            "fixed inset-0 z-[200] flex flex-col transition-opacity duration-250",
            fadeIn ? "opacity-100" : "opacity-0"
        )}>
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/90 backdrop-blur-lg" onClick={handleClose} />

            {/* Modal */}
            <div className={cn(
                "relative flex flex-col w-full h-full bg-zinc-950/95 transition-transform duration-300",
                fadeIn ? "translate-y-0" : "translate-y-8"
            )}>
                {/* Header */}
                <div className="shrink-0 flex items-center justify-between px-5 pt-5 pb-4 border-b border-white/[0.06]">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
                            <History className="w-4 h-4 text-white/60" />
                        </div>
                        <div>
                            <h2 className="text-lg font-black text-white">Trip History</h2>
                            <p className="text-[10px] text-white/30 font-medium">
                                {stats.totalTrips} trip{stats.totalTrips !== 1 ? 's' : ''} recorded
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={handleClose}
                        className="p-2 rounded-full bg-white/5 hover:bg-white/10 transition-colors"
                    >
                        <X className="w-5 h-5 text-white/50" />
                    </button>
                </div>

                {/* Stats Banner */}
                {stats.totalTrips > 0 && (
                    <div className="shrink-0 grid grid-cols-3 gap-2 px-5 py-4 border-b border-white/[0.04]">
                        <div className="bg-white/[0.03] border border-white/[0.05] rounded-xl p-3 text-center">
                            <Coins className="w-3.5 h-3.5 text-emerald-400 mx-auto mb-1" />
                            <div className="text-xs text-white/30 uppercase tracking-wider font-bold">Spent</div>
                            <div className="text-base font-black text-white mt-0.5">₱{stats.totalFare.toFixed(0)}</div>
                        </div>
                        <div className="bg-white/[0.03] border border-white/[0.05] rounded-xl p-3 text-center">
                            <Ruler className="w-3.5 h-3.5 text-blue-400 mx-auto mb-1" />
                            <div className="text-xs text-white/30 uppercase tracking-wider font-bold">Distance</div>
                            <div className="text-base font-black text-white mt-0.5">{stats.totalDistance.toFixed(1)}km</div>
                        </div>
                        <div className="bg-white/[0.03] border border-white/[0.05] rounded-xl p-3 text-center">
                            <TrainFront className="w-3.5 h-3.5 text-purple-400 mx-auto mb-1" />
                            <div className="text-xs text-white/30 uppercase tracking-wider font-bold">Trips</div>
                            <div className="text-base font-black text-white mt-0.5">{stats.totalTrips}</div>
                        </div>
                    </div>
                )}

                {/* Scrollable Trip List */}
                <div className="flex-1 overflow-y-auto overscroll-contain pb-safe">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-20 gap-3">
                            <div className="w-10 h-10 rounded-full border-2 border-white/10 border-t-white/40 animate-spin" />
                            <p className="text-xs text-white/30 font-medium">Loading trips...</p>
                        </div>
                    ) : trips.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 gap-4 px-8">
                            <div className="w-16 h-16 rounded-full bg-white/[0.03] border border-white/[0.06] flex items-center justify-center">
                                <TrainFront className="w-7 h-7 text-white/15" />
                            </div>
                            <div className="text-center">
                                <p className="text-sm font-bold text-white/40">No trips yet</p>
                                <p className="text-xs text-white/20 mt-1">Complete your first ride to start tracking!</p>
                            </div>
                        </div>
                    ) : (
                        <div className="px-4 py-3">
                            {grouped.map((group, gi) => (
                                <div key={group.date} className="mb-4">
                                    {/* Date header */}
                                    <div className="flex items-center gap-2 px-2 mb-2">
                                        <Calendar className="w-3 h-3 text-white/20" />
                                        <span className="text-[10px] font-bold uppercase tracking-widest text-white/20">{group.date}</span>
                                    </div>

                                    <div className="space-y-2">
                                        {group.trips.map((trip, idx) => {
                                            const isExpanded = expandedId === trip.id;
                                            const lineColor = getLineAccent(trip.line_id);

                                            return (
                                                <div
                                                    key={trip.id}
                                                    className={cn(
                                                        "bg-white/[0.02] border rounded-2xl overflow-hidden transition-all duration-300",
                                                        isExpanded ? "border-white/10 bg-white/[0.04]" : "border-white/[0.04]"
                                                    )}
                                                    style={{
                                                        animation: `thFadeIn 350ms ease-out forwards`,
                                                        animationDelay: `${(gi * 3 + idx) * 60}ms`,
                                                        opacity: 0,
                                                    }}
                                                >
                                                    {/* Collapsed Row */}
                                                    <button
                                                        onClick={() => setExpandedId(isExpanded ? null : trip.id)}
                                                        className="w-full flex items-center gap-3 p-3.5 text-left group"
                                                    >
                                                        {/* Line accent */}
                                                        {trip.destination_line_id ? (
                                                            <div className="w-1 h-10 rounded-full shrink-0 overflow-hidden flex flex-col">
                                                                <div className={cn("flex-1", lineColor)} />
                                                                <div className={cn("flex-1", getLineAccent(trip.destination_line_id))} />
                                                            </div>
                                                        ) : (
                                                            <div className={cn("w-1 h-10 rounded-full shrink-0", lineColor)} />
                                                        )}

                                                        {/* Route */}
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center gap-1.5">
                                                                <span className="text-sm font-bold text-white truncate">{trip.origin_name}</span>
                                                                <ArrowRight className="w-3 h-3 text-white/20 shrink-0" />
                                                                <span className="text-sm font-bold text-white truncate">{trip.destination_name}</span>
                                                            </div>
                                                            <div className="flex items-center gap-2 mt-0.5">
                                                                <span className={cn("text-[9px] font-black px-1.5 py-0.5 rounded text-black", lineColor)}>
                                                                    {trip.line_id}
                                                                </span>
                                                                {trip.destination_line_id && (
                                                                    <>
                                                                        <span className="text-white/20 text-[9px]">→</span>
                                                                        <span className={cn("text-[9px] font-black px-1.5 py-0.5 rounded text-black", getLineAccent(trip.destination_line_id))}>
                                                                            {trip.destination_line_id}
                                                                        </span>
                                                                    </>
                                                                )}
                                                                <span className="text-[10px] text-white/25">{formatTime(trip.completed_at)}</span>
                                                            </div>
                                                        </div>

                                                        {/* Fare + Chevron */}
                                                        <div className="flex items-center gap-2 shrink-0">
                                                            <span className="text-sm font-bold text-white/60">₱{Number(trip.fare).toFixed(0)}</span>
                                                            {isExpanded
                                                                ? <ChevronUp className="w-4 h-4 text-white/20" />
                                                                : <ChevronDown className="w-4 h-4 text-white/20 group-hover:text-white/40 transition-colors" />
                                                            }
                                                        </div>
                                                    </button>

                                                    {/* Expanded Details */}
                                                    {isExpanded && (
                                                        <div
                                                            className="px-4 pb-4 pt-1 border-t border-white/[0.04]"
                                                            style={{ animation: 'thSlideDown 250ms ease-out' }}
                                                        >
                                                            <div className="grid grid-cols-2 gap-2.5">
                                                                <div className="bg-black/30 rounded-xl p-3">
                                                                    <div className="flex items-center gap-1.5 mb-1">
                                                                        <TrainFront className="w-3 h-3 text-white/25" />
                                                                        <span className="text-[9px] font-bold uppercase tracking-wider text-white/25">Line</span>
                                                                    </div>
                                                                    <div className="flex items-center gap-1.5">
                                                                        <span className={cn("text-xs font-bold", getLineText(trip.line_id))}>{getLineName(trip.line_id)}</span>
                                                                        {trip.destination_line_id && (
                                                                            <>
                                                                                <ArrowRight className="w-3 h-3 text-white/20" />
                                                                                <span className={cn("text-xs font-bold", getLineText(trip.destination_line_id))}>{getLineName(trip.destination_line_id)}</span>
                                                                            </>
                                                                        )}
                                                                    </div>
                                                                </div>

                                                                {/* Ticket Type */}
                                                                <div className="bg-black/30 rounded-xl p-3">
                                                                    <div className="flex items-center gap-1.5 mb-1">
                                                                        <Ticket className="w-3 h-3 text-white/25" />
                                                                        <span className="text-[9px] font-bold uppercase tracking-wider text-white/25">Ticket</span>
                                                                    </div>
                                                                    <span className="text-xs font-bold text-white/70">{getTicketLabel(trip.ticket_type)}</span>
                                                                </div>

                                                                {/* Distance */}
                                                                <div className="bg-black/30 rounded-xl p-3">
                                                                    <div className="flex items-center gap-1.5 mb-1">
                                                                        <Ruler className="w-3 h-3 text-white/25" />
                                                                        <span className="text-[9px] font-bold uppercase tracking-wider text-white/25">Distance</span>
                                                                    </div>
                                                                    <span className="text-xs font-bold text-white/70">{Number(trip.distance_km).toFixed(2)} km</span>
                                                                </div>

                                                                {/* Direction */}
                                                                {trip.direction && (
                                                                    <div className="bg-black/30 rounded-xl p-3">
                                                                        <div className="flex items-center gap-1.5 mb-1">
                                                                            <Compass className="w-3 h-3 text-white/25" />
                                                                            <span className="text-[9px] font-bold uppercase tracking-wider text-white/25">Direction</span>
                                                                        </div>
                                                                        <span className="text-xs font-bold text-white/70">{formatTripHistoryDirection(trip.direction)}</span>
                                                                    </div>
                                                                )}

                                                                {/* Duration */}
                                                                {trip.duration_minutes && (
                                                                    <div className="bg-black/30 rounded-xl p-3">
                                                                        <div className="flex items-center gap-1.5 mb-1">
                                                                            <Timer className="w-3 h-3 text-white/25" />
                                                                            <span className="text-[9px] font-bold uppercase tracking-wider text-white/25">Duration</span>
                                                                        </div>
                                                                        <span className="text-xs font-bold text-white/70">{trip.duration_minutes} min</span>
                                                                    </div>
                                                                )}

                                                                {/* Fare */}
                                                                <div className="bg-black/30 rounded-xl p-3">
                                                                    <div className="flex items-center gap-1.5 mb-1">
                                                                        <Coins className="w-3 h-3 text-emerald-400/50" />
                                                                        <span className="text-[9px] font-bold uppercase tracking-wider text-white/25">Fare</span>
                                                                    </div>
                                                                    <span className="text-xs font-bold text-emerald-400">₱{Number(trip.fare).toFixed(2)}</span>
                                                                </div>
                                                            </div>

                                                            {/* Timestamps */}
                                                            <div className="flex items-center justify-between mt-3 px-1">
                                                                <div className="flex items-center gap-1.5">
                                                                    <Clock className="w-3 h-3 text-white/15" />
                                                                    <span className="text-[9px] text-white/15">
                                                                        {formatTime(trip.started_at)} — {formatTime(trip.completed_at)}
                                                                    </span>
                                                                </div>
                                                                <span className="text-[9px] text-white/10 font-mono">
                                                                    {trip.id.slice(0, 8)}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer branding */}
                <div className="shrink-0 flex items-center justify-center gap-1.5 py-3 border-t border-white/[0.04]">
                    <TrainFront className="w-3 h-3 text-zinc-800" />
                    <span className="text-[9px] font-bold tracking-[0.2em] text-zinc-800 uppercase">TrainTracks</span>
                </div>
            </div>

            <style jsx>{`
                @keyframes thFadeIn {
                    from { opacity: 0; transform: translateY(6px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                @keyframes thSlideDown {
                    from { opacity: 0; max-height: 0; }
                    to { opacity: 1; max-height: 500px; }
                }
            `}</style>
        </div>
    );
}
