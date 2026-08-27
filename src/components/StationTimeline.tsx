"use client";

import { Station } from "@/types";
import { cn } from "@/lib/utils";
import { Check, Circle } from "lucide-react";

interface StationTimelineProps {
    stations: Station[];
    currentStationId: string | null;
    status: 'IDLE' | 'WAITING' | 'TRANSIT' | 'ARRIVED';
}

export function StationTimeline({ stations, currentStationId, status }: StationTimelineProps) {
    const currentIndex = stations.findIndex(s => s.id === currentStationId);

    return (
        <div className="relative pl-6 space-y-8 my-8 before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-[2px] before:bg-zinc-800">
            {stations.map((station, index) => {
                const isPast = index < currentIndex;
                const isCurrent = index === currentIndex;
                const isFuture = index > currentIndex;

                return (
                    <div key={station.id} className={cn("relative flex items-center gap-4 transition-all", isPast && "opacity-30")}>
                        {/* Dot */}
                        <div className={cn(
                            "absolute -left-[24px] z-10 flex h-6 w-6 items-center justify-center rounded-full border-2 bg-black transition-colors",
                            isCurrent ? "border-white bg-white text-black scale-110" :
                                isPast ? "border-zinc-700 bg-zinc-900" : "border-zinc-600 bg-black"
                        )}>
                            {isPast && <Check className="h-3 w-3" />}
                            {isCurrent && <div className="h-2 w-2 rounded-full bg-black animate-ping" />}
                        </div>

                        {/* Content */}
                        <div className="flex flex-col">
                            <span className={cn("text-base font-semibold", isCurrent ? "text-white" : "text-zinc-400")}>
                                {station.name}
                            </span>
                            {station.transfers && (
                                <div className="flex gap-1 mt-1">
                                    {station.transfers.map(t => (
                                        <span key={t} className="px-1.5 py-0.5 rounded text-[10px] bg-zinc-800 text-zinc-300 font-mono">
                                            Transfer {t}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
