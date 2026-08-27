"use client";

import { ArrowRight } from "lucide-react";

interface InfoCardProps {
    stopsRemaining: number;
    estimatedFare: number;
}

export function InfoCard({ stopsRemaining, estimatedFare }: InfoCardProps) {
    return (
        <div className="grid grid-cols-2 gap-4 w-full max-w-sm mx-auto">
            <div className="bg-[#1C1C1E] p-5 rounded-2xl flex flex-col justify-between h-32 relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                    <ArrowRight className="w-12 h-12 text-white" />
                </div>
                <span className="text-zinc-400 text-xs font-bold uppercase tracking-wider">Stops Left</span>
                <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-black text-white">{stopsRemaining}</span>
                    <span className="text-sm text-zinc-500 font-medium">stns</span>
                </div>
            </div>

            <div className="bg-[#1C1C1E] p-5 rounded-2xl flex flex-col justify-between h-32">
                <span className="text-zinc-400 text-xs font-bold uppercase tracking-wider">Fare</span>
                <div className="flex items-baseline gap-1">
                    <span className="text-xl font-medium text-lrt1">₱</span>
                    <span className="text-4xl font-black text-white">{estimatedFare}</span>
                </div>
            </div>
        </div>
    );
}
