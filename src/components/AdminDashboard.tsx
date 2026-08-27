"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useTripStore } from "@/store/useTripStore";
import { useSmartLocation } from "@/hooks/useSmartLocation";
import { useTripLogic } from "@/hooks/useTripLogic";
import { getDistanceKm } from "@/utils/geo";
import { getSegmentDistanceKm } from "@/data/segmentDistances";
import { Station } from "@/types";
import { getNetworkStations, getOperationalMode } from "@/domain/railway";

// ─── Event Log Entry ──────────────────────────────────────
interface LogEntry {
    id: number;
    time: string;
    category: 'STATION' | 'STATUS' | 'DIRECTION' | 'GPS' | 'ZONE' | 'SYSTEM';
    message: string;
}

const CATEGORY_COLORS: Record<string, string> = {
    STATION: 'text-emerald-400',
    STATUS: 'text-blue-400',
    DIRECTION: 'text-purple-400',
    GPS: 'text-amber-400',
    ZONE: 'text-cyan-400',
    SYSTEM: 'text-zinc-500',
};

function ts(): string {
    const d = new Date();
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}.${d.getMilliseconds().toString().padStart(3, '0')}`;
}

function computeZones(cur: Station | null, nxt: Station | null) {
    if (!cur || !nxt) return { ZONE_STATION: 0.15, ZONE_DWELL: 0.20, ZONE_LEAVING: 0.30, ZONE_APPROACH: 0.40, segDistKm: 1.5 };
    const segDistKm = getSegmentDistanceKm(cur.id, nxt.id) ?? 1.5;
    const ZONE_STATION = Math.min(0.15, Math.max(0.12, segDistKm * 0.15));
    return {
        ZONE_STATION,
        ZONE_DWELL: Math.min(0.20, Math.max(ZONE_STATION + 0.05, segDistKm * 0.20)),
        ZONE_LEAVING: Math.min(0.30, Math.max(ZONE_STATION + 0.08, segDistKm * 0.25)),
        ZONE_APPROACH: Math.min(0.40, Math.max(0.25, segDistKm * 0.35)),
        segDistKm
    };
}

function getZoneLabel(dist: number, z: ReturnType<typeof computeZones>): string {
    if (dist < z.ZONE_STATION) return 'STATION';
    if (dist < z.ZONE_DWELL) return 'DWELL';
    if (dist < z.ZONE_LEAVING) return 'LEAVING';
    if (dist < z.ZONE_APPROACH) return 'APPROACH';
    return 'TRANSIT';
}

function getStatusCodeColor(statusCode: string): string {
    switch (statusCode) {
        case 'LEAVING_STATION':
            return 'text-amber-400';
        case 'APPROACHING_STATION':
            return 'text-cyan-400';
        case 'AT_STATION':
        case 'ARRIVED':
            return 'text-emerald-400';
        case 'TRANSFER_ACTIVE':
            return 'text-blue-400';
        default:
            return 'text-zinc-400';
    }
}

// ─── Compact Stat ─────────────────────────────────────────
function S({ l, v, c }: { l: string; v: string | number; c?: string }) {
    return (
        <div className="flex justify-between items-center">
            <span className="text-[8px] text-zinc-600 uppercase tracking-wider">{l}</span>
            <span className={`text-[10px] font-mono font-bold ${c || 'text-white'}`}>{v}</span>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════
// DEV MONITOR PANEL — Compact version for CommandCenter
// ═══════════════════════════════════════════════════════════
export function DevMonitorPanel() {
    const { origin, destination, currentStation, nextStation, direction, status, ticketType, runningFare, ignoreWrongDirection, isGpsOverride, isDevMode, line7Mode } = useTripStore();
    const { location, speed, rawHeading, gpsAccuracy, gpsTimestamp, heading: gpsHeading } = useSmartLocation();
    const tripLogic = useTripLogic();
    const monitorStations = useMemo(
        () => getNetworkStations(getOperationalMode(isDevMode, line7Mode), line7Mode),
        [isDevMode, line7Mode],
    );

    // ─── Tabs ─────────────────────────────────────────────
    const [tab, setTab] = useState<'gps' | 'zones' | 'trip' | 'log'>('gps');

    // ─── Event Log ────────────────────────────────────────
    const [log, setLog] = useState<LogEntry[]>([]);
    const logIdRef = useRef(0);
    const [logFilter, setLogFilter] = useState<string | null>(null);

    const addLog = useCallback((category: LogEntry['category'], message: string) => {
        setLog(prev => [{ id: logIdRef.current++, time: ts(), category, message }, ...prev].slice(0, 100));
    }, []);

    const prevRef = useRef({
        station: currentStation?.id,
        status,
        statusText: tripLogic.statusText,
        direction,
    });

    useEffect(() => {
        const prev = prevRef.current;
        if (currentStation?.id !== prev.station) addLog('STATION', `${monitorStations.find(s => s.id === prev.station)?.name || '—'} → ${currentStation?.name || '—'}`);
        if (status !== prev.status) addLog('STATUS', `${prev.status} → ${status}`);
        if (tripLogic.statusText !== prev.statusText) addLog('ZONE', `${prev.statusText} → ${tripLogic.statusText}`);
        if (direction !== prev.direction) addLog('DIRECTION', `${prev.direction || '—'} → ${direction || '—'}`);
        prevRef.current = { station: currentStation?.id, status, statusText: tripLogic.statusText, direction };
    }, [addLog, currentStation?.id, currentStation?.name, status, tripLogic.statusText, direction, monitorStations]);

    useEffect(() => { addLog('SYSTEM', 'Dev Monitor started'); }, [addLog]);

    // ─── Station Proximity ────────────────────────────────
    const nearby = useMemo(() => {
        if (!location) return [];
        return monitorStations.map(s => ({ s, d: getDistanceKm(location, s) })).sort((a, b) => a.d - b.d).slice(0, 5);
    }, [location, monitorStations]);

    // ─── Zones ────────────────────────────────────────────
    const zones = useMemo(() => computeZones(currentStation, nextStation), [currentStation, nextStation]);
    const distCur = location && currentStation ? getDistanceKm(location, currentStation) : null;
    const distNxt = location && nextStation ? getDistanceKm(location, nextStation) : null;
    const curZone = distCur !== null ? getZoneLabel(distCur, zones) : '—';
    const gpsFresh = gpsTimestamp ? Math.round((Date.now() - gpsTimestamp) / 1000) : null;
    const filteredLog = logFilter ? log.filter(l => l.category === logFilter) : log;

    const tabs = [
        { id: 'gps' as const, label: 'GPS' },
        { id: 'zones' as const, label: 'ZONES' },
        { id: 'trip' as const, label: 'TRIP' },
        { id: 'log' as const, label: `LOG (${log.length})` },
    ];

    return (
        <div className="space-y-2">
            {/* Tab Bar */}
            <div className="flex gap-1 bg-zinc-900/50 rounded-lg p-0.5">
                {tabs.map(t => (
                    <button
                        key={t.id}
                        onClick={() => setTab(t.id)}
                        className={`flex-1 text-[9px] font-bold py-1.5 rounded-md transition-colors ${tab === t.id ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'
                            }`}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            {/* ──── GPS Tab ──── */}
            {tab === 'gps' && (
                <div className="space-y-1.5">
                    <div className="bg-zinc-900/50 rounded-lg p-2 space-y-0.5">
                        <div className="grid grid-cols-2 gap-x-3">
                            <S l="Lat" v={location?.latitude?.toFixed(6) || '—'} />
                            <S l="Lng" v={location?.longitude?.toFixed(6) || '—'} />
                            <S l="Speed" v={`${speed?.toFixed(1) || '0'} km/h`} c={(speed || 0) >= 15 ? 'text-emerald-400' : 'text-amber-400'} />
                            <S l="Heading" v={`${rawHeading?.toFixed(0) || '—'}°`} />
                            <S l="Accuracy" v={`${gpsAccuracy?.toFixed(0) || '—'}m`} c={(gpsAccuracy || 999) < 15 ? 'text-emerald-400' : 'text-red-400'} />
                            <S l="Fresh" v={gpsFresh !== null ? `${gpsFresh}s` : '—'} c={gpsFresh !== null && gpsFresh < 3 ? 'text-emerald-400' : 'text-red-400'} />
                            <S l="Dir" v={gpsHeading || '—'} c="text-purple-400" />
                            <S l="Mode" v={isGpsOverride ? 'SIM' : 'LIVE'} c={isGpsOverride ? 'text-amber-400' : 'text-emerald-400'} />
                        </div>
                    </div>
                    {/* Nearby Stations */}
                    <div className="bg-zinc-900/50 rounded-lg p-2">
                        <div className="text-[8px] text-zinc-500 font-bold mb-1">NEAREST STATIONS</div>
                        {nearby.map(({ s, d }) => {
                            const m = Math.round(d * 1000);
                            return (
                                <div key={s.id} className="flex items-center gap-1.5 py-0.5">
                                    <div className={`w-1 h-1 rounded-full flex-shrink-0 ${m < 175 ? 'bg-emerald-500' : m < 350 ? 'bg-amber-500' : 'bg-zinc-700'}`} />
                                    <span className="text-[9px] text-zinc-400 flex-1 truncate">{s.name}</span>
                                    <span className={`text-[9px] font-mono font-bold tabular-nums ${m < 175 ? 'text-emerald-400' : 'text-zinc-500'}`}>{m}m</span>
                                    {currentStation?.id === s.id && <span className="text-[7px] bg-emerald-500/20 text-emerald-400 px-0.5 rounded">CUR</span>}
                                    {nextStation?.id === s.id && <span className="text-[7px] bg-cyan-500/20 text-cyan-400 px-0.5 rounded">NXT</span>}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* ──── ZONES Tab ──── */}
            {tab === 'zones' && (
                <div className="bg-zinc-900/50 rounded-lg p-2 space-y-1.5">
                    <div className="flex items-center justify-between">
                        <span className="text-[8px] text-zinc-500 font-bold">CURRENT ZONE</span>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${curZone === 'STATION' ? 'bg-emerald-500/20 text-emerald-400' :
                            curZone === 'LEAVING' ? 'bg-amber-500/20 text-amber-400' :
                                curZone === 'APPROACH' ? 'bg-cyan-500/20 text-cyan-400' :
                                    'bg-zinc-800 text-zinc-400'
                            }`}>{curZone}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-3">
                        <S l="Z_Station" v={`${Math.round(zones.ZONE_STATION * 1000)}m`} />
                        <S l="Z_Dwell" v={`${Math.round(zones.ZONE_DWELL * 1000)}m`} />
                        <S l="Z_Leaving" v={`${Math.round(zones.ZONE_LEAVING * 1000)}m`} />
                        <S l="Z_Approach" v={`${Math.round(zones.ZONE_APPROACH * 1000)}m`} />
                        <S l="Dist→Cur" v={distCur !== null ? `${Math.round(distCur * 1000)}m` : '—'} c={curZone === 'STATION' ? 'text-emerald-400' : 'text-white'} />
                        <S l="Dist→Nxt" v={distNxt !== null ? `${Math.round(distNxt * 1000)}m` : '—'} c={distNxt !== null && distNxt < 0.35 ? 'text-cyan-400' : 'text-white'} />
                        <S l="Seg Dist" v={`${Math.round(zones.segDistKm * 1000)}m`} c="text-zinc-400" />
                    </div>

                    {/* Visual Zone Bar */}
                    {distCur !== null && zones.segDistKm > 0 && (
                        <div className="mt-1">
                            <div className="flex h-2.5 rounded-full overflow-hidden bg-zinc-800 relative">
                                {(() => {
                                    const seg = zones.segDistKm * 1000;
                                    const pS = (zones.ZONE_STATION * 1000 / seg) * 100;
                                    const pL = ((zones.ZONE_LEAVING - zones.ZONE_STATION) * 1000 / seg) * 100;
                                    const pA = (zones.ZONE_APPROACH * 1000 / seg) * 100;
                                    const pos = Math.min(100, (distCur * 1000 / seg) * 100);
                                    return (
                                        <>
                                            <div className="bg-emerald-500/50 h-full" style={{ width: `${pS}%` }} />
                                            <div className="bg-amber-500/40 h-full" style={{ width: `${pL}%` }} />
                                            <div className="bg-zinc-700 h-full flex-1" />
                                            <div className="bg-cyan-500/40 h-full" style={{ width: `${pA}%` }} />
                                            <div className="absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_4px_white] transition-all" style={{ left: `${pos}%` }} />
                                        </>
                                    );
                                })()}
                            </div>
                            <div className="flex justify-between mt-0.5">
                                <span className="text-[7px] text-emerald-500">STA</span>
                                <span className="text-[7px] text-amber-500">LVG</span>
                                <span className="text-[7px] text-zinc-600">TRANSIT</span>
                                <span className="text-[7px] text-cyan-500">APR</span>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ──── TRIP Tab ──── */}
            {tab === 'trip' && (
                <div className="bg-zinc-900/50 rounded-lg p-2 space-y-0.5">
                    <div className="grid grid-cols-2 gap-x-3">
                        <S l="Origin" v={origin?.name || '—'} c="text-zinc-300" />
                        <S l="Dest" v={destination?.name || '—'} c={destination ? 'text-blue-400' : 'text-red-400'} />
                        <S l="Current" v={currentStation?.name || '—'} c="text-emerald-400" />
                        <S l="Next" v={nextStation?.name || '—'} c="text-cyan-400" />
                        <S l="Status" v={status} c={status === 'TRANSIT' ? 'text-blue-400' : status === 'ARRIVED' ? 'text-emerald-400' : 'text-zinc-400'} />
                        <S l="StatusText" v={tripLogic.statusText} c={getStatusCodeColor(tripLogic.statusCode)} />
                        <S l="Direction" v={direction || '—'} c="text-purple-400" />
                        <S l="Ticket" v={ticketType || '—'} />
                        <S l="Fare" v={`₱${runningFare.toFixed(2)}`} c="text-green-400" />
                        <S l="Leg %" v={`${tripLogic.legProgress.toFixed(0)}%`} />
                        <S l="Total %" v={`${tripLogic.totalProgress.toFixed(0)}%`} />
                        <S l="Stops Left" v={tripLogic.stopsRemaining ?? '—'} />
                        <S l="GPS Fallback" v={tripLogic.gpsFallbackActive ? 'ACTIVE' : 'OFF'} c={tripLogic.gpsFallbackActive ? 'text-red-400' : 'text-zinc-600'} />
                        <S l="Ignore WD" v={ignoreWrongDirection ? 'YES' : 'NO'} c={ignoreWrongDirection ? 'text-amber-400' : 'text-zinc-600'} />
                    </div>
                </div>
            )}

            {/* ──── LOG Tab ──── */}
            {tab === 'log' && (
                <div className="space-y-1">
                    <div className="flex gap-0.5 flex-wrap">
                        {['ALL', 'STATION', 'STATUS', 'ZONE', 'DIRECTION', 'SYSTEM'].map(cat => (
                            <button
                                key={cat}
                                onClick={() => setLogFilter(cat === 'ALL' ? null : cat)}
                                className={`text-[7px] px-1 py-0.5 rounded font-bold transition-colors ${(logFilter === null && cat === 'ALL') || logFilter === cat
                                    ? 'bg-zinc-700 text-white' : 'bg-zinc-900 text-zinc-600'
                                    }`}
                            >
                                {cat}
                            </button>
                        ))}
                    </div>
                    <div className="bg-zinc-900/50 rounded-lg max-h-40 overflow-y-auto">
                        {filteredLog.length === 0 ? (
                            <p className="text-[9px] text-zinc-700 py-3 text-center">No events</p>
                        ) : filteredLog.map(e => (
                            <div key={e.id} className="flex gap-1.5 px-2 py-0.5 border-b border-zinc-900 last:border-0">
                                <span className="text-[8px] text-zinc-700 tabular-nums flex-shrink-0">{e.time}</span>
                                <span className={`text-[7px] font-bold flex-shrink-0 w-10 ${CATEGORY_COLORS[e.category]}`}>{e.category}</span>
                                <span className="text-[8px] text-zinc-400 truncate">{e.message}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
