'use client';

/**
 * StallAlert — Service disruption confirmation prompt.
 * 
 * Shows when the stall detector triggers after 7 minutes of no movement.
 * User can confirm "Just Slow Traffic" or "Emergency Stop".
 * Auto-dismisses to traffic after 15s (false positive safe).
 */

import { useEffect, useState } from 'react';
import { AlertOctagon, TrainFront, Clock, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { useStallDetector } from '@/hooks/useStallDetector';

export function StallAlert() {
    const {
        state,
        stallDurationMin,
        onConfirmTraffic,
        onConfirmEmergency,
        onDismissDelay,
    } = useStallDetector();

    const [shouldRender, setShouldRender] = useState(false);
    const [isAnimating, setIsAnimating] = useState(false);
    const [lastActiveState, setLastActiveState] = useState(state);

    const isActive = state === 'STALLED' || state === 'CONFIRMED_DELAY';

    useEffect(() => {
        if (isActive) {
            setLastActiveState(state);
            setShouldRender(true);
            setTimeout(() => setIsAnimating(true), 50);
        } else {
            setIsAnimating(false);
            const t = setTimeout(() => setShouldRender(false), 500);
            return () => clearTimeout(t);
        }
    }, [isActive, state]);

    if (!shouldRender) return null;

    const renderState = isActive ? state : lastActiveState;

    // ─── Confirmed Delay State ────────────────────────────────────
    if (renderState === 'CONFIRMED_DELAY') {
        return (
            <div className={`fixed bottom-0 left-0 right-0 z-[145] px-8 pb-8 pt-4 transition-all duration-500 ease-in-out transform ${isAnimating ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
                <div className="bg-red-950/50 backdrop-blur-3xl border border-red-500/30 rounded-3xl shadow-[0_0_60px_-15px_rgba(239,68,68,0.5)] p-6 text-white max-w-md md:max-w-lg mx-auto relative overflow-hidden ring-1 ring-white/10">
                    <div className="absolute inset-0 bg-gradient-to-b from-red-500/10 to-transparent pointer-events-none" />

                    <div className="flex items-start gap-4 mb-4 relative z-10">
                        <div className="bg-red-500 text-white p-3 rounded-2xl shadow-lg shadow-red-500/20 shrink-0">
                            <ShieldAlert className="w-7 h-7" />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-white tracking-tight">
                                Service Disruption
                            </h3>
                            <p className="text-sm text-red-200/80 font-medium leading-relaxed mt-1">
                                Emergency stop reported. Expect delays on this line.
                            </p>
                        </div>
                    </div>

                    <div className="bg-black/20 rounded-2xl p-4 border border-white/5 relative z-10 backdrop-blur-sm">
                        <div className="flex items-center gap-2 mb-2">
                            <Clock className="w-4 h-4 text-red-300/80" />
                            <span className="text-xs text-red-200/80 font-bold">
                                Stalled for ~{stallDurationMin} minutes
                            </span>
                        </div>
                        <p className="text-xs text-zinc-300/80 leading-relaxed">
                            Stay calm and wait for announcements from train operators.
                            Service typically resumes within 10-20 minutes.
                        </p>
                    </div>

                    <button
                        onClick={onDismissDelay}
                        className="w-full mt-4 py-3 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 text-white font-bold text-sm transition-all active:scale-95 relative z-10"
                    >
                        <CheckCircle2 className="w-4 h-4 inline mr-2" />
                        Understood
                    </button>
                </div>
            </div>
        );
    }

    // ─── Stall Confirmation Prompt ────────────────────────────────
    return (
        <div className={`fixed bottom-0 left-0 right-0 z-[145] px-8 pb-8 pt-4 transition-all duration-500 ease-in-out transform ${isAnimating ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
            <div className="bg-amber-950/40 backdrop-blur-3xl border border-amber-500/30 rounded-3xl shadow-[0_0_60px_-15px_rgba(245,158,11,0.5)] p-6 text-white max-w-md md:max-w-lg mx-auto relative overflow-hidden ring-1 ring-white/10">

                {/* Inner Glow */}
                <div className="absolute inset-0 bg-gradient-to-b from-amber-500/10 to-transparent pointer-events-none" />

                {/* Header */}
                <div className="flex items-start gap-4 mb-4 relative z-10">
                    <div className="bg-amber-500 text-white p-3 rounded-2xl shadow-lg shadow-amber-500/20 animate-pulse shrink-0">
                        <AlertOctagon className="w-7 h-7" />
                    </div>
                    <div>
                        <h3 className="text-xl font-bold text-white tracking-tight">
                            Possible Disruption
                        </h3>
                        <p className="text-sm text-amber-200/80 font-medium leading-relaxed mt-1">
                            Your train hasn&apos;t moved for <span className="text-white font-bold">~{stallDurationMin} minutes</span>.
                        </p>
                    </div>
                </div>

                {/* Info Box */}
                <div className="bg-black/20 rounded-2xl p-4 border border-white/5 relative z-10 backdrop-blur-sm mb-4">
                    <p className="text-xs text-zinc-300/90 leading-relaxed">
                        Help us improve alerts. Is this just slow traffic, or is there an emergency stop?
                    </p>
                </div>

                {/* Action Buttons */}
                <div className="space-y-3 relative z-10">
                    <button
                        onClick={onConfirmTraffic}
                        className="w-full py-3.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 text-white font-bold text-sm transition-all active:scale-95 flex items-center justify-center gap-2"
                    >
                        <TrainFront className="w-4 h-4" />
                        Just Slow Traffic
                    </button>
                    <button
                        onClick={onConfirmEmergency}
                        className="w-full py-3.5 rounded-xl bg-red-500/80 hover:bg-red-500 text-white font-bold text-sm transition-all active:scale-95 flex items-center justify-center gap-2 shadow-lg shadow-red-900/30"
                    >
                        <AlertOctagon className="w-4 h-4" />
                        Emergency Stop
                    </button>
                    <p className="text-[10px] text-white/30 text-center font-mono">
                        Auto-dismisses in 15s as slow traffic
                    </p>
                </div>
            </div>
        </div>
    );
}
