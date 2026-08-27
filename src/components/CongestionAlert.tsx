'use client';

/**
 * CongestionAlert — Rush Hour warning notification.
 * 
 * Amber/orange glassmorphism alert (same pattern as WrongDirectionAlert)
 * that warns users about HIGH or EXTREME congestion at upcoming stations.
 */

import { useEffect, useState } from 'react';
import { Users, X, Clock } from 'lucide-react';
import { useCongestionAlert } from '@/hooks/useCongestionAlert';
import { CongestionTier } from '@/data/congestion';

const TIER_CONFIG: Record<CongestionTier, {
    bg: string; border: string; glow: string; icon: string; gradient: string; badge: string;
}> = {
    EXTREME: {
        bg: 'bg-orange-950/40',
        border: 'border-orange-500/30',
        glow: 'shadow-[0_0_60px_-15px_rgba(249,115,22,0.6)]',
        icon: 'bg-orange-500 shadow-orange-500/20',
        gradient: 'from-orange-500/10',
        badge: 'border-orange-400/50 text-orange-100 bg-orange-500/20',
    },
    HIGH: {
        bg: 'bg-amber-950/40',
        border: 'border-amber-500/30',
        glow: 'shadow-[0_0_50px_-15px_rgba(245,158,11,0.5)]',
        icon: 'bg-amber-500 shadow-amber-500/20',
        gradient: 'from-amber-500/10',
        badge: 'border-amber-400/50 text-amber-100 bg-amber-500/20',
    },
    MODERATE: {
        bg: 'bg-yellow-950/40',
        border: 'border-yellow-500/30',
        glow: 'shadow-[0_0_40px_-15px_rgba(234,179,8,0.4)]',
        icon: 'bg-yellow-500 shadow-yellow-500/20',
        gradient: 'from-yellow-500/10',
        badge: 'border-yellow-400/50 text-yellow-100 bg-yellow-500/20',
    },
    LOW: {
        bg: 'bg-zinc-950/40',
        border: 'border-zinc-500/30',
        glow: '',
        icon: 'bg-zinc-500 shadow-zinc-500/20',
        gradient: 'from-zinc-500/10',
        badge: 'border-zinc-400/50 text-zinc-100 bg-zinc-500/20',
    },
};

export function CongestionAlert() {
    const { isVisible, congestion, stationName, onDismiss } = useCongestionAlert();
    const [shouldRender, setShouldRender] = useState(false);
    const [isAnimating, setIsAnimating] = useState(false);

    useEffect(() => {
        if (isVisible) {
            setShouldRender(true);
            setTimeout(() => setIsAnimating(true), 50);
        } else {
            setIsAnimating(false);
            const t = setTimeout(() => setShouldRender(false), 500);
            return () => clearTimeout(t);
        }
    }, [isVisible]);

    if (!shouldRender || !congestion) return null;

    const tier = congestion.tier;
    const config = TIER_CONFIG[tier];

    return (
        <div className={`fixed bottom-0 left-0 right-0 z-[140] px-8 pb-8 pt-4 transition-all duration-500 ease-in-out transform ${isAnimating ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
            <div className={`${config.bg} backdrop-blur-3xl border ${config.border} rounded-3xl ${config.glow} p-6 text-white max-w-md md:max-w-lg mx-auto relative overflow-hidden ring-1 ring-white/10`}>

                {/* Inner Glow */}
                <div className={`absolute inset-0 bg-gradient-to-b ${config.gradient} to-transparent pointer-events-none`} />

                {/* Dismiss Button */}
                <button
                    onClick={onDismiss}
                    className="absolute top-4 right-4 z-20 p-1 rounded-full bg-white/5 hover:bg-white/10 transition-colors"
                >
                    <X className="w-4 h-4 text-white/60" />
                </button>

                {/* Header */}
                <div className="flex items-start gap-4 mb-4 relative z-10">
                    <div className={`${config.icon} text-white p-3 rounded-2xl shadow-lg shrink-0 ${tier === 'EXTREME' ? 'animate-pulse' : ''}`}>
                        <Users className="w-7 h-7" />
                    </div>
                    <div>
                        <h3 className="text-xl font-bold text-white tracking-tight">
                            {tier === 'EXTREME' ? 'Extreme Congestion' : 'High Congestion Ahead'}
                        </h3>
                        <p className="text-sm text-white/70 font-medium leading-relaxed mt-1">
                            <span className="text-white font-bold">{stationName}</span> is currently{' '}
                            <span className="font-bold text-white/90">{(congestion.label ?? 'heavy').toLowerCase()}</span>.
                        </p>
                    </div>
                </div>

                {/* Info Box */}
                <div className="bg-black/20 rounded-2xl p-4 border border-white/5 relative z-10 backdrop-blur-sm space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[10px] px-2 py-1 rounded-full border font-bold uppercase tracking-wider ${config.badge}`}>
                            {congestion.label}
                        </span>
                        {congestion.isFriday && congestion.timeWindow.includes('FRIDAY') && (
                            <span className="text-[10px] px-2 py-1 rounded-full border border-red-400/50 text-red-200 bg-red-500/20 font-bold uppercase tracking-wider">
                                Friday Rush
                            </span>
                        )}
                        {congestion.activeEvent && (
                            <span className="text-[10px] px-2 py-1 rounded-full border border-purple-400/50 text-purple-200 bg-purple-500/20 font-bold uppercase tracking-wider">
                                ⚡ {congestion.activeEvent}
                            </span>
                        )}
                    </div>
                    <p className="text-xs text-zinc-300/90 leading-relaxed">
                        {congestion.reason || congestion.description}
                    </p>
                </div>

                {/* Tip — station-specific or generic fallback */}
                <div className="flex items-center gap-2 mt-4 relative z-10">
                    <Clock className="w-3.5 h-3.5 text-white/40 shrink-0" />
                    <p className="text-[10px] text-white/40">
                        {congestion.tip
                            ? congestion.tip
                            : tier === 'EXTREME'
                                ? 'Consider delaying your trip or using an alternate route.'
                                : 'Allow extra boarding time at this station.'}
                    </p>
                </div>
            </div>
        </div>
    );
}
