"use client";

import { useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, UserCheck, Volume2, CreditCard, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

interface SafetyRulesProps {
    open: boolean;
    isBusMode?: boolean;
    onDismiss: () => void;
}

export function SafetyRules({ open, isBusMode = false, onDismiss }: SafetyRulesProps) {
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
                        <div className="p-2.5 bg-yellow-500/20 rounded-xl">
                            <ShieldCheck className="w-6 h-6 text-yellow-500" />
                        </div>
                        <div>
                            <h2 className="text-lg font-black tracking-tight text-white uppercase">
                                {isBusMode ? "Bus Stop Safety" : "Safety Protocols"}
                            </h2>
                            <p className="text-zinc-500 text-xs font-bold uppercase tracking-wider">Before you board</p>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <RuleItem
                            icon={<div className="w-full h-2 bg-yellow-500 rounded-full shadow-[0_0_10px_rgba(234,179,8,0.5)]" />}
                            title={isBusMode ? "Wait for a Complete Stop" : "Yellow Line"}
                            desc={isBusMode
                                ? "Stay clear of the curb and approach only after the bus has fully stopped."
                                : "Stay behind the yellow tactile paving. Do not cross until the train has fully stopped."}
                        />
                        <RuleItem
                            icon={<UserCheck className="w-5 h-5 text-emerald-400" />}
                            title="Let Passengers Out"
                            desc="Stand aside and allow passengers to disembark before entering."
                        />
                        <RuleItem
                            icon={<Volume2 className="w-5 h-5 text-red-400 animate-pulse" />}
                            title={isBusMode ? "Board Carefully" : "Respect the Buzzer"}
                            desc={isBusMode
                                ? "Use the handrail, watch your step, and do not rush closing doors."
                                : "When the door buzzer sounds, step back. Do not force yourself in."}
                        />
                        <RuleItem
                            icon={<CreditCard className="w-5 h-5 text-blue-400" />}
                            title="Secure Valuables"
                            desc="Keep your fare card, ticket, and gadgets secure. Watch your belongings."
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
                        Safety is a shared responsibility.
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