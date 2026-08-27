'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTrainStore } from '@/store/useTrainStore';
import {
    getTrainDirectionLabel,
    getTrainFreshnessLabel,
    getTrainLineLabel,
    getTrainSignalLabel,
    getTrainSpeedLabel,
    getTrainStatusLabel,
    getTrainTelemetryText,
    TrainPresence,
} from '@/types/train';
import { getLineColor, getThemeColors, getStationBadge } from '@/utils/stationUtils';
import { cn } from '@/lib/utils';
import { Eye, Train, MapPin, Navigation, Gauge, Crosshair, Activity } from 'lucide-react';
import type { LineId, Station } from '@/types';
import { getCongestionLevel, shouldDisplayCongestionOverlay } from '@/data/congestion';
import { useTripStore } from '@/store/useTripStore';
import { getNetworkStations, getLineStations, getOperationalMode, getTerminusLabel, isForwardDirection } from '@/domain/railway';
import { getSegmentTime } from '@/data/segmentDistances';
import { useMinuteClock } from '@/hooks/useMinuteClock';
import { StationInfoModal } from '@/components/StationInfoModal';

const BADGE_STATIONS = getNetworkStations('sandbox', 'WITH_NA');

function sourceMeta(train: TrainPresence) {
    switch (train.source) {
        case 'predicted':
            return { label: 'Predicted', className: 'bg-blue-500/20 text-blue-400' };
        case 'crowd':
            return { label: 'Crowdsourced', className: 'bg-cyan-500/20 text-cyan-400' };
        case 'simulated':
            return { label: 'Simulated', className: 'bg-purple-500/20 text-purple-400' };
        default:
            return { label: 'Live', className: 'bg-green-500/20 text-green-400' };
    }
}

function freshnessMeta(train: TrainPresence) {
    if (train.freshness === 'stale') {
        return { dot: 'bg-amber-300', className: 'bg-amber-300/10 text-amber-300 border-amber-300/20' };
    }
    if (train.freshness === 'aging') {
        return { dot: 'bg-cyan-300', className: 'bg-cyan-300/10 text-cyan-300 border-cyan-300/20' };
    }
    return { dot: 'bg-emerald-400', className: 'bg-emerald-400/10 text-emerald-400 border-emerald-400/20' };
}

