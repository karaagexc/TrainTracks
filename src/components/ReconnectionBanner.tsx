"use client";

import { useEffect, useState } from "react";
import { shouldShowGpsReconnectionBanner } from "@/domain/location/status";
import { useTripStore } from "@/store/useTripStore";
import { WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";

export function ReconnectionBanner() {
    const gpsReconnecting = useTripStore((state) => state.gpsReconnecting);
    const isDevMode = useTripStore((state) => state.isDevMode);
    const shouldShow = shouldShowGpsReconnectionBanner(gpsReconnecting, isDevMode);

    return shouldShow ? <ActiveReconnectionBanner /> : null;
}

function ActiveReconnectionBanner() {
    const [elapsedSeconds, setElapsedSeconds] = useState(0);
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const showTimer = setTimeout(() => setVisible(true), 300);
        const counter = setInterval(() => {
            setElapsedSeconds(prev => prev + 1);
        }, 1000);

        return () => {
            clearTimeout(showTimer);
            clearInterval(counter);
        };
    }, []);

    if (!visible) return null;

    const formatTime = (s: number) => {
        if (s < 60) return `${s}s`;
        return `${Math.floor(s / 60)}m ${s % 60}s`;
    };

    return (
        <div className={cn(
            "fixed top-0 left-0 right-0 z-[200] flex items-center justify-center",
            "animate-in slide-in-from-top duration-500"
        )}>
            <div className="w-full max-w-md mx-auto px-4 pt-[calc(env(safe-area-inset-top)+8px)]">
                <div className="flex items-center gap-3 bg-amber-950/90 backdrop-blur-xl border border-amber-600/30 rounded-2xl px-4 py-3 shadow-2xl shadow-amber-900/20">
                    {/* Animated Signal Icon */}
                    <div className="relative flex-shrink-0">
                        <WifiOff className="w-5 h-5 text-amber-400" />
                        <div className="absolute inset-0 animate-ping">
                            <WifiOff className="w-5 h-5 text-amber-400/30" />
                        </div>
                    </div>

                    {/* Text */}
                    <div className="flex-1 min-w-0">
                        <p className="text-amber-100 text-sm font-semibold tracking-tight">
                            Trying to reconnect...
                        </p>
                        <p className="text-amber-400/70 text-xs">
                            Signal lost {formatTime(elapsedSeconds)} ago
                        </p>
                    </div>

                    {/* Pulsing Dots */}
                    <div className="flex gap-1 flex-shrink-0">
                        {[0, 1, 2].map(i => (
                            <div
                                key={i}
                                className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-bounce"
                                style={{ animationDelay: `${i * 200}ms`, animationDuration: '1s' }}
                            />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
