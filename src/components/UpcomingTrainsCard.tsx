'use client';

import { useMemo } from 'react';
import { useTrainStore } from '@/store/useTrainStore';
import { useTripStore } from '@/store/useTripStore';
import {
    getTrainDirectionLabel,
    getTrainFreshnessLabel,
    getTrainSignalLabel,
    getTrainSpeedLabel,
    getTrainStatusLabel,
    TrainPresence,
} from '@/types/train';
import { getLineColor, getThemeColors, getStationBadge } from '@/utils/stationUtils';
import { cn } from '@/lib/utils';
import { Train, ArrowDown, ArrowUp, ArrowLeft, ArrowRight } from 'lucide-react';
import { Marquee } from '@/components/ui/Marquee';
import { getTerminusLabel, getNetworkStations, getLineStations, getOperationalMode, isForwardDirection } from '@/domain/railway';
import { getSegmentTime } from '@/data/segmentDistances';

const BADGE_STATIONS = getNetworkStations('sandbox', 'WITH_NA');

function sourceLabel(train: TrainPresence) {
    switch (train.source) {
        case 'predicted':
            return { text: 'Predicted', className: 'text-blue-400' };
        case 'crowd':
            return { text: 'Crowdsourced', className: 'text-cyan-400' };
        case 'simulated':
            return { text: 'Simulated', className: 'text-purple-400' };
        default:
            return { text: 'Live', className: 'text-green-400' };
    }
}

function freshnessMeta(train: TrainPresence) {
    if (train.freshness === 'stale') {
        return { dot: 'bg-amber-300', text: 'text-amber-300', chip: 'border-amber-300/20 bg-amber-300/10' };
    }
    if (train.freshness === 'aging') {
        return { dot: 'bg-cyan-300', text: 'text-cyan-300', chip: 'border-cyan-300/20 bg-cyan-300/10' };
    }
    return { dot: 'bg-emerald-400', text: 'text-emerald-400', chip: 'border-emerald-400/20 bg-emerald-400/10' };
}

function truthRank(train: TrainPresence): number {
    if (train.source === 'operator' || train.source === 'crowd' || train.source === 'simulated') return 0;
    return 1;
}

function getTrainLocationLabel(train: TrainPresence): string {
    const name = train.stationName || 'Unknown';
    switch (train.statusCode) {
        case 'AT_STATION': return name;
        case 'LEAVING_STATION': return `Leaving ${name}`;
        case 'IN_TRANSIT': return `\u2192 ${name}`;
        case 'APPROACHING_STATION': return `Arriving ${name}`;
        default: return name;
    }
}

function getTrainBadgeLabel(train: TrainPresence): string {
    if (!train.stationId) return '??';
    const station = BADGE_STATIONS.find((s) => s.id === train.stationId);
    if (!station) return '??';
    return getStationBadge(station.lineId, station.order);
}

function estimateEtaToStation(
    trainStationId: string | null,
    targetStationId: string,
    lineStations: { id: string; order: number; lineId: string }[],
    direction: string,
): { etaSeconds: number; stopsAway: number } | null {
    if (!trainStationId) return null;
    if (trainStationId === targetStationId) return { etaSeconds: 0, stopsAway: 0 };

    const trainIdx = lineStations.findIndex((s) => s.id === trainStationId);
    const targetIdx = lineStations.findIndex((s) => s.id === targetStationId);
    if (trainIdx < 0 || targetIdx < 0) return null;

    const forward = isForwardDirection(direction as any);
    if (forward && trainIdx > targetIdx) return null;
    if (!forward && trainIdx < targetIdx) return null;

    let totalSeconds = 0;
    const step = forward ? 1 : -1;
    let idx = trainIdx;
    let stopsAway = 0;

    while (idx !== targetIdx) {
        const nextIdx = idx + step;
        if (nextIdx < 0 || nextIdx >= lineStations.length) return null;
        const segTime = getSegmentTime(lineStations[idx].id, lineStations[nextIdx].id);
        totalSeconds += segTime ?? 120;
        if (stopsAway > 0) totalSeconds += 30;
        stopsAway++;
        idx = nextIdx;
    }

    return { etaSeconds: totalSeconds, stopsAway };
}

function formatApproachEta(etaSeconds: number, stopsAway: number): string {
    if (etaSeconds <= 0) return 'due now';
    const windowSeconds = Math.max(30, stopsAway * 20);
    const lowMin = Math.max(0, Math.floor((etaSeconds - windowSeconds) / 60));
    const highMin = Math.max(1, Math.ceil((etaSeconds + windowSeconds) / 60));
    if (lowMin === highMin) return `~${highMin} min`;
    return `${lowMin}-${highMin} min`;
}