function lineGradient(lineId: LineId | null) {
    return lineId === 'LRT1' ? 'from-green-500' :
        lineId === 'LRT2' ? 'from-purple-500' :
            lineId === 'MRT7' ? 'from-mrt7' : 'from-yellow-500';
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
    lineStations: Station[],
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

function FormatStatusDisplay({ train, className }: { train: TrainPresence; className?: string }) {
    const freshness = freshnessMeta(train);
    const isStale = train.freshness === 'stale';
    const badgeColor =
        train.lineId === 'LRT1' ? 'bg-green-600' :
        train.lineId === 'LRT2' ? 'bg-purple-600' :
        train.lineId === 'MRT7' ? 'bg-mrt7' :
        train.lineId === 'MRT3' ? 'bg-yellow-500 text-black' : 'bg-white/20 text-white';

    return (
        <div className="flex flex-col items-start space-y-2 mt-1">
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-black/40 backdrop-blur border border-white/10 shadow-inner">
                <div className={cn("w-2 h-2 rounded-full", freshness.dot, !isStale && "animate-pulse")} />
                <span className="text-[10px] font-bold uppercase tracking-wider text-white">
                    {getTrainStatusLabel(train)}
                </span>
            </div>
            <div className="flex items-center gap-2">
                {train.stationId && (
                    <div className={cn("px-2.5 py-1 rounded-md text-sm font-black shrink-0 shadow-lg border border-white/10", badgeColor)}>
                        {BADGE_STATIONS.find((station) => station.id === train.stationId)
                            ? getStationBadge(train.lineId, BADGE_STATIONS.find((station) => station.id === train.stationId)!.order)
                            : train.stationId}
                    </div>
                )}
                <div className={className}>{train.stationName || getTrainTelemetryText(train)}</div>
            </div>
        </div>
    );
}

export function SpectatorInfoCard() {
    const trains = useTrainStore((s) => s.trains);
    const selectedTrainId = useTrainStore((s) => s.selectedTrainId);
    const selectedStationCode = useTrainStore((s) => s.selectedStationCode);
    const followedTrainId = useTrainStore((s) => s.followedTrainId);
    const followTrain = useTrainStore((s) => s.followTrain);
    const selectTrain = useTrainStore((s) => s.selectTrain);
    const selectStation = useTrainStore((s) => s.selectStation);
    const showRushHour = useTripStore((s) => s.showRushHour);
    const isDevMode = useTripStore((s) => s.isDevMode);
    const line7Mode = useTripStore((s) => s.line7Mode);
    const congestionConfig = useTripStore((s) => s.congestionConfig);
    const congestionNow = useMinuteClock();

    const [animating, setAnimating] = useState(false);
    const [stationInfoOpen, setStationInfoOpen] = useState(false);

    const selectedTrain = useMemo(
        () => trains.find((train) => train.id === selectedTrainId) || null,
        [trains, selectedTrainId],
    );

    const selectedStation = useMemo<Station | null>(() => {
        if (!selectedStationCode) return null;
        return getNetworkStations(getOperationalMode(isDevMode, line7Mode), line7Mode)
            .find((station) => station.id === selectedStationCode) || null;
    }, [isDevMode, line7Mode, selectedStationCode]);

    const stationLineStations = useMemo(() => {
        if (!selectedStation) return [];
        return getLineStations(selectedStation.lineId, getOperationalMode(isDevMode, line7Mode), line7Mode);
    }, [selectedStation, isDevMode, line7Mode]);

    const upcomingAtStation = useMemo(() => {
        if (!selectedStation || !stationLineStations.length) return [];
        return trains
            .filter((train) => {
                if (train.lineId !== selectedStation.lineId) return false;
                if (train.predictionScope === 'station') return false;
                if (!train.stationId) return false;

                const trainStation = stationLineStations.find((s) => s.id === train.stationId);
                if (!trainStation) return false;

                const forward = isForwardDirection(train.direction);
                if (forward) return trainStation.order <= selectedStation.order;
                return trainStation.order >= selectedStation.order;
            })
            .sort((left, right) => {
                const leftStation = stationLineStations.find((s) => s.id === left.stationId);
                const rightStation = stationLineStations.find((s) => s.id === right.stationId);
                const leftDist = Math.abs((leftStation?.order ?? 0) - selectedStation.order);
                const rightDist = Math.abs((rightStation?.order ?? 0) - selectedStation.order);
                return truthRank(left) - truthRank(right) || leftDist - rightDist || right.confidence - left.confidence;
            });
    }, [trains, selectedStation, stationLineStations]);

    const trainsAtStation = useMemo(() => {
        if (!selectedStation) return [];
        return trains.filter((train) =>
            train.lineId === selectedStation.lineId &&
            train.stationId === selectedStation.id &&
            train.predictionScope !== 'station'
        );
    }, [trains, selectedStation]);

    const stationCongestion = useMemo(() => {
        if (!showRushHour || !selectedStation) return null;
        const congestion = getCongestionLevel(
            selectedStation.id,
            congestionNow,
            undefined,
            selectedStation.lineId,
            congestionConfig,
            trainsAtStation,
            getOperationalMode(isDevMode, line7Mode),
        );
        return shouldDisplayCongestionOverlay(congestion) ? congestion : null;
    }, [congestionConfig, congestionNow, isDevMode, line7Mode, selectedStation, showRushHour, trainsAtStation]);

    const activeLineId: LineId | null = selectedTrain?.lineId ?? selectedStation?.lineId ?? null;
    const theme = activeLineId ? getThemeColors(activeLineId) : null;
    const lineColor = activeLineId ? getLineColor(activeLineId) : '';

    useEffect(() => {
        setAnimating(true);
        const t = setTimeout(() => setAnimating(false), 400);
        return () => clearTimeout(t);
    }, [selectedTrainId, selectedStationCode]);

    useEffect(() => {
        if (!selectedStation) setStationInfoOpen(false);
    }, [selectedStation]);

    const isFollowing = selectedTrain ? followedTrainId === selectedTrain.id : false;

    if (!selectedTrain && !selectedStation) {
        return (
            <div className="w-full max-w-md md:max-w-2xl lg:max-w-3xl mx-auto backdrop-blur-3xl backdrop-saturate-150 rounded-3xl overflow-hidden shadow-2xl border border-white/10 bg-black/40 p-8 flex flex-col items-center justify-center space-y-4 min-h-[180px] mb-4 animate-in fade-in zoom-in-95 duration-500">
                <div className="relative">
                    <div className="absolute inset-0 bg-blue-500/20 rounded-full animate-ping blur-xl" />
                    <div className="w-16 h-16 rounded-full bg-black/50 border border-white/10 flex items-center justify-center relative backdrop-blur-md">
                        <Eye className="w-7 h-7 text-blue-400" />
                    </div>
                </div>
                <div className="text-center space-y-1">
                    <h3 className="text-lg font-bold text-white tracking-wide uppercase">Spectator Mode</h3>
                    <p className="text-xs text-white/50">Click a train or station on the map</p>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10">
                    <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                    <span className="text-[10px] font-bold text-white/60 uppercase tracking-wider">
                        {trains.length} trains active
                    </span>
                </div>
            </div>
        );
    }

    if (selectedTrain) {
        const source = sourceMeta(selectedTrain);
        const freshness = freshnessMeta(selectedTrain);
        const isStale = selectedTrain.freshness === 'stale';
        return (
            <div className={cn(
                "w-full max-w-md md:max-w-2xl lg:max-w-3xl mx-auto backdrop-blur-3xl backdrop-saturate-150 backdrop-brightness-50 shadow-[inset_0_0_20px_rgba(255,255,255,0.1)] rounded-3xl overflow-hidden border relative mb-4 transition-all duration-500",
                animating ? "opacity-0 scale-95" : "opacity-100 scale-100 animate-in fade-in zoom-in-95 duration-500",
                theme?.glass || 'bg-black/40',
                theme?.border || 'border-white/10',
            )}>
                <div className={cn("absolute inset-0 bg-gradient-to-b opacity-20 pointer-events-none animate-pulse -z-10", lineGradient(activeLineId))} />

                <div className="flex items-center justify-between px-5 pt-5 pb-2 pr-12">
                    <div className="flex items-center gap-2">
                        <div className={cn("px-2 py-1 rounded-md text-xs font-bold shrink-0", lineColor, activeLineId === 'MRT3' ? 'text-black' : 'text-white')}>
                            {getTrainLineLabel(selectedTrain)}
                        </div>
                        <span className="text-[10px] text-white/40 font-mono">{selectedTrain.id.slice(0, 12)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className={cn("px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider", source.className)}>
                            {source.label}
                        </span>
                        <span className={cn("px-2 py-0.5 rounded-full border text-[9px] font-bold uppercase tracking-wider", freshness.className)}>
                            {getTrainFreshnessLabel(selectedTrain)}
                        </span>
                        <button
                            onClick={() => followTrain(isFollowing ? null : selectedTrain.id)}
                            className={cn(
                                "px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all border",
                                isFollowing
                                    ? "bg-white text-black border-white"
                                    : "bg-white/10 text-white/70 border-white/10 hover:bg-white/20"
                            )}
                        >
                            <Crosshair className="w-3 h-3 inline mr-1" />
                            {isFollowing ? 'Following' : 'Follow'}
                        </button>
                    </div>
                </div>

                <div className="px-5 py-3">
                    <FormatStatusDisplay train={selectedTrain} className="text-2xl font-black text-white" />
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white/55">
                            {getTrainDirectionLabel(selectedTrain)}
                        </span>
                        <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white/55">
                            {getTrainSignalLabel(selectedTrain)}
                        </span>
                        <span className={cn("rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider", freshness.className)}>
                            {Math.round(selectedTrain.confidence * 100)}% confidence
                        </span>
                        {isStale && (
                            <span className="rounded-full border border-amber-300/20 bg-amber-300/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-300">
                                awaiting newer signal
                            </span>
                        )}
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-2 px-5 pb-4">
                    <div className="flex flex-col items-center p-3 rounded-2xl bg-black/20 border border-white/5">
                        <Gauge className="w-4 h-4 text-white/50 mb-1" />
                        <span className="text-[9px] text-white/50 uppercase tracking-wider">Speed</span>
                        <span className="text-base font-bold text-white">{getTrainSpeedLabel(selectedTrain)}</span>
                    </div>
                    <div className="flex flex-col items-center p-3 rounded-2xl bg-black/20 border border-white/5">
                        <Navigation className="w-4 h-4 text-white/50 mb-1" />
                        <span className="text-[9px] text-white/50 uppercase tracking-wider">Direction</span>
                        <span className="text-base font-bold text-white">{getTrainDirectionLabel(selectedTrain)}</span>
                    </div>
                </div>

                <button
                    onClick={() => selectTrain(null)}
                    className="absolute top-4 right-4 w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-white/50 hover:bg-white/20 hover:text-white transition-all"
                >
                    x
                </button>
            </div>
        );
    }

    if (selectedStation) {
        const confirmedAtStation = upcomingAtStation.filter((train) => train.source !== 'predicted');
        const expectedAtStation = upcomingAtStation.filter((train) => train.source === 'predicted');
        const stationSignalCount = confirmedAtStation.reduce((sum, train) => sum + (train.sourceCount ?? 1), 0);
        return (
            <>
            <div className={cn(
                "w-full max-w-md md:max-w-2xl lg:max-w-3xl mx-auto backdrop-blur-3xl backdrop-saturate-150 backdrop-brightness-50 shadow-[inset_0_0_20px_rgba(255,255,255,0.1)] rounded-3xl overflow-hidden border relative mb-4 transition-all duration-500",
                animating ? "opacity-0 scale-95" : "opacity-100 scale-100 animate-in fade-in zoom-in-95 duration-500",
                theme?.glass || 'bg-black/40',
                theme?.border || 'border-white/10',
            )}>
                <div className={cn("absolute inset-0 bg-gradient-to-b opacity-20 pointer-events-none animate-pulse -z-10", lineGradient(activeLineId))} />

                <div className="flex items-center justify-between px-5 pt-5 pb-2 pr-12">
                    <div className="flex items-center gap-2">
                        <div className={cn("px-2 py-1 rounded-md text-xs font-bold shrink-0", lineColor, activeLineId === 'MRT3' ? 'text-black' : 'text-white')}>
                            {getStationBadge(selectedStation.lineId, selectedStation.order)}
                        </div>
                        <MapPin className="w-3.5 h-3.5 text-white/40" />
                    </div>
                    <button
                        type="button"
                        onClick={() => setStationInfoOpen(true)}
                        className="text-[10px] text-white/40 font-bold uppercase tracking-wider transition-colors hover:text-white/70 focus-visible:outline-none focus-visible:text-white"
                    >
                        Station Info
                    </button>
                </div>

                <div className="px-5 py-3">
                    <h2 className="text-2xl font-black text-white">{selectedStation.name}</h2>
                    <p className="text-xs text-white/50 mt-0.5">{selectedStation.lineId}</p>
                    {stationCongestion && (
                        <div className="flex items-center gap-1.5 mt-3">
                            {(() => {
                                const congestion = stationCongestion;
                                const textColor = congestion.tier === 'EXTREME' ? 'text-orange-500' :
                                    congestion.tier === 'HIGH' ? 'text-orange-400' :
                                        congestion.tier === 'MODERATE' ? 'text-yellow-500' :
                                            'text-green-500';
                                return (
                                    <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-black/40 border border-white/5">
                                        <Activity className={cn("w-3 h-3", textColor)} />
                                        <span className={cn("text-[10px] uppercase font-bold tracking-widest", textColor)}>{congestion.label}</span>
                                    </div>
                                );
                            })()}
                        </div>
                    )}
                </div>

                <div className="px-5 pb-4">
                    <div className="mb-2 flex items-center justify-between gap-3">
                        <div className="text-[10px] text-white/50 font-bold uppercase tracking-widest">
                            Upcoming Trains
                        </div>
                        {upcomingAtStation.length > 0 && (
                            <div className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white/45">
                                {confirmedAtStation.length} confirmed / {expectedAtStation.length} expected{stationSignalCount > 0 ? ` / ${stationSignalCount} signals` : ''}
                            </div>
                        )}
                    </div>
                    {upcomingAtStation.length === 0 ? (
                        <div className="p-4 rounded-xl bg-black/20 border border-white/5 text-center space-y-1">
                            <Train className="w-5 h-5 text-white/20 mx-auto" />
                            <p className="text-xs text-white/40">No trains approaching</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {upcomingAtStation.slice(0, 4).map((train) => {
                                const source = sourceMeta(train);
                                const freshness = freshnessMeta(train);
                                const isStale = train.freshness === 'stale';
                                const approach = selectedStation ? estimateEtaToStation(train.stationId, selectedStation.id, stationLineStations, train.direction) : null;
                                const etaDisplay = approach ? `ETA ${formatApproachEta(approach.etaSeconds, approach.stopsAway)}` : getTrainSpeedLabel(train);
                                const stopsLabel = approach && approach.stopsAway > 0 ? `${approach.stopsAway} stop${approach.stopsAway > 1 ? 's' : ''} away` : 'at station';
                                return (
                                    <button
                                        key={train.id}
                                        onClick={() => selectTrain(train.id)}
                                        className={cn(
                                            "w-full flex items-center gap-3 p-3 rounded-xl bg-black/20 border border-white/5 hover:bg-white/5 transition-all group text-left",
                                            isStale && "opacity-75"
                                        )}
                                    >
                                        <div className={cn("w-1 self-stretch rounded-full", getLineColor(train.lineId))} />
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1">
                                                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-black/40 border border-white/5">
                                                    <div className={cn("w-1.5 h-1.5 rounded-full", freshness.dot, !isStale && "animate-pulse")} />
                                                    <span className={cn("text-[9px] font-bold uppercase tracking-wider", freshness.className.split(' ')[1])}>
                                                        {getTrainStatusLabel(train)}
                                                    </span>
                                                </div>
                                                <span className="px-1.5 py-0.5 rounded-full bg-white/5 border border-white/10 text-[8px] font-bold text-white/40 uppercase tracking-wider">
                                                    {stopsLabel}
                                                </span>
                                            </div>
                                            <span className="text-sm font-bold text-white truncate flex items-center gap-2">
                                                <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-black shrink-0", getLineColor(train.lineId), train.lineId === 'MRT3' ? 'text-black' : 'text-white')}>
                                                    {getTrainBadgeLabel(train)}
                                                </span>
                                                {getTrainLocationLabel(train)}
                                            </span>
                                            <div className="flex items-center gap-2 mt-1">
                                                <span className="text-[10px] text-white/40">{etaDisplay}</span>
                                                <span className="text-[10px] text-white/20">/</span>
                                                <span className={cn("text-[10px] font-bold", source.className.replace('bg-', 'text-').split(' ')[1])}>
                                                    {source.label}
                                                </span>
                                                <span className="text-[10px] text-white/20">/</span>
                                                <span className={cn("text-[10px] font-bold", freshness.className.split(' ')[1])}>
                                                    {getTrainSignalLabel(train)}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="flex flex-col items-end shrink-0">
                                            <span className="text-[10px] font-bold text-white/50">
                                                {getTrainDirectionLabel(train)}
                                            </span>
                                            {getTerminusLabel(train.lineId, train.direction) && (
                                                <span className="text-[9px] text-white/30">→ {getTerminusLabel(train.lineId, train.direction)}</span>
                                            )}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>

                <button
                    onClick={() => selectStation(null)}
                    className="absolute top-4 right-4 w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-white/50 hover:bg-white/20 hover:text-white transition-all"
                >
                    x
                </button>
            </div>
            <StationInfoModal
                station={selectedStation}
                open={stationInfoOpen}
                onClose={() => setStationInfoOpen(false)}
            />
            </>
        );
    }

    return null;
}
