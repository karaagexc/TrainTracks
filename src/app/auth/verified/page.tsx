'use client';

import { TrainFront, CheckCircle2, Sparkles, ArrowRight } from 'lucide-react';
import Link from 'next/link';

export default function VerifiedPage() {
    return (
        <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6 relative overflow-hidden">
            {/* Ambient background glow */}
            <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-green-500/8 rounded-full blur-[120px] pointer-events-none animate-pulse" />
            <div className="absolute bottom-1/4 left-1/3 w-[300px] h-[300px] bg-blue-500/5 rounded-full blur-[100px] pointer-events-none" />
            <div className="absolute top-1/3 right-1/4 w-[200px] h-[200px] bg-emerald-500/5 rounded-full blur-[80px] pointer-events-none" />

            {/* Floating particles */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
                {[...Array(6)].map((_, i) => (
                    <div
                        key={i}
                        className="absolute w-1 h-1 bg-green-400/30 rounded-full"
                        style={{
                            left: `${15 + i * 15}%`,
                            top: `${20 + (i % 3) * 25}%`,
                            animation: `float ${3 + i * 0.5}s ease-in-out infinite alternate`,
                            animationDelay: `${i * 0.3}s`,
                        }}
                    />
                ))}
            </div>

            {/* Main content card */}
            <div
                className="relative z-10 flex flex-col items-center max-w-sm w-full"
                style={{ animation: 'verifiedIn 800ms cubic-bezier(0.16, 1, 0.3, 1)' }}
            >
                {/* Success icon with rings */}
                <div className="relative mb-8">
                    {/* Outer ring */}
                    <div
                        className="absolute inset-0 w-28 h-28 rounded-full border border-green-500/20"
                        style={{ animation: 'ringExpand 1.5s ease-out forwards', animationDelay: '0.3s', opacity: 0 }}
                    />
                    {/* Middle ring */}
                    <div
                        className="absolute -inset-2 w-32 h-32 rounded-full border border-green-500/10"
                        style={{ animation: 'ringExpand 1.5s ease-out forwards', animationDelay: '0.5s', opacity: 0 }}
                    />

                    {/* Icon container */}
                    <div
                        className="w-28 h-28 rounded-full bg-gradient-to-br from-green-500/20 to-emerald-500/10 border border-green-500/30 flex items-center justify-center relative overflow-hidden"
                        style={{ animation: 'iconPop 600ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards', animationDelay: '0.2s', opacity: 0, transform: 'scale(0.5)' }}
                    >
                        {/* Shimmer */}
                        <div
                            className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full"
                            style={{ animation: 'shimmer 2s ease-in-out forwards', animationDelay: '1s' }}
                        />
                        <CheckCircle2 className="w-14 h-14 text-green-400 relative z-10" strokeWidth={1.5} />
                    </div>
                </div>

                {/* Branding */}
                <div
                    className="flex items-center gap-1.5 mb-4"
                    style={{ animation: 'fadeSlideUp 500ms ease-out forwards', animationDelay: '0.4s', opacity: 0 }}
                >
                    <TrainFront className="w-4 h-4 text-white/30" />
                    <span className="text-[11px] font-bold tracking-[0.25em] text-white/30 uppercase">TrainTracks</span>
                </div>

                {/* Title */}
                <h1
                    className="text-3xl font-black tracking-tight text-white text-center mb-3"
                    style={{ animation: 'fadeSlideUp 500ms ease-out forwards', animationDelay: '0.5s', opacity: 0 }}
                >
                    Account Verified!
                </h1>

                {/* Subtitle */}
                <p
                    className="text-zinc-500 text-sm text-center mb-2 max-w-xs"
                    style={{ animation: 'fadeSlideUp 500ms ease-out forwards', animationDelay: '0.6s', opacity: 0 }}
                >
                    Your email has been confirmed successfully.
                </p>
                <p
                    className="text-zinc-600 text-xs text-center mb-10 max-w-xs"
                    style={{ animation: 'fadeSlideUp 500ms ease-out forwards', animationDelay: '0.7s', opacity: 0 }}
                >
                    You&apos;re all set to start tracking your commute.
                </p>

                {/* Decorative sparkles */}
                <div
                    className="flex items-center gap-1 mb-6"
                    style={{ animation: 'fadeSlideUp 500ms ease-out forwards', animationDelay: '0.8s', opacity: 0 }}
                >
                    <Sparkles className="w-3 h-3 text-green-400/50" />
                    <div className="w-16 h-px bg-gradient-to-r from-transparent via-green-500/30 to-transparent" />
                    <Sparkles className="w-3 h-3 text-green-400/50" />
                </div>

                {/* CTA Button */}
                <Link
                    href="/"
                    className="group w-full flex items-center justify-center gap-2.5 py-4 px-6 rounded-2xl bg-gradient-to-r from-green-500/20 to-emerald-500/15 hover:from-green-500/30 hover:to-emerald-500/25 text-green-300 font-bold text-sm border border-green-500/20 hover:border-green-500/30 transition-all duration-300 active:scale-[0.98] shadow-lg shadow-green-500/5"
                    style={{ animation: 'fadeSlideUp 500ms ease-out forwards', animationDelay: '0.9s', opacity: 0 }}
                >
                    <TrainFront className="w-5 h-5" />
                    Open TrainTracks
                    <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                </Link>

                {/* Secondary link */}
                <Link
                    href="/login"
                    className="mt-4 text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
                    style={{ animation: 'fadeSlideUp 500ms ease-out forwards', animationDelay: '1s', opacity: 0 }}
                >
                    or sign in with a different account
                </Link>
            </div>

            {/* Footer */}
            <div
                className="absolute bottom-6 flex items-center gap-1.5"
                style={{ animation: 'fadeSlideUp 500ms ease-out forwards', animationDelay: '1.2s', opacity: 0 }}
            >
                <TrainFront className="w-3 h-3 text-zinc-800" />
                <span className="text-[10px] text-zinc-800 font-medium tracking-wider">TRAINTRACKS ALPHA</span>
            </div>

            {/* Keyframe animations */}
            <style jsx>{`
                @keyframes verifiedIn {
                    from {
                        opacity: 0;
                        transform: scale(0.95) translateY(20px);
                    }
                    to {
                        opacity: 1;
                        transform: scale(1) translateY(0);
                    }
                }
                @keyframes fadeSlideUp {
                    from {
                        opacity: 0;
                        transform: translateY(12px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }
                @keyframes iconPop {
                    from {
                        opacity: 0;
                        transform: scale(0.5);
                    }
                    to {
                        opacity: 1;
                        transform: scale(1);
                    }
                }
                @keyframes ringExpand {
                    from {
                        opacity: 0;
                        transform: scale(0.8);
                    }
                    to {
                        opacity: 1;
                        transform: scale(1.15);
                    }
                }
                @keyframes shimmer {
                    from {
                        transform: translateX(-100%);
                    }
                    to {
                        transform: translateX(100%);
                    }
                }
                @keyframes float {
                    from {
                        transform: translateY(0px) scale(1);
                        opacity: 0.3;
                    }
                    to {
                        transform: translateY(-20px) scale(1.5);
                        opacity: 0.1;
                    }
                }
            `}</style>
        </div>
    );
}
