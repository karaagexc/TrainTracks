"use client";

import { TrainFront, ArrowRight, CalendarDays } from "lucide-react";
import { useEffect, useState } from "react";

export function HolyWeekScreen() {
    const [mount, setMount] = useState(false);

    useEffect(() => {
        setMount(true);
    }, []);

    if (!mount) return null;

    return (
        <div className="fixed inset-0 z-[300] flex flex-col items-center justify-center p-6 text-white overflow-hidden select-none">

            {/* Animated Background — dark gradient with moving particles */}
            <div className="absolute inset-0 bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950" />

            {/* Ambient glow orbs - using a more muted, purple/amber tone for Holy Week */}
            <div className="absolute top-[20%] left-[15%] w-72 h-72 bg-purple-500/8 rounded-full blur-[120px] animate-pulse pointer-events-none" />
            <div className="absolute bottom-[15%] right-[10%] w-96 h-96 bg-amber-500/6 rounded-full blur-[140px] animate-pulse pointer-events-none" style={{ animationDelay: '2s' }} />
            <div className="absolute top-[60%] left-[50%] w-64 h-64 bg-indigo-500/5 rounded-full blur-[100px] animate-pulse pointer-events-none" style={{ animationDelay: '4s' }} />

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
                    <div className="absolute inset-[-20px] bg-purple-500/20 blur-3xl rounded-full animate-pulse" />

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
                        {/* Animated calendar */}
                        <CalendarDays className="w-12 h-12 text-purple-400/90 animate-pulse-slow" />
                    </div>
                </div>

                {/* Headline */}
                <h1 className="text-2xl font-black tracking-tight text-white/95 mb-2 leading-tight">
                    Walang Byahe Ngayong<br />Semana Santa
                </h1>

                {/* Subtext */}
                <p className="text-white/40 text-sm font-medium leading-relaxed mb-8 max-w-[280px]">
                    Pansamantalang tigil-pasada ang TrainTracks bilang paggunita sa Mahal na Araw.
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
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-purple-400" />
                        </span>
                        <span className="text-[11px] font-bold text-purple-400/90 uppercase tracking-[0.2em]">
                            System Offline
                        </span>
                    </div>

                    {/* Divider */}
                    <div className="w-full h-[1px] bg-gradient-to-r from-transparent via-white/10 to-transparent mb-4" />

                    {/* What's happening */}
                    <div className="space-y-3">
                        {[
                            { emoji: "🗓️", text: "Tigil pasada: April 1 - 3, 2026" },
                            { emoji: "🔙", text: "Balik byahe: April 4, 2026" },
                            { emoji: "✨", text: "Mag-ingat at magmuni-muni" },
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
                @keyframes pulse-slow {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.7; }
                }
                .animate-pulse-slow {
                    animation: pulse-slow 3s ease-in-out infinite;
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
