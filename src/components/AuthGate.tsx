"use client";

import { useState, useEffect } from "react";
import { AlertTriangle, Lock } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
    children: React.ReactNode;
}

const PIN_CODE = process.env.NEXT_PUBLIC_ALPHA_ACCESS_PIN?.trim() || "";

export function AuthGate({ children }: Props) {
    const [input, setInput] = useState("");
    const [isUnlocked, setIsUnlocked] = useState(false);
    const [error, setError] = useState(false);

    useEffect(() => {
        const stored = sessionStorage.getItem("alpha_access");
        if (stored === "true") setIsUnlocked(true);
    }, []);

    const handleInput = (val: string) => {
        if (val.length > 4) return;
        setInput(val);
        setError(false);

        if (!PIN_CODE) return;

        if (val.length === 4) {
            if (val === PIN_CODE) {
                setIsUnlocked(true);
                sessionStorage.setItem("alpha_access", "true");
            } else {
                setError(true);
                setInput("");
            }
        }
    };

    if (isUnlocked) return <>{children}</>;

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-black text-white p-6 space-y-8 animate-in fade-in duration-500">
            <div className="w-20 h-20 bg-zinc-900 rounded-2xl flex items-center justify-center shadow-2xl border border-zinc-800">
                {PIN_CODE ? (
                    <Lock className="w-8 h-8 text-zinc-500" />
                ) : (
                    <AlertTriangle className="w-8 h-8 text-amber-400" />
                )}
            </div>

            <div className="text-center space-y-2">
                <h1 className="text-2xl font-black tracking-tight">ALPHA ACCESS</h1>
                <p className="text-zinc-500 text-sm">
                    {PIN_CODE ? 'Enter Security PIN to continue' : 'Alpha PIN is not configured for this build'}
                </p>
            </div>

            {PIN_CODE ? (
                <div className="w-full max-w-xs space-y-8">
                    <div className="flex justify-center gap-4">
                        {[0, 1, 2, 3].map((i) => (
                            <div key={i} className={cn(
                                "w-4 h-4 rounded-full transition-all duration-300",
                                input.length > i ? "bg-white scale-110" : "bg-zinc-800",
                                error && "bg-red-500 animate-shake"
                            )} />
                        ))}
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                            <button
                                key={num}
                                onClick={() => handleInput(input + num)}
                                className="h-16 rounded-2xl bg-zinc-900/50 hover:bg-zinc-800 text-xl font-bold transition-colors active:scale-95"
                            >
                                {num}
                            </button>
                        ))}
                        <div />
                        <button
                            onClick={() => handleInput(input + "0")}
                            className="h-16 rounded-2xl bg-zinc-900/50 hover:bg-zinc-800 text-xl font-bold transition-colors active:scale-95"
                        >
                            0
                        </button>
                        <button
                            onClick={() => setInput(input.slice(0, -1))}
                            className="h-16 rounded-2xl bg-transparent hover:bg-zinc-900/30 text-zinc-500 flex items-center justify-center"
                        >
                            ⌫
                        </button>
                    </div>
                </div>
            ) : (
                <div className="max-w-sm text-center text-sm text-zinc-500 leading-relaxed">
                    Set `NEXT_PUBLIC_ALPHA_ACCESS_PIN` to enable this gate instead of shipping a hardcoded PIN.
                </div>
            )}

            {error && <p className="text-red-500 font-bold animate-pulse">ACCESS DENIED</p>}
        </div>
    );
}
