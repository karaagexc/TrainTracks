'use client';

/**
 * ServiceDisruptionBanner — Line-wide PSA for confirmed stall incidents.
 *
 * Shows when the Incident Aggregator confirms an incident on the user's
 * active line (≥3 reports from unique devices within 10 min / 2km).
 * Red for emergency, amber for traffic. Slides in from top.
 * "Trains moving again?" button sends a resolve vote.
 */

import { useEffect, useState, useCallback } from 'react';
import { AlertTriangle, ShieldAlert, CheckCircle2, X, Clock, Users } from 'lucide-react';
import { useIncidentListener } from '@/hooks/useIncidentListener';
import type { IncidentView } from '@/domain/crowd/incidentAggregator';

function timeAgo(isoString: string): string {
    const diffMs = Date.now() - new Date(isoString).getTime();
    const min = Math.floor(diffMs / 60_000);
    if (min < 1) return 'just now';
    if (min === 1) return '1 min ago';
    if (min < 60) return `${min} min ago`;
    const hrs = Math.floor(min / 60);
    return hrs === 1 ? '1 hr ago' : `${hrs} hrs ago`;
}

function formatLineLabel(lineId: string): string {
    if (lineId === 'LRT1') return 'LRT-1';
    if (lineId === 'LRT2') return 'LRT-2';
    if (lineId === 'MRT3') return 'MRT-3';
    return lineId;
}

function IncidentBanner({ incident, onResolveVote, onDismiss }: {
    incident: IncidentView;
    onResolveVote: (id: string) => void;
    onDismiss: (id: string) => void;
}) {
    const [isAnimating, setIsAnimating] = useState(false);
    const [voted, setVoted] = useState(false);

    useEffect(() => {
        const t = setTimeout(() => setIsAnimating(true), 50);
        return () => clearTimeout(t);
    }, []);

    const handleVote = useCallback(() => {
        if (voted) return;
        setVoted(true);
        onResolveVote(incident.id);
    }, [voted, onResolveVote, incident.id]);

    const isEmergency = incident.severity === 'emergency';

    return (
        <div className={`transition-all duration-500 ease-out transform ${isAnimating ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}>
            <div className={`${isEmergency
                ? 'bg-red-950/50 border-red-500/30 shadow-[0_0_40px_-15px_rgba(239,68,68,0.4)]'
                : 'bg-amber-950/40 border-amber-500/30 shadow-[0_0_40px_-15px_rgba(245,158,11,0.4)]'
                } backdrop-blur-3xl border rounded-2xl p-4 text-white relative overflow-hidden ring-1 ring-white/10`}
            >
                {/* Inner glow */}
                <div className={`absolute inset-0 bg-gradient-to-b ${isEmergency ? 'from-red-500/10' : 'from-amber-500/10'} to-transparent pointer-events-none`} />

                {/* Dismiss */}
                <button
                    onClick={() => onDismiss(incident.id)}
                    className="absolute top-3 right-3 z-20 p-1 rounded-full bg-white/5 hover:bg-white/10 transition-colors"
                >
                    <X className="w-3.5 h-3.5 text-white/60" />
                </button>

                {/* Header */}
                <div className="flex items-start gap-3 relative z-10">
                    <div className={`${isEmergency
                        ? 'bg-red-500 shadow-red-500/20'
                        : 'bg-amber-500 shadow-amber-500/20'
                        } text-white p-2.5 rounded-xl shadow-lg shrink-0 ${isEmergency ? 'animate-pulse' : ''}`}
                    >
                        {isEmergency
                            ? <ShieldAlert className="w-5 h-5" />
                            : <AlertTriangle className="w-5 h-5" />
                        }
                    </div>
                    <div className="flex-1 min-w-0 pr-6">
                        <h3 className="text-sm font-bold text-white tracking-tight leading-tight">
                            {isEmergency ? 'Service Disruption' : 'Possible Delays'} — {formatLineLabel(incident.lineId)}
                        </h3>
                        <p className="text-xs text-white/70 font-medium leading-relaxed mt-0.5">
                            {incident.psa}
                        </p>
                    </div>
                </div>

                {/* Meta */}
                <div className="flex items-center gap-3 mt-3 relative z-10 flex-wrap">
                    <div className="flex items-center gap-1">
                        <Users className="w-3 h-3 text-white/40" />
                        <span className="text-[10px] text-white/50 font-bold">
                            {incident.uniqueDeviceCount} {incident.uniqueDeviceCount === 1 ? 'report' : 'reports'}
                        </span>
                    </div>
                    {incident.confirmedAt && (
                        <div className="flex items-center gap-1">
                            <Clock className="w-3 h-3 text-white/40" />
                            <span className="text-[10px] text-white/50 font-bold">
                                {timeAgo(incident.confirmedAt)}
                            </span>
                        </div>
                    )}
                    {incident.nearestStationName && (
                        <span className={`text-[9px] px-2 py-0.5 rounded-full border font-bold ${isEmergency
                            ? 'border-red-400/30 text-red-200 bg-red-500/10'
                            : 'border-amber-400/30 text-amber-200 bg-amber-500/10'
                            }`}
                        >
                            near {incident.nearestStationName}
                        </span>
                    )}
                </div>

                {/* Resolve vote button */}
                <button
                    onClick={handleVote}
                    disabled={voted}
                    className={`w-full mt-3 py-2.5 rounded-xl text-sm font-bold transition-all active:scale-[0.97] relative z-10 flex items-center justify-center gap-2 ${voted
                        ? 'bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 cursor-default'
                        : 'bg-white/10 hover:bg-white/15 border border-white/10 text-white'
                        }`}
                >
                    <CheckCircle2 className="w-4 h-4" />
                    {voted ? 'Vote recorded' : 'Trains moving again?'}
                </button>
            </div>
        </div>
    );
}

export function ServiceDisruptionBanner() {
    const { activeIncidents, voteResolve } = useIncidentListener();
    const [dismissed, setDismissed] = useState<Set<string>>(new Set());

    // Filter out dismissed incidents
    const visibleIncidents = activeIncidents.filter((i) => !dismissed.has(i.id));

    // Auto-clear dismissed set when incidents resolve (cleanup)
    useEffect(() => {
        setDismissed((prev) => {
            const activeIds = new Set(activeIncidents.map((i) => i.id));
            const cleaned = new Set([...prev].filter((id) => activeIds.has(id)));
            return cleaned.size === prev.size ? prev : cleaned;
        });
    }, [activeIncidents]);

    if (visibleIncidents.length === 0) return null;

    return (
        <div className="fixed top-0 left-0 right-0 z-[135] px-4 pt-[calc(env(safe-area-inset-top)+8px)] pb-2 pointer-events-none">
            <div className="max-w-md md:max-w-lg mx-auto space-y-2 pointer-events-auto">
                {visibleIncidents.map((incident) => (
                    <IncidentBanner
                        key={incident.id}
                        incident={incident}
                        onResolveVote={voteResolve}
                        onDismiss={(id) => setDismissed((prev) => new Set([...prev, id]))}
                    />
                ))}
            </div>
        </div>
    );
}
