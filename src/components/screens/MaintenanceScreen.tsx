"use client";

import { Wrench, TrainFront, ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";

export function MaintenanceScreen() {
    const [mount, setMount] = useState(false);

    useEffect(() => {
        setMount(true);
    }, []);

    if (!mount) return null;

    return (
        <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center p-6 text-white overflow-hidden select-none">

            {/* Animated Background — dark gradient with moving particles */}
            <div className="absolute inset-0 bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950" />

            {/* Ambient glow orbs */}
            <div className="absolute top-[20%] left-[15%] w-72 h-72 bg-amber-500/8 rounded-full blur-[120px] animate-pulse pointer-events-none" />
            <div className="absolute bottom-[15%] right-[10%] w-96 h-96 bg-blue-500/6 rounded-full blur-[140px] animate-pulse pointer-events-none" style={{ animationDelay: '2s' }} />
            <div className="absolute top-[60%] left-[50%] w-64 h-64 bg-emerald-500/5 rounded-full blur-[100px] animate-pulse pointer-events-none" style={{ animationDelay: '4s' }} />

            {/* Subtle track lines pattern */}
            <div className="absolute inset-0 pointer-events-none opacity-[0.03]"
                style={{
                    backgroundImage: `repeating-linear-gradient(
                        0deg,
                        transparent,
                        transparent 60px,
                        rgba(255,255,255,0.5) 60px,
                        rgba(255,255,255,0.5) 62px
                    )`,
                }}
            />

            {/* Main Content Card */}
            <div className="relative z-10 flex flex-col items-center max-w-sm w-full text-center animate-in fade-in zoom-in-95 duration-1000">

                {/* Icon with glassmorphism container */}
                <div className="relative mb-8">
                    {/* Glow behind icon */}
                    <div className="absolute inset-[-20px] bg-amber-500/20 blur-3xl rounded-full animate-pulse" />

                    {/* Glass circle */}
                    <div className="relative w-28 h-28 rounded-full flex items-center justify-center"
                        style={{
                            background: 'linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.02))',
                            backdropFilter: 'blur(24px)',
                            WebkitBackdropFilter: 'blur(24px)',
                            border: '1px solid rgba(255,255,255,0.12)',
                            boxShadow: '0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1)',
                        }}
                    >
                        {/* Animated wrench */}
                        <Wrench className="w-12 h-12 text-amber-400/90 animate-wrench" />
                    </div>
                </div>

                {/* Headline */}
                <h1 className="text-2xl font-black tracking-tight text-white/95 mb-2 leading-tight">
                    Going back to the depot<br />to fix things up!
                </h1>

                {/* Subtext */}
                <p className="text-white/40 text-sm font-medium leading-relaxed mb-8 max-w-[280px]">
                    TrainTracks is undergoing scheduled maintenance.
                    We&apos;ll be back on track shortly.
                </p>

                {/* Glassmorphism info card */}
                <div className="w-full rounded-2xl p-5 mb-6"
                    style={{
                        background: 'linear-gradient(135deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02))',
                        backdropFilter: 'blur(20px)',
                        WebkitBackdropFilter: 'blur(20px)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        boxShadow: '0 8px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.08)',
                    }}
                >
                    {/* Status row */}
                    <div className="flex items-center justify-center gap-3 mb-4">
                        <span className="relative flex h-2.5 w-2.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-400" />
                        </span>
                        <span className="text-[11px] font-bold text-amber-400/90 uppercase tracking-[0.2em]">
                            Maintenance in Progress
                        </span>
                    </div>

                    {/* Divider */}
                    <div className="w-full h-[1px] bg-gradient-to-r from-transparent via-white/10 to-transparent mb-4" />

                    {/* What's happening */}
                    <div className="space-y-3">
                        {[
                            { emoji: "🔧", text: "System optimizations & bug fixes" },
                            { emoji: "🚀", text: "Performance improvements" },
                            { emoji: "✨", text: "New features coming soon" },
                        ].map((item, i) => (
                            <div
                                key={i}
                                className="flex items-center gap-3 px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.04]"
                                style={{ animationDelay: `${(i + 1) * 200}ms` }}
                            >
                                <span className="text-base">{item.emoji}</span>
                                <span className="text-xs text-white/50 font-medium">{item.text}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Animated train track divider */}
                <div className="w-full flex items-center gap-2 mb-6 opacity-20">
                    <div className="flex-1 h-[2px] bg-gradient-to-r from-transparent to-white/30" />
                    <div className="flex items-center gap-1">
                        <div className="w-1.5 h-1.5 rounded-full bg-white/40" />
                        <TrainFront className="w-4 h-4 text-white/60 animate-bounce-gentle" />
                        <ArrowRight className="w-3 h-3 text-white/40" />
                    </div>
                    <div className="flex-1 h-[2px] bg-gradient-to-l from-transparent to-white/30" />
                </div>

                {/* Footer Brand */}
                <div className="flex items-center gap-2 opacity-25">
                    <TrainFront className="w-4 h-4" />
                    <span className="text-xs font-bold tracking-[0.3em]">TRAINTRACKS</span>
                </div>
            </div>

            {/* Inline keyframes */}
            <style jsx global>{`
                @keyframes wrench-swing {
                    0%, 100% { transform: rotate(0deg); }
                    25% { transform: rotate(-15deg); }
                    75% { transform: rotate(15deg); }
                }
                .animate-wrench {
                    animation: wrench-swing 2.5s ease-in-out infinite;
                    transform-origin: 50% 70%;
                }
                @keyframes bounce-gentle {
                    0%, 100% { transform: translateX(0); }
                    50% { transform: translateX(4px); }
                }
                .animate-bounce-gentle {
                    animation: bounce-gentle 2s ease-in-out infinite;
                }
            `}</style>
        </div>
    );
}
