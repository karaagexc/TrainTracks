"use client";

import { Station } from "@/types";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface TrackingCardProps {
    currentStation: Station | null;
    nextStation: Station | null;
    prevStation: Station | null;
    status: 'STOPPED' | 'MOVING';
    heading: string;
}

export function TrackingCard({ currentStation, nextStation, prevStation, status, heading }: TrackingCardProps) {
    const displayStation = status === 'STOPPED' ? currentStation : nextStation;
    if (!displayStation) return null;
    const lineId = displayStation.lineId ?? 'MRT3';
    const badgeVariant = lineId.toLowerCase() as any;

    return (
        <div className="bg-white text-black p-6 rounded-3xl shadow-xl w-full max-w-sm mx-auto space-y-6">
            {/* Top Header */}
            <div className="flex items-center justify-between">
                <Badge variant={badgeVariant} className="px-3 py-1 text-xs">
                    {lineId === 'LRT1' ? 'GL10' : lineId === 'LRT2' ? 'MA6' : lineId === 'MRT7' ? 'MR7' : 'MR3'}
                </Badge>
                <span className={cn(
                    "text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded",
                    status === 'STOPPED' ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"
                )}>
                    {status === 'STOPPED' ? 'Now At' : 'Next Stn'}
                </span>
            </div>

            {/* Center Station Name */}
            <div className="text-center space-y-1">
                <h1 className="text-3xl font-black tracking-tight">{displayStation.name}</h1>
                {status === 'MOVING' && (
                    <p className="text-sm font-medium text-blue-600 animate-pulse">
                        Arriving in ~2 mins
                    </p>
                )}
            </div>

            {/* Bottom Nav */}
            <div className="flex items-center justify-between pt-4 border-t border-zinc-100">
                <div className="flex items-center gap-2 opacity-50">
                    <ChevronLeft className="w-4 h-4" />
                    <div className="text-left">
                        <p className="text-[10px] uppercase font-bold text-zinc-400">Previous</p>
                        <p className="text-xs font-semibold truncate max-w-[80px]">
                            {prevStation?.name || "---"}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2 text-right">
                    <div className="text-right">
                        <p className="text-[10px] uppercase font-bold text-zinc-400">Next</p>
                        <p className="text-xs font-semibold truncate max-w-[80px]">
                            {nextStation?.name || "---"}
                        </p>
                    </div>
                    <ChevronRight className="w-4 h-4" />
                </div>
            </div>
        </div>
    );
}
