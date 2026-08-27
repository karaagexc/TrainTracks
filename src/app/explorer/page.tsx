"use client";

import { useEffect, useMemo, useState } from "react";
import { LINES } from "@/data/stations";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useTripStore } from "@/store/useTripStore";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { getNetworkStations, getOperationalMode } from "@/domain/railway";

export default function ExplorerPage() {
    const [activeTab, setActiveTab] = useState<keyof typeof LINES>('LRT1');
    const { favorites, setOrigin, isDevMode, line7Mode } = useTripStore();
    const router = useRouter();

    const operationalMode = getOperationalMode(isDevMode, line7Mode);
    const networkStations = useMemo(
        () => getNetworkStations(operationalMode, line7Mode),
        [operationalMode, line7Mode],
    );
    const availableLineIds = useMemo(
        () => (Object.keys(LINES) as Array<keyof typeof LINES>)
            .filter((lineId) => networkStations.some((station) => station.lineId === lineId)),
        [networkStations],
    );

    useEffect(() => {
        if (availableLineIds.length > 0 && !availableLineIds.includes(activeTab)) {
            setActiveTab(availableLineIds[0]);
        }
    }, [activeTab, availableLineIds]);

    const stations = useMemo(
        () => networkStations
            .filter((station) => station.lineId === activeTab)
            .sort((left, right) => left.order - right.order),
        [activeTab, networkStations],
    );

    const startFavoriteTrip = (originId: string) => {
        const origin = networkStations.find((station) => station.id === originId);
        if (origin) {
            setOrigin(origin);
            router.push('/');
        }
    };

    const handleStationClick = (stationId: string) => {
        const station = networkStations.find((candidate) => candidate.id === stationId);
        if (station) {
            setOrigin(station);
            router.push('/');
        }
    };

    return (
        <div className="flex flex-col min-h-screen p-6 pb-24 space-y-8">
            <header className="pt-4 space-y-1">
                <h1 className="text-2xl font-bold">Line Explorer</h1>
                <p className="text-zinc-400 text-sm">View stations and saved trips.</p>
            </header>

            {favorites.length > 0 && (
                <section className="space-y-4">
                    <h2 className="text-sm font-bold uppercase text-zinc-500 tracking-wider">Favorites</h2>
                    <div className="grid gap-3">
                        {favorites.map((fav, i) => {
                            const origin = networkStations.find((station) => station.id === fav.originId);
                            const dest = networkStations.find((station) => station.id === fav.destId);
                            if (!origin || !dest) return null;
                            return (
                                <button
                                    key={`${fav.originId}-${fav.destId}-${i}`}
                                    onClick={() => startFavoriteTrip(fav.originId)}
                                    className="flex items-center justify-between p-4 bg-card rounded-2xl border border-white/5 active:scale-95 transition-transform"
                                >
                                    <div className="flex items-center gap-3">
                                        <Badge variant={String(origin.lineId ?? '').toLowerCase() as any}>L</Badge>
                                        <div className="text-left">
                                            <p className="font-bold text-sm">{origin.name}</p>
                                            <p className="text-xs text-zinc-500">to {dest.name}</p>
                                        </div>
                                    </div>
                                    <ArrowRight className="w-4 h-4 text-zinc-600" />
                                </button>
                            );
                        })}
                    </div>
                </section>
            )}

            <section className="space-y-4">
                <div className="flex p-1 bg-zinc-900 rounded-xl">
                    {availableLineIds.map((lineId) => (
                        <button
                            key={lineId}
                            onClick={() => setActiveTab(lineId)}
                            className={cn(
                                "flex-1 py-2 text-sm font-bold rounded-lg transition-all",
                                activeTab === lineId ? "bg-zinc-800 text-white shadow-sm" : "text-zinc-500 hover:text-zinc-300"
                            )}
                        >
                            {lineId}
                        </button>
                    ))}
                </div>

                <div className="space-y-3">
                    {stations.map((station) => (
                        <button
                            type="button"
                            key={station.id}
                            onClick={() => handleStationClick(station.id)}
                            className="group flex w-full items-center gap-4 p-3 rounded-xl hover:bg-white/5 transition-colors text-left"
                        >
                            <div className={cn(
                                "w-3 h-3 rounded-full ring-4 ring-black",
                                station.lineId === 'LRT1' ? "bg-lrt1" : station.lineId === 'LRT2' ? "bg-lrt2" : station.lineId === 'MRT7' ? "bg-mrt7" : "bg-mrt3"
                            )} />
                            <div className="flex-1">
                                <p className="font-medium text-sm">{station.name}</p>
                                {station.transfers && (
                                    <div className="flex gap-1 mt-0.5">
                                        {station.transfers.map((transfer) => (
                                            <span key={transfer} className="text-[10px] px-1.5 rounded bg-zinc-800 text-zinc-400">
                                                Transfer {transfer}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </button>
                    ))}
                </div>
            </section>
        </div>
    );
}
