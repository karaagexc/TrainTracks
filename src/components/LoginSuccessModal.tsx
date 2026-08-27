'use client';

import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, TrainFront, Sparkles } from 'lucide-react';

interface LoginSuccessModalProps {
    isOpen: boolean;
    onComplete: () => void;
}

export default function LoginSuccessModal({ isOpen, onComplete }: LoginSuccessModalProps) {
    const [phase, setPhase] = useState<'enter' | 'show' | 'exit'>('enter');
    const onCompleteRef = useRef(onComplete);

    useEffect(() => {
        onCompleteRef.current = onComplete;
    }, [onComplete]);

    useEffect(() => {
        if (!isOpen) {
            setPhase('enter');
            return;
        }

        // Enter animation
        setPhase('enter');
        const showTimer = setTimeout(() => setPhase('show'), 50);
        // Auto-exit after 1.8s
        const exitTimer = setTimeout(() => setPhase('exit'), 1800);
        // Complete after exit animation
        const completeTimer = setTimeout(() => onCompleteRef.current(), 2200);

        return () => {
            clearTimeout(showTimer);
            clearTimeout(exitTimer);
            clearTimeout(completeTimer);
        };
    }, [isOpen]);

    if (!isOpen) return null;

    return (
        <div className={`fixed inset-0 z-[300] flex items-center justify-center transition-all duration-300 ${phase === 'enter' ? 'opacity-0' : phase === 'exit' ? 'opacity-0 scale-95' : 'opacity-100'
            }`}>
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/80 backdrop-blur-md" />

            {/* Content */}
            <div className={`relative z-10 flex flex-col items-center transition-all duration-500 ${phase === 'show' ? 'scale-100 translate-y-0' : phase === 'enter' ? 'scale-90 translate-y-4' : 'scale-95 -translate-y-4'
                }`}>
                {/* Success icon */}
                <div className="relative mb-6">
                    {/* Pulse ring */}
                    <div className="absolute inset-0 w-24 h-24 rounded-full bg-green-500/20 animate-ping" style={{ animationDuration: '1.5s' }} />
                    {/* Outer glow ring */}
                    <div className={`absolute -inset-3 w-30 h-30 rounded-full border border-green-500/15 transition-all duration-700 ${phase === 'show' ? 'scale-125 opacity-100' : 'scale-75 opacity-0'
                        }`} />
                    {/* Icon */}
                    <div className={`w-24 h-24 rounded-full bg-gradient-to-br from-green-500/25 to-emerald-500/15 border border-green-500/30 flex items-center justify-center relative overflow-hidden transition-transform duration-500 ${phase === 'show' ? 'scale-100' : 'scale-50'
                        }`}>
                        {/* Shimmer */}
                        <div
                            className="absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent"
                            style={{ animation: phase === 'show' ? 'lsShimmer 1.5s ease-in-out forwards 0.5s' : 'none', transform: 'translateX(-100%)' }}
                        />
                        <CheckCircle2 className="w-12 h-12 text-green-400 relative z-10" strokeWidth={1.5} />
                    </div>
                </div>

                {/* Text */}
                <div className={`flex items-center gap-1.5 mb-3 transition-all duration-500 delay-100 ${phase === 'show' ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
                    }`}>
                    <TrainFront className="w-3.5 h-3.5 text-white/30" />
                    <span className="text-[10px] font-bold tracking-[0.25em] text-white/30 uppercase">TrainTracks</span>
                </div>

                <h2 className={`text-2xl font-black tracking-tight text-white text-center mb-2 transition-all duration-500 delay-150 ${phase === 'show' ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'
                    }`}>
                    Welcome Back!
                </h2>

                <p className={`text-zinc-500 text-sm text-center transition-all duration-500 delay-200 ${phase === 'show' ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'
                    }`}>
                    Signed in successfully
                </p>

                {/* Sparkle divider */}
                <div className={`flex items-center gap-1 mt-5 transition-all duration-500 delay-300 ${phase === 'show' ? 'opacity-100' : 'opacity-0'
                    }`}>
                    <Sparkles className="w-3 h-3 text-green-400/40" />
                    <div className="w-12 h-px bg-gradient-to-r from-transparent via-green-500/25 to-transparent" />
                    <Sparkles className="w-3 h-3 text-green-400/40" />
                </div>
            </div>

            <style jsx>{`
                @keyframes lsShimmer {
                    from { transform: translateX(-100%); }
                    to { transform: translateX(100%); }
                }
            `}</style>
        </div>
    );
}
