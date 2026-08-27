"use client";

import { useTripStore } from "@/store/useTripStore";
import { STATIONS } from "@/data/stations";
import { useState } from "react";
import { Wrench, MapPin } from "lucide-react";
import { Card } from "@/components/ui/card";

export function DevControls() {
    const [isOpen, setIsOpen] = useState(false);
    const { setOrigin } = useTripStore();

    if (!isOpen) {
        return (
            <button
                onClick={() => setIsOpen(true)}
                className="fixed bottom-24 right-4 z-50 p-3 bg-zinc-900 rounded-full shadow-2xl border border-zinc-800 hover:scale-110 transition-transform"
            >
                <Wrench className="w-5 h-5 text-zinc-500" />
            </button>
        );
    }

    return (
        <Card className="fixed bottom-24 right-4 z-50 w-64 bg-black/90 backdrop-blur-xl border-zinc-800 shadow-2xl p-4 space-y-4">
            <div className="flex items-center justify-between">
                <h4 className="font-bold text-xs uppercase tracking-wider text-zinc-500">Div Simulator</h4>
                <button onClick={() => setIsOpen(false)} className="text-zinc-500 hover:text-white">✕</button>
            </div>

            <div className="space-y-2">
                <p className="text-xs font-medium text-white">Teleport to Station:</p>
                <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto">
                    {STATIONS.map(s => (
                        <button
                            key={s.id}
                            onClick={() => {
                                // In a real app we'd mock the navigator.geolocation. 
                                // Here we just shortcut to setting origin for the UI flow
                                setOrigin(s);
                                setIsOpen(false);
                            }}
                            className="flex items-center gap-2 text-left text-xs p-2 hover:bg-white/10 rounded-lg transition-colors"
                        >
                            <MapPin className="w-3 h-3 text-zinc-500" />
                            <span className="truncate">{s.name}</span>
                        </button>
                    ))}
                </div>
            </div>
        </Card>
    );
}