function DirectionIcon({ direction }: { direction: string }) {
    if (direction === 'EASTBOUND') return <ArrowRight className="w-3 h-3 shrink-0 text-white/50" />;
    if (direction === 'WESTBOUND') return <ArrowLeft className="w-3 h-3 shrink-0 text-white/50" />;
    return direction === 'SOUTHBOUND'
        ? <ArrowDown className="w-3 h-3 shrink-0 text-white/50" />
        : <ArrowUp className="w-3 h-3 shrink-0 text-white/50" />;
}

export function UpcomingTrainsCard() {
    const trains = useTrainStore((s) => s.trains);
    const selectTrain = useTrainStore((s) => s.selectTrain);
    const setSpectatorMode = useTrainStore((s) => s.setSpectatorMode);
    const currentStation = useTripStore((s) => s.currentStation || s.origin);
    const direction = useTripStore((s) => s.direction);
    const status = useTripStore((s) => s.status);

    const isDevMode = useTripStore((s) => s.isDevMode);
    const line7Mode = useTripStore((s) => s.line7Mode);

    const lineStations = useMemo(() => {
        if (!currentStation) return [];
        return getLineStations(currentStation.lineId, getOperationalMode(isDevMode, line7Mode), line7Mode);
    }, [currentStation, isDevMode, line7Mode]);

    const upcomingTrains = useMemo(() => {
        if (!currentStation || !direction || !lineStations.length) return [];

        return trains
            .filter((train) => {
                if (train.lineId !== currentStation.lineId) return false;
                if (train.direction !== direction) return false;
                if (train.predictionScope === 'station') return false;
                if (!train.stationId) return false;

                const trainStation = lineStations.find((s) => s.id === train.stationId);
                if (!trainStation) return false;

                const forward = isForwardDirection(train.direction);
                if (forward) return trainStation.order <= currentStation.order;
                return trainStation.order >= currentStation.order;
            })
            .sort((left, right) => {
                const leftStation = lineStations.find((s) => s.id === left.stationId);
                const rightStation = lineStations.find((s) => s.id === right.stationId);
                const leftDist = Math.abs((leftStation?.order ?? 0) - currentStation.order);
                const rightDist = Math.abs((rightStation?.order ?? 0) - currentStation.order);
                return truthRank(left) - truthRank(right) || leftDist - rightDist || right.confidence - left.confidence;
            })
            .slice(0, 3);
    }, [trains, currentStation, direction, lineStations]);

    if (status === 'TRANSIT' || status === 'ARRIVED') {
        return null;
    }

    if (!currentStation || !direction) {
        return null;
    }

    const theme = getThemeColors(currentStation.lineId);
    const lineColor = getLineColor(currentStation.lineId);
    const gradientColor = currentStation.lineId === 'LRT1' ? 'from-green-500' :
        currentStation.lineId === 'LRT2' ? 'from-purple-500' :
            currentStation.lineId === 'MRT7' ? 'from-mrt7' : 'from-yellow-500';

    const badgeColor =
        currentStation.lineId === 'LRT1' ? 'bg-green-600' :
        currentStation.lineId === 'LRT2' ? 'bg-purple-600' :
        currentStation.lineId === 'MRT7' ? 'bg-mrt7' :
        currentStation.lineId === 'MRT3' ? 'bg-yellow-500' : 'bg-white/20';

    const badgeTextColor = currentStation.lineId === 'MRT3' ? 'text-black' : 'text-white';
    const directionLabel = getTrainDirectionLabel({ direction });
    const waitingDirectionLabel = directionLabel ? directionLabel.toLowerCase() : 'matching direction';
    const terminusLabel = getTerminusLabel(currentStation.lineId, direction);

    return (
        <div className={cn(
            "w-full max-w-md md:max-w-2xl lg:max-w-3xl mx-auto backdrop-blur-3xl backdrop-saturate-150 backdrop-brightness-50 shadow-[inset_0_0_20px_rgba(255,255,255,0.1)] rounded-3xl overflow-hidden border relative animate-in fade-in slide-in-from-bottom-2 duration-500",
            theme.glass, theme.border,
        )}>
            <div className={cn("absolute inset-0 bg-gradient-to-b opacity-10 pointer-events-none -z-10", gradientColor)} />

            <div className="flex items-center justify-between px-5 pt-4 pb-2 gap-2">
                <div className="flex items-center gap-2 min-w-0">
                    <Train className="w-4 h-4 shrink-0 text-white/50" />
                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-white/60 uppercase tracking-widest min-w-0">
                        <span className={cn("px-1.5 py-0.5 rounded font-black text-white shrink-0", lineColor)}>
                            {getStationBadge(currentStation.lineId, currentStation.order)}
                        </span>
                        <Marquee text={currentStation.name} className="flex-1 min-w-0" />
                    </div>
                </div>
                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-black/30 border border-white/10 shrink-0">
                    <DirectionIcon direction={direction} />
                    <span className="text-[9px] font-bold text-white/50 uppercase tracking-wider whitespace-nowrap">{directionLabel}</span>
                </div>
            </div>

            <div className="px-5 pb-4 space-y-2">
                {upcomingTrains.length === 0 ? (
                    <div className="p-4 rounded-xl bg-black/20 border border-white/5 text-center space-y-1">
                        <Train className="w-5 h-5 text-white/20 mx-auto" />
                        <p className="text-xs text-white/40">Waiting for {waitingDirectionLabel} trains...</p>
                        <p className="text-[10px] text-white/25">Crowd truth first, predictions as backup</p>
                    </div>
                ) : (
                    upcomingTrains.map((train, idx) => {
                        const source = sourceLabel(train);
                        const freshness = freshnessMeta(train);
                        const isStale = train.freshness === 'stale';
                        const approach = estimateEtaToStation(train.stationId, currentStation.id, lineStations, train.direction);
                        const etaDisplay = approach ? `ETA ${formatApproachEta(approach.etaSeconds, approach.stopsAway)}` : getTrainSpeedLabel(train);
                        const stopsLabel = approach && approach.stopsAway > 0 ? `${approach.stopsAway} stop${approach.stopsAway > 1 ? 's' : ''} away` : 'at station';
                        return (
                            <button
                                key={train.id}
                                onClick={() => { selectTrain(train.id); setSpectatorMode(true); }}
                                className={cn(
                                    "w-full flex items-center gap-3 p-3 rounded-xl bg-black/20 border border-white/5 transition-all animate-in fade-in slide-in-from-bottom-1 duration-300 text-left hover:bg-white/5 cursor-pointer",
                                    isStale && "opacity-75"
                                )}
                                style={{ animationDelay: `${idx * 80}ms` }}
                            >
                                <div className={cn("w-1 self-stretch rounded-full", lineColor)} />
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-black/40 border border-white/5">
                                            <div className={cn("w-1.5 h-1.5 rounded-full", freshness.dot, !isStale && "animate-pulse")} />
                                            <span className={cn("text-[9px] font-bold uppercase tracking-wider", freshness.text)}>
                                                {getTrainStatusLabel(train)}
                                            </span>
                                        </div>
                                        {idx === 0 && (
                                            <span className="px-1.5 py-0.5 rounded text-[8px] font-bold uppercase bg-emerald-500/20 text-emerald-400 animate-pulse">
                                                Next
                                            </span>
                                        )}
                                        <span className="px-1.5 py-0.5 rounded-full bg-white/5 border border-white/10 text-[8px] font-bold text-white/40 uppercase tracking-wider">
                                            {stopsLabel}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className={cn(
                                            "px-2 py-0.5 rounded-md text-[11px] font-black shrink-0 shadow-lg border border-white/10",
                                            badgeColor, badgeTextColor
                                        )}>
                                            {getTrainBadgeLabel(train)}
                                        </span>
                                        <Marquee text={getTrainLocationLabel(train)} className="text-sm font-bold text-white flex-1 min-w-0" />
                                    </div>
                                    <div className="flex items-center gap-2 mt-1">
                                        <span className="text-[10px] text-white/40">{etaDisplay}</span>
                                        <span className="text-[10px] text-white/20">/</span>
                                        <span className={cn("text-[10px] font-bold", source.className)}>{source.text}</span>
                                        <span className="text-[10px] text-white/20">/</span>
                                        <span className={cn("text-[10px] font-bold", freshness.text)}>{getTrainFreshnessLabel(train)}</span>
                                    </div>
                                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                        <span className={cn("rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider", freshness.chip, freshness.text)}>
                                            {Math.round(train.confidence * 100)}% confidence
                                        </span>
                                        <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white/45">
                                            {getTrainSignalLabel(train)}
                                        </span>
                                    </div>
                                </div>
                                <div className="flex flex-col items-end shrink-0">
                                    <span className="text-[10px] font-bold text-white/50">{directionLabel}</span>
                                    {terminusLabel && <span className="text-[9px] text-white/30">→ {terminusLabel}</span>}
                                </div>
                            </button>
                        );
                    })
                )}
            </div>
        </div>
    );
}
