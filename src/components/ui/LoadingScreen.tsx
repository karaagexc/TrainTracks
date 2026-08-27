"use client";

import { useEffect, useState } from "react";
import { TrainFront } from "lucide-react";

const BOOT_MESSAGES = [
    { text: "sys.init", delay: 0 },
    { text: "auth.handshake", delay: 200 },
    { text: "map.preload", delay: 450 },
    { text: "gps.acquire", delay: 700 },
    { text: "rail.connect", delay: 1000 },
    { text: "ui.render", delay: 1300 },
];

export function LoadingScreen() {
    const [progress, setProgress] = useState(0);
    const [visibleMessages, setVisibleMessages] = useState<number>(0);
    const [dots, setDots] = useState("");

    // Animated dots
    useEffect(() => {
        const interval = setInterval(() => {
            setDots(prev => prev.length >= 3 ? "" : prev + ".");
        }, 400);
        return () => clearInterval(interval);
    }, []);

    // Progress bar animation
    useEffect(() => {
        const duration = 2000;
        const steps = 60;
        const increment = 100 / steps;
        let current = 0;
        const timer = setInterval(() => {
            current += increment;
            if (current >= 100) {
                setProgress(100);
                clearInterval(timer);
            } else {
                setProgress(current);
            }
        }, duration / steps);
        return () => clearInterval(timer);
    }, []);

    // Boot messages cascade
    useEffect(() => {
        BOOT_MESSAGES.forEach((msg, idx) => {
            setTimeout(() => {
                setVisibleMessages(prev => Math.max(prev, idx + 1));
            }, msg.delay);
        });
    }, []);

    return (
        <div className="min-h-screen bg-black flex flex-col items-center justify-center relative overflow-hidden select-none">
            {/* Ambient gradients */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-white/[0.02] rounded-full blur-[100px] pointer-events-none" />
            <div
                className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[200px] h-[200px] rounded-full blur-[80px] pointer-events-none transition-opacity duration-1000"
                style={{
                    background: 'radial-gradient(circle, rgba(255,255,255,0.04) 0%, transparent 70%)',
                    animation: 'lsPulseGlow 3s ease-in-out infinite',
                }}
            />

            {/* Main content */}
            <div className="relative z-10 flex flex-col items-center w-full max-w-xs px-6">
                {/* Train Icon */}
                <div className="relative mb-10">
                    {/* Glow ring */}
                    <div
                        className="absolute inset-0 w-24 h-24 rounded-full border border-white/5"
                        style={{ animation: 'lsRingPulse 2s ease-in-out infinite' }}
                    />
                    <div
                        className="absolute -inset-3 w-[120px] h-[120px] rounded-full"
                        style={{
                            background: 'radial-gradient(circle, rgba(255,255,255,0.06) 0%, transparent 70%)',
                            animation: 'lsPulseGlow 2.5s ease-in-out infinite',
                        }}
                    />
                    {/* Icon container */}
                    <div
                        className="w-24 h-24 bg-white/[0.03] backdrop-blur-xl border border-white/[0.08] rounded-full flex items-center justify-center shadow-2xl relative overflow-hidden"
                        style={{ animation: 'lsIconFloat 3s ease-in-out infinite' }}
                    >
                        {/* Shimmer sweep */}
                        <div
                            className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.06] to-transparent"
                            style={{ animation: 'lsShimmer 3s ease-in-out infinite' }}
                        />
                        <TrainFront className="w-10 h-10 text-white/80 relative z-10" />
                    </div>
                </div>

                {/* Brand text */}
                <div className="flex items-center gap-2 mb-2" style={{ animation: 'lsFadeIn 600ms ease-out forwards', animationDelay: '200ms', opacity: 0 }}>
                    <span className="text-[11px] font-black tracking-[0.3em] text-white/25 uppercase">TrainTracks</span>
                </div>

                {/* Loading text */}
                <p
                    className="text-xs text-white/30 font-medium mb-8 h-4"
                    style={{ animation: 'lsFadeIn 600ms ease-out forwards', animationDelay: '400ms', opacity: 0 }}
                >
                    Loading{dots}
                </p>

                {/* Progress bar */}
                <div
                    className="w-full mb-8"
                    style={{ animation: 'lsFadeIn 600ms ease-out forwards', animationDelay: '300ms', opacity: 0 }}
                >
                    <div className="w-full h-[3px] bg-white/[0.04] rounded-full overflow-hidden">
                        <div
                            className="h-full bg-gradient-to-r from-white/20 via-white/40 to-white/20 rounded-full transition-all duration-100 ease-linear relative"
                            style={{ width: `${progress}%` }}
                        >
                            {/* Glowing tip */}
                            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white/30 rounded-full blur-sm" />
                        </div>
                    </div>
                </div>

                {/* Boot log (mini panic logger style) */}
                <div
                    className="w-full space-y-1"
                    style={{ animation: 'lsFadeIn 600ms ease-out forwards', animationDelay: '500ms', opacity: 0 }}
                >
                    {BOOT_MESSAGES.slice(0, visibleMessages).map((msg, idx) => (
                        <div
                            key={msg.text}
                            className="flex items-center gap-2 font-mono"
                            style={{
                                animation: 'lsLineIn 300ms ease-out forwards',
                                opacity: 0,
                                animationDelay: `${idx * 50}ms`,
                            }}
                        >
                            <span className="text-[9px] text-emerald-500/40">✓</span>
                            <span className="text-[9px] text-white/15 tracking-wider">{msg.text}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Footer */}
            <div className="absolute bottom-6 flex flex-col items-center gap-1">
                <span className="text-[9px] text-zinc-800 font-mono tracking-widest">METRO MANILA RAIL</span>
            </div>

            {/* Keyframes */}
            <style jsx>{`
                @keyframes lsPulseGlow {
                    0%, 100% { opacity: 0.5; transform: translate(-50%, -50%) scale(1); }
                    50% { opacity: 1; transform: translate(-50%, -50%) scale(1.1); }
                }
                @keyframes lsRingPulse {
                    0%, 100% { opacity: 0.3; transform: scale(1); }
                    50% { opacity: 0.6; transform: scale(1.05); }
                }
                @keyframes lsIconFloat {
                    0%, 100% { transform: translateY(0); }
                    50% { transform: translateY(-6px); }
                }
                @keyframes lsShimmer {
                    0% { transform: translateX(-100%); }
                    50% { transform: translateX(100%); }
                    100% { transform: translateX(100%); }
                }
                @keyframes lsFadeIn {
                    from { opacity: 0; transform: translateY(6px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                @keyframes lsLineIn {
                    from { opacity: 0; transform: translateX(-4px); }
                    to { opacity: 1; transform: translateX(0); }
                }
            `}</style>
        </div>
    );
}
