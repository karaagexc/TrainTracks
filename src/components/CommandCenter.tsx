
import { useState, useEffect } from "react";
import { useSimEngine } from "@/hooks/useSimEngine";
import { useTripStore } from "@/store/useTripStore";
import { useTrainStore } from "@/store/useTrainStore";
import type { Station } from "@/types";
import { Play, Pause, SkipForward, Navigation, Bell, Activity } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { getBearing } from "@/utils/geo";
import { DevMonitorPanel } from "@/components/AdminDashboard";
import { setRemoteMaintenanceMode } from "@/hooks/useMaintenanceMode";
import { getNetworkStations } from "@/domain/railway";

interface CommandCenterProps {
    backgroundMode?: boolean;
}

export function CommandCenter({ backgroundMode }: CommandCenterProps) {
    const {
        origin, setOrigin,
        destination, setDestination,
        isGpsOverride, setGpsOverride: toggleGpsOverride,
        setSimulatedHeading, setSimulatedSpeed,
        line7Mode, setLine7Mode,
        maintenanceMode, setMaintenanceMode,
        transitMode,
    } = useTripStore();
    const { mockTrainsMode, setMockTrainsMode, timeFactor, setTimeFactor } = useTrainStore();

    const {
        status,
        eta,
        isPlaying,
        play,
        startScenario: runScenario,
        pause,
        multiplier,
        setMultiplier, // Restored
        route,
        currentStopIndex,
        teleport,
        overrideRoute, // Destructure new function
        ghostLocation // Added for midway turn around calculations
    } = useSimEngine();

    const [isOpen, setIsOpen] = useState(true);
    const [devMonitor, setDevMonitor] = useState(false);
    const sandboxStations = getNetworkStations('sandbox', line7Mode, transitMode);
    const allSandboxStations = getNetworkStations('sandbox', line7Mode, 'all');

    const startScenarioById = (originId: string, destinationId: string) => {
        const start = allSandboxStations.find(s => s.id === originId);
        const end = allSandboxStations.find(s => s.id === destinationId);
        if (!start || !end) return;

        runScenario(start, end);
    };

    // ...



    // Auto-enable override when playing
    useEffect(() => {
        if (isPlaying && !isGpsOverride) {
            toggleGpsOverride(true);
        }
    }, [isPlaying, isGpsOverride, toggleGpsOverride]);

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}m ${secs}s`;
    };

    if (!isOpen) {
        return (
            <button
                onClick={() => setIsOpen(true)}
                className={cn(
                    "fixed top-4 left-4 p-3 rounded-full border border-zinc-800 shadow-xl transition-all duration-300",
                    backgroundMode
                        ? "z-0 opacity-0 pointer-events-none scale-90"
                        : "z-[120] bg-black/80 text-white scale-100"
                )}
            >
                <Navigation className="w-6 h-6" />
            </button>
        );
    }

    return (
        <div className="fixed bottom-0 left-0 right-0 z-[120] p-4 animate-in slide-in-from-bottom-10">
            <div className="mx-auto max-w-md bg-black/60 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden ring-1 ring-white/10">

                {/* Header / Status Bar */}
                <div className="px-4 py-3 bg-white/5 border-b border-white/5 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className={cn("w-2 h-2 rounded-full animate-pulse",
                            status === 'MOVING' ? "bg-green-500" :
                                status === 'DWELLING' ? "bg-amber-500" :
                                    status === 'WALKING' ? "bg-blue-500" : "bg-zinc-500"
                        )} />
                        <span className="text-xs font-bold tracking-widest uppercase text-white/80">
                            {status}
                            {multiplier > 1 && <span className="text-emerald-400 ml-1">({multiplier}x)</span>}
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setDevMonitor(!devMonitor)}
                            className={cn(
                                "text-[9px] font-bold px-2 py-1 rounded transition-all flex items-center gap-1",
                                devMonitor
                                    ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30"
                                    : "bg-zinc-800 text-zinc-500 hover:text-zinc-300 border border-zinc-700"
                            )}
                        >
                            <Activity className="w-3 h-3" />
                            {devMonitor ? 'DEV LOGS' : 'DEV LOGS'}
                        </button>
                        <button
                            onClick={() => {
                                if (confirm("Reset Trip?")) {
                                    useTripStore.getState().reset();
                                    setIsOpen(false);
                                }
                            }}
                            className="bg-red-500 hover:bg-red-600 text-white text-[10px] px-2 py-1 rounded font-bold transition-colors"
                        >
                            Reset
                        </button>
                        <button onClick={() => setIsOpen(false)} className="text-xs text-zinc-500 hover:text-white">Hide</button>
                    </div>
                </div>

                {/* Main Controls */}
                <div className="p-4 space-y-4 max-h-[80vh] overflow-y-auto">

                    {/* DEV MONITOR MODE */}
                    {devMonitor && (
                        <div className="mb-4">
                            <DevMonitorPanel />
                        </div>
                    )}





                    {/* PHASE 87: SAFETY CONTROLS v4.0 */}
                    <div className="bg-zinc-900/50 p-3 rounded-xl border border-zinc-700/50 space-y-2 mb-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                                <h4 className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Sim Controls</h4>
                            </div>
                            <span className="text-[9px] text-zinc-600 font-mono">DEV v4.0</span>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                            <button
                                onClick={() => startScenarioById('L2-01', 'L2-13')}
                                className="text-[10px] font-bold py-2 px-2 rounded-lg border bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border-purple-500/20 transition-all"
                            >
                                LRT-2 EB
                            </button>
                            <button
                                onClick={() => startScenarioById('L1-20', 'M3-13')}
                                className="text-[10px] font-bold py-2 px-2 rounded-lg border bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border-emerald-500/20 transition-all"
                            >
                                Transfer QA
                            </button>
                            {/* Merged Control: Turn Around / Start Sim */}
                            <button
                                onClick={() => {
                                    const { origin, destination } = useTripStore.getState();

                                    // 1. Auto-Start if Nothing is Playing
                                    if (!origin || !destination || route.length === 0) {
                                        console.log("Sim: Auto-starting Default Route");
                                        const start = sandboxStations.find(s => s.id === 'L1-20');
                                        const end = sandboxStations.find(s => s.id === 'L1-25');
                                        if (start && end) {
                                            useTripStore.getState().selectLine('LRT1');
                                            runScenario(start, end);
                                        }
                                        return;
                                    }

                                    // 2. Midway Turn Around / Resume Logic
                                    if (route.length > 0 && ghostLocation) {
                                        const ghostLoc = ghostLocation; // Current Interpolated Coords
                                        if (!ghostLoc) return;

                                        // Pause to prevent jitter during calc
                                        if (isPlaying) pause();

                                        // Identify Current State
                                        // "Last Station" is route[currentStopIndex] (The one we effectively passed or are at)
                                        const lastStation = route[currentStopIndex];
                                        const currentRouteDest = route[route.length - 1];
                                        const ticketDest = destination;

                                        // Are we currently going towards the Ticket Destination?
                                        const isGoingCorrectly = currentRouteDest.id === ticketDest.id;

                                        console.log(`Sim: Toggle Direction. Currently Correct? ${isGoingCorrectly}`);

                                        // Define Target Direction based on Toggle
                                        // If Correct -> Go to Origin (Turn Around)
                                        // If Wrong -> Go to Destination (Resume)
                                        const lineStations = sandboxStations.filter(s => s.lineId === lastStation.lineId).sort((a, b) => a.order - b.order);

                                        let targetTerminus: Station | null = null;

                                        if (isGoingCorrectly) {
                                            // TURNING AROUND -> Target the Real Terminus "behind" us
                                            const routeStart = route[0];
                                            const routeEnd = route[route.length - 1];
                                            // Determine current vector
                                            const isCurrentlyIncreasing = routeEnd.order > routeStart.order;

                                            if (isCurrentlyIncreasing) {
                                                // We are going South (Increasing). Turn North (Head to Order 1)
                                                targetTerminus = lineStations[0];
                                            } else {
                                                // We are going North (Decreasing). Turn South (Head to Last Order)
                                                targetTerminus = lineStations[lineStations.length - 1];
                                            }
                                            console.log(`Sim: Turn Around Target -> ${targetTerminus?.name}`);
                                        } else {
                                            // RESUMING -> Target the Ticket Destination
                                            targetTerminus = destination;
                                            console.log(`Sim: Resume Target -> ${targetTerminus?.name}`);
                                        }

                                        if (!targetTerminus) return; // Safety check

                                        // Find indices in Master List to slice correctly
                                        const idxStart = lineStations.findIndex(s => s.id === lastStation.id);
                                        const idxEnd = lineStations.findIndex(s => s.id === targetTerminus.id);

                                        let segment: Station[] = [];

                                        if (idxStart < idxEnd) {
                                            // Going South (Increasing)
                                            segment = lineStations.slice(idxStart, idxEnd + 1);
                                        } else {
                                            // Going North (Decreasing)
                                            segment = lineStations.slice(idxEnd, idxStart + 1).reverse();
                                        }

                                        // Construct Final Route
                                        // [VirtualStation, ...Segment]
                                        // VirtualStation ensures we start exactly where we are, then move to LastStation (which is the first in Segment)
                                        // This creates the "Turn Back" effect from mid-track.

                                        const virtualStation = {
                                            ...lastStation,
                                            id: 'VIRTUAL_U_TURN',
                                            name: 'Reversing...',
                                            latitude: ghostLoc.latitude,
                                            longitude: ghostLoc.longitude
                                        };

                                        const newRoute = [virtualStation, ...segment];

                                        console.log("Sim: Override Route", newRoute.map(s => s.name));

                                        // Apply
                                        overrideRoute(newRoute);

                                        // FORCE IMMEDIATE UPDATE: Trigger Alert instantly
                                        if (newRoute[1]) {
                                            const immediateBearing = getBearing(
                                                { latitude: ghostLoc.latitude, longitude: ghostLoc.longitude },
                                                { latitude: newRoute[1].latitude, longitude: newRoute[1].longitude }
                                            );
                                            setSimulatedHeading(immediateBearing);
                                            setSimulatedSpeed(40);
                                        }

                                        // Resume against the override route directly so React state timing cannot race playback.
                                        play(newRoute);
                                    }
                                }}
                                className={cn(
                                    "col-span-2 text-[10px] font-bold py-3 px-2 rounded-lg border transition-all flex flex-col items-center justify-center gap-1 active:scale-95",
                                    route.length > 0 && route[route.length - 1]?.id !== destination?.id
                                        ? "bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/20" // Resume Style
                                        : "bg-red-500/10 hover:bg-red-500/20 text-red-400 border-red-500/20" // Turn Around Style
                                )}
                            >
                                <span className="opacity-50 text-[8px] uppercase">Simulation</span>
                                <div className="flex items-center gap-2">
                                    <span className="text-lg">↻</span>
                                    <span>
                                        {route.length > 0 && route[route.length - 1]?.id !== destination?.id
                                            ? "Resume Normal Route"
                                            : "Turn Around / Force Wrong Way"
                                        }
                                    </span>
                                </div>
                            </button>
                        </div>

                        {/* Network Sandbox Toggles */}
                        <div className="grid grid-cols-1 gap-2 mt-2">
                             <div className="flex items-center justify-between bg-zinc-900/80 rounded-lg p-1 border border-zinc-800">
                                <span className="text-[10px] text-zinc-500 font-bold px-2 uppercase tracking-wide">Data Source</span>
                                <div className="flex bg-black/50 rounded p-0.5">
                                    <button 
                                        onClick={() => setMockTrainsMode(false)}
                                        className={cn("px-2 py-1 text-[9px] font-bold rounded transition-colors", !mockTrainsMode ? "bg-emerald-500 text-black" : "text-zinc-500")}
                                    >Crowd Live</button>
                                    <button 
                                        onClick={() => setMockTrainsMode(true)}
                                        className={cn("px-2 py-1 text-[9px] font-bold rounded transition-colors", mockTrainsMode ? "bg-blue-500 text-white" : "text-zinc-500")}
                                    >Sim Fleet</button>
                                </div>
                            </div>
                            
                            {/* Time Factor Toggle - only visible in mock mode */}
                            {mockTrainsMode && (
                                <div className="flex items-center justify-between bg-zinc-900/80 rounded-lg p-1 border border-zinc-800 animate-in fade-in slide-in-from-top-2">
                                    <span className="text-[10px] text-blue-400 font-bold px-2 uppercase tracking-wide">Fast-Forward (Dev)</span>
                                    <div className="flex bg-black/50 rounded p-0.5">
                                        {[1, 60, 3600].map(mult => (
                                            <button 
                                                key={mult}
                                                onClick={() => setTimeFactor(mult)}
                                                className={cn("px-2 py-1 text-[9px] font-bold rounded transition-colors", timeFactor === mult ? "bg-blue-500 text-white" : "text-zinc-500")}
                                            >{mult === 3600 ? '1Hr/Sec' : mult === 60 ? '1Min/Sec' : 'Real-time'}</button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Line 7 DevOpts Toggle */}
                    <div className="bg-zinc-900/50 p-3 rounded-xl border border-zinc-700/50 space-y-2 mb-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-red-500" />
                                <h4 className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">MRT-7 Mode</h4>
                            </div>
                            <span className="text-[9px] text-zinc-600 font-mono">DEV OPTS</span>
                        </div>
                        <div className="flex items-center gap-1 bg-zinc-900/80 rounded-lg p-1 border border-zinc-800">
                            {([
                                { key: 'OFF', label: 'L7 OFF', desc: 'No Line 7' },
                                { key: 'WITH_NA', label: 'L7 + NA', desc: 'With North Ave' },
                                { key: 'WITHOUT_NA', label: 'L7 Only', desc: 'No North Ave' },
                            ] as const).map(opt => (
                                <button
                                    key={opt.key}
                                    onClick={() => setLine7Mode(opt.key)}
                                    className={cn(
                                        "flex-1 px-2 py-1.5 rounded text-[10px] font-bold transition-all text-center",
                                        line7Mode === opt.key
                                            ? opt.key === 'OFF' ? "bg-zinc-600 text-white" :
                                              opt.key === 'WITH_NA' ? "bg-emerald-500 text-black" : "bg-red-600 text-white"
                                            : "text-zinc-500 hover:text-white"
                                    )}
                                    title={opt.desc}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Maintenance Mode Toggle */}
                    <div className="bg-zinc-900/50 p-3 rounded-xl border border-zinc-700/50 space-y-2 mb-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <div className={cn("w-2 h-2 rounded-full", maintenanceMode ? "bg-amber-500 animate-pulse" : "bg-zinc-600")} />
                                <h4 className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Maintenance Mode</h4>
                            </div>
                            <span className="text-[9px] text-zinc-600 font-mono">DEV OPTS</span>
                        </div>
                        <button
                            onClick={async () => {
                                const newVal = !maintenanceMode;
                                const ok = await setRemoteMaintenanceMode(newVal);
                                if (!ok) alert('Failed to update maintenance mode in Supabase');
                            }}
                            className={cn(
                                "w-full py-2 rounded-lg text-[10px] font-bold transition-all border",
                                maintenanceMode
                                    ? "bg-amber-500/20 text-amber-400 border-amber-500/30 hover:bg-amber-500/30"
                                    : "bg-zinc-800 text-zinc-500 border-zinc-700 hover:text-zinc-300 hover:bg-zinc-700"
                            )}
                        >
                            {maintenanceMode ? "🔧 MAINTENANCE ON — Users see depot screen" : "Maintenance Off — App is live"}
                        </button>
                    </div>

                    {/* Route Selection */}
                    <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                            <label className="text-[10px] uppercase text-zinc-500 font-bold">Origin</label>
                            <select
                                className="w-full bg-zinc-900/50 border border-zinc-700 rounded-md text-xs p-2 text-white outline-none focus:border-emerald-500"
                                value={origin?.id || ""}
                                onChange={(e) => {
                                    const s = sandboxStations.find(st => st.id === e.target.value);
                                    if (s) setOrigin(s);
                                }}
                            >
                                <option value="">Select Origin</option>
                                {sandboxStations.map(s => (
                                    <option key={s.id} value={s.id}>{s.name}</option>
                                ))}
                            </select>
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] uppercase text-zinc-500 font-bold">Destination</label>
                            <select
                                className="w-full bg-zinc-900/50 border border-zinc-700 rounded-md text-xs p-2 text-white outline-none focus:border-emerald-500"
                                value={destination?.id || ""}
                                onChange={(e) => {
                                    const s = sandboxStations.find(st => st.id === e.target.value);
                                    if (s) setDestination(s);
                                }}
                            >
                                <option value="">Select Dest</option>
                                {sandboxStations.map(s => (
                                    <option key={s.id} value={s.id}>{s.name}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {route.length > 0 && (
                        <div className="bg-zinc-900/40 rounded-lg p-3 border border-white/5 space-y-2">
                            <div className="flex justify-between text-xs">
                                <span className="text-zinc-400">Next Station</span>
                                <span className="font-bold text-white">{route[currentStopIndex + 1]?.name || "End of Line"}</span>
                            </div>
                            <div className="flex justify-between text-xs">
                                <span className="text-zinc-400">ETA</span>
                                <span className="font-mono text-emerald-400">{eta ? formatTime(eta / multiplier) : "--:--"}</span>
                            </div>
                        </div>
                    )}

                    {/* Notification Test (Dev Only) */}
                    <button
                        onClick={async () => {
                            if (Notification.permission === 'granted') {
                                if ('serviceWorker' in navigator) {
                                    const reg = await navigator.serviceWorker.ready;
                                    try {
                                        await reg.showNotification('Test Notification', {
                                            body: 'Dev Mode Test Success!',
                                            icon: '/gps-markers/lrt1.png',
                                            // @ts-ignore
                                            vibrate: [200, 100, 200],
                                            // @ts-ignore
                                            silent: false
                                        });
                                        alert("Sent via Service Worker!");
                                    } catch (e) {
                                        alert('SW Info: ' + e);
                                    }
                                } else {
                                    new Notification('Test Notification', { body: 'Fallback Mode' });
                                    alert("Sent via Standard API (No SW)");
                                }
                            } else {
                                const res = await Notification.requestPermission();
                                alert('Permission Requested. Result: ' + res);
                            }
                        }}
                        className="w-full bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 text-xs font-bold py-2 rounded-lg transition-colors flex items-center justify-center gap-2"
                    >
                        <Bell className="w-3 h-3" />
                        <span>Test Push Notification</span>
                    </button>

                    {/* Reset / Change Card Button (Moved here for visibility) */}
                    <button
                        onClick={() => {
                            if (confirm("Reset Trip & Return to Home?")) {
                                useTripStore.getState().reset();
                                setIsOpen(false);
                            }
                        }}
                        className="w-full bg-red-500/10 hover:bg-red-500/20 border border-red-500/50 text-red-500 text-xs font-bold py-2 rounded-lg transition-colors flex items-center justify-center gap-2"
                    >
                        <span>⚠ Change Card / Reset Trip</span>
                    </button>






                    {/* Playback Controls */}
                    <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1 bg-zinc-900/80 rounded-lg p-1 border border-zinc-800">
                            {[1, 5, 20].map(m => (
                                <button
                                    key={m}
                                    onClick={() => setMultiplier(m)}
                                    className={cn(
                                        "px-2 py-1 rounded text-[10px] font-bold transition-colors",
                                        multiplier === m ? "bg-white text-black" : "text-zinc-500 hover:text-white"
                                    )}
                                >
                                    {m}x
                                </button>
                            ))}
                        </div>

                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => {
                                    if (isPlaying) {
                                        pause();
                                    } else {
                                        play();
                                    }
                                }}
                                className={cn(
                                    "w-12 h-12 flex items-center justify-center rounded-full text-black transition-transform active:scale-95 shadow-lg shadow-emerald-900/20",
                                    isPlaying ? "bg-amber-500 hover:bg-amber-400" : "bg-emerald-500 hover:bg-emerald-400"
                                )}
                            >
                                {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-1" />}
                            </button>
                        </div>

                        <button
                            onClick={() => {
                                // Jump to next
                                if (route[currentStopIndex + 1]) teleport(currentStopIndex + 1);
                            }}
                            disabled={!isPlaying || !route[currentStopIndex + 1]}
                            className="p-3 rounded-full bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white disabled:opacity-50"
                        >
                            <SkipForward className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
