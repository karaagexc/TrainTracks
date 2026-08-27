"use client";

import { Moon, Clock, TrainFront } from "lucide-react";
import { useEffect, useState } from "react";

export function ClosedScreen() {
    const [mount, setMount] = useState(false);

    useEffect(() => {
        setMount(true);
    }, []);

    if (!mount) return null;

    return (
        <div className="fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center p-6 text-white overflow-hidden">

            {/* Ambient Background Glow */}
            <div className="absolute top-[-20%] left-[-20%] w-[140%] h-[140%] bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-blue-900/20 via-black to-black animate-pulse-slow pointer-events-none" />

            <div className="relative z-10 flex flex-col items-center max-w-sm text-center space-y-8 animate-in fade-in zoom-in-95 duration-1000">

                {/* Icon Container with Glow */}
                <div className="relative">
                    <div className="absolute inset-0 bg-blue-500/30 blur-3xl rounded-full" />
                    <div className="w-24 h-24 bg-white/5 backdrop-blur-2xl border border-white/10 rounded-full flex items-center justify-center shadow-2xl relative">
                        <Moon className="w-10 h-10 text-blue-200 fill-blue-200/20" />
                    </div>
                </div>

                {/* Main Text */}
                <div className="space-y-2">
                    <h1 className="text-3xl font-black tracking-tight text-white/90">
                        Station Closed
                    </h1>
                    <p className="text-white/50 text-sm font-medium leading-relaxed">
                        Train operations have ended for the day.<br />
                        Have a safe rest! 🌙
                    </p>
                </div>

                {/* Info Card */}
                <div className="w-full bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-4 flex items-center justify-between shadow-lg">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-emerald-900/30 rounded-lg">
                            <Clock className="w-5 h-5 text-emerald-400" />
                        </div>
                        <div className="text-left">
                            <div className="text-[10px] uppercase text-white/40 font-bold tracking-wider">
                                Opening Time
                            </div>
                            <div className="text-sm font-bold text-white/90">
                                4:30 AM
                            </div>
                        </div>
                    </div>

                    <div className="h-8 w-[1px] bg-white/10" />

                    <div className="text-right">
                        <div className="text-[10px] uppercase text-white/40 font-bold tracking-wider">
                            Closing Time
                        </div>
                        <div className="text-sm font-bold text-white/90">
                            11:20 PM
                        </div>
                    </div>
                </div>

                {/* Footer Brand */}
                <div className="mt-16 opacity-30 flex items-center gap-2">
                    <TrainFront className="w-4 h-4" />
                    <span className="text-xs font-bold tracking-widest">TRAINTRACKS</span>
                </div>

            </div>
        </div>
    );
}
