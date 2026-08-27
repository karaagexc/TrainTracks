"use client";

import { useState } from "react";
import { useTripStore } from "@/store/useTripStore";
import { STATIONS } from "@/data/stations";
import { Bug, MapPin, X } from "lucide-react";
import { cn } from "@/lib/utils";

export function DevDashboard() {
    const {
        isGpsOverride, setGpsOverride: toggleGpsOverride,
        setSimulatedLocation,
        runningFare, currentStation, setCurrentStation
    } = useTripStore();

    const [isOpen, setIsOpen] = useState(false);
    const [targetStationId, setTargetStationId] = useState<string>("");

    // Hidden Toggle
    if (!isOpen) {
        return (
            <button
                onClick={() => setIsOpen(true)}
                className="fixed bottom-4 right-4 p-3 bg-zinc-900/50 rounded-full text-zinc-600 hover:text-white hover:bg-zinc-800 transition-all z-50 opacity-30 hover:opacity-100"
            >
                <Bug className="w-5 h-5" />
            </button>
        );
    }

    const handleTeleport = () => {
        const target = STATIONS.find(s => s.id === targetStationId);
        if (target) {
            // Force Override ON, Stop Sim, Clear Dest
            if (!isGpsOverride) toggleGpsOverride(true);
            // Force Override ON, Clear Dest
            if (!isGpsOverride) toggleGpsOverride(true);
            // setDestination(null); // Destination removed from store logic for Sim
            // Actually destination is still in store types? No, I will remove it.
            // Better to remove destination usage here too.
            setSimulatedLocation({ latitude: target.latitude, longitude: target.longitude });
            setCurrentStation(target);
        }
    };



    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
            <div className="w-full max-w-xs bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl p-4 space-y-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 font-mono uppercase tracking-widest text-xs text-zinc-500">
                        <Bug className="w-3 h-3" />
                        Debug Location
                    </div>
                    <button onClick={() => setIsOpen(false)} className="text-zinc-500 hover:text-white">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="p-3 rounded-lg bg-zinc-900 border border-zinc-800 space-y-2">
                    <div className="flex justify-between items-center text-xs">
                        <span className="text-zinc-500">Current</span>
                        <span className="font-bold">{currentStation?.name || "Unknown"}</span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                        <span className="text-zinc-500">Sim Destination</span>
                        <span className="font-bold text-amber-500">
                            {STATIONS.find(s => s.id === targetStationId)?.name || "—"}
                        </span>
                    </div>
                    <div className="h-px bg-zinc-800" />
                    <div className="flex justify-between items-center text-lg font-bold">
                        <span className="text-sm font-normal text-zinc-500">Fare</span>
                        <span className="text-green-500">₱{runningFare}</span>
                    </div>
                </div>

                <div className="space-y-3">
                    <select
                        value={targetStationId}
                        onChange={(e) => setTargetStationId(e.target.value)}
                        className="w-full p-2 rounded bg-zinc-900 border border-zinc-800 text-xs text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                    >
                        <option value="" disabled>Select Target Station</option>
                        {STATIONS.map(s => (
                            <option key={s.id} value={s.id}>
                                {s.name} ({s.lineId})
                            </option>
                        ))}
                    </select>

                    <div className="grid grid-cols-1 gap-2">
                        <button
                            onClick={handleTeleport}
                            disabled={!targetStationId}
                            className="flex items-center justify-center gap-2 p-3 rounded bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-xs font-bold transition-colors w-full"
                        >
                            <MapPin className="w-3 h-3" />
                            SET LOCATION
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
