"use client";

import { useEffect, useState, type ReactNode } from "react";
import { AlertOctagon, UserCheck, ShieldCheck, DoorOpen, Grip } from "lucide-react";
import { cn } from "@/lib/utils";

interface TransitRulesProps {
    open: boolean;
    isBusMode?: boolean;
    onDismiss: () => void;
}

export function TransitRules({ open, isBusMode = false, onDismiss }: TransitRulesProps) {
    const [isClosing, setIsClosing] = useState(false);

    useEffect(() => {
        if (open) setIsClosing(false);
    }, [open]);

    const handleDismiss = () => {
        setIsClosing(true);
        window.setTimeout(() => {
            setIsClosing(false);
            onDismiss();
        }, 300);
    };

    if (!open) return null;

    return (
        <div className={cn(
            "fixed inset-0 z-[80] flex items-center justify-center px-6 py-4 bg-black/80 backdrop-blur-sm transition-all duration-300",
            isClosing ? "animate-out fade-out fill-mode-forwards" : "animate-in fade-in fill-mode-forwards"
        )}>
            <div className={cn(
                "w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden shadow-2xl relative transition-all duration-300",
                isClosing ? "animate-out zoom-out-95 fade-out fill-mode-forwards" : "animate-in zoom-in-95 duration-300"
            )}>
                <div className="p-6 pb-4">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-2.5 bg-blue-500/20 rounded-xl">
                            <ShieldCheck className="w-6 h-6 text-blue-500" />
                        </div>
                        <div>
                            <h2 className="text-lg font-black tracking-tight text-white uppercase">In-Transit Safety</h2>
                            <p className="text-zinc-500 text-xs font-bold uppercase tracking-wider">While onboard</p>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <RuleItem
                            icon={<Grip className="w-5 h-5 text-zinc-400" />}
                            title="Hold On"
                            desc="Always use the grab handles or handrails, especially when standing."
                        />
                        <RuleItem
                            icon={<UserCheck className="w-5 h-5 text-emerald-400" />}
                            title="Priority Seating"
                            desc="Give up your seat to PWDs, seniors, and pregnant passengers."
                        />
                        <RuleItem
                            icon={<DoorOpen className="w-5 h-5 text-red-400" />}
                            title="Door Safety"
                            desc={isBusMode
                                ? "Keep the aisle and doors clear. Wait until the vehicle stops before moving to exit."
                                : "Do not lean on the doors. Do not force them open."}
                        />
                        <RuleItem
                            icon={<AlertOctagon className="w-5 h-5 text-amber-400" />}
                            title={isBusMode ? "Stay Balanced" : "Mind the Gap"}
                            desc={isBusMode
                                ? "Expect sudden braking and turns. Keep one hand free for support."
                                : "Watch your step and stay steady while the train is moving."}
                        />
                    </div>
                </div>

                <div className="p-4 bg-zinc-900 border-t border-zinc-800">
                    <button
                        onClick={handleDismiss}
                        className="w-full bg-white hover:bg-zinc-200 text-black font-bold py-3.5 rounded-xl transition-all active:scale-[0.98] shadow-lg shadow-white/5 uppercase tracking-widest text-xs"
                    >
                        I Understand
                    </button>
                    <p className="text-center text-[10px] text-zinc-600 mt-2 font-medium">
                        Have a safe trip!
                    </p>
                </div>
            </div>
        </div>
    );
}

function RuleItem({ icon, title, desc }: { icon: ReactNode; title: string; desc: string }) {
    return (
        <div className="flex gap-4 p-3 rounded-xl bg-zinc-800/40 border border-zinc-700/40 items-start">
            <div className="mt-0.5 shrink-0 w-8 flex justify-center">{icon}</div>
            <div>
                <h3 className="text-sm font-bold text-zinc-200 mb-0.5">{title}</h3>
                <p className="text-xs text-zinc-500 leading-snug">{desc}</p>
            </div>
        </div>
    );
}