'use client';

import { useState } from 'react';
import { History, ChevronRight, TrainFront } from 'lucide-react';
import { TripRecord } from '@/hooks/useTripHistory';
import { getLineColor, getStationBadge } from '@/utils/stationUtils';
import { cn } from '@/lib/utils';

interface RecentTripsCardProps {
    trips: TripRecord[];
    onViewAll: () => void;
}

function timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
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

export default function RecentTripsCard({ trips, onViewAll }: RecentTripsCardProps) {
    const [visible, setVisible] = useState(true);

    if (!visible) return null;

    return (
        <div className="w-full animate-in fade-in slide-in-from-bottom-2 duration-500">
            {/* Header */}
            <div className="flex items-center justify-between mb-3 px-1">
                <div className="flex items-center gap-2">
                    <History className="w-3.5 h-3.5 text-white/30" />
                    <span className="text-[11px] font-bold uppercase tracking-widest text-white/30">Recent Trips</span>
                </div>
                {trips.length > 0 && (
                    <button
                        onClick={onViewAll}
                        className="flex items-center gap-0.5 text-[11px] font-bold text-white/40 hover:text-white/70 transition-colors group"
                    >
                        View All
                        <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                    </button>
                )}
            </div>

            {trips.length === 0 ? (
                <div className="bg-white/[0.03] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-6 flex flex-col items-center gap-2">
                    <TrainFront className="w-6 h-6 text-white/10" />
                    <p className="text-xs text-white/25 font-medium text-center">No trips yet — complete a ride to start tracking!</p>
                </div>
            ) : (
                <div className="bg-white/[0.03] backdrop-blur-xl border border-white/[0.06] rounded-2xl overflow-hidden divide-y divide-white/[0.04]">
                    {trips.map((trip, idx) => {
                        const lineColor = getLineAccent(trip.line_id);

                        return (
                            <button
                                key={trip.id}
                                onClick={onViewAll}
                                className="w-full flex items-center gap-3 p-3.5 hover:bg-white/[0.03] transition-colors text-left group"
                                style={{
                                    animation: `rtFadeIn 400ms ease-out forwards`,
                                    animationDelay: `${idx * 80}ms`,
                                    opacity: 0,
                                }}
                            >
                                {/* Line accent dot */}
                                {trip.destination_line_id ? (
                                    <div className="w-1.5 h-8 rounded-full shrink-0 overflow-hidden flex flex-col">
                                        <div className={cn("flex-1", lineColor)} />
                                        <div className={cn("flex-1", getLineAccent(trip.destination_line_id))} />
                                    </div>
                                ) : (
                                    <div className={cn("w-1.5 h-8 rounded-full shrink-0", lineColor)} />
                                )}

                                {/* Route info */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-sm font-bold text-white truncate">{trip.origin_name}</span>
                                        <span className="text-white/20 text-xs shrink-0">→</span>
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
                                        <span className="text-[10px] text-white/30">{timeAgo(trip.completed_at)}</span>
                                    </div>
                                </div>

                                {/* Fare */}
                                <div className="text-right shrink-0">
                                    <span className="text-sm font-bold text-white/70">₱{Number(trip.fare).toFixed(0)}</span>
                                </div>
                            </button>
                        );
                    })}
                </div>
            )}

            <style jsx>{`
                @keyframes rtFadeIn {
                    from { opacity: 0; transform: translateY(4px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `}</style>
        </div>
    );
}
