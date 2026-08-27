"use client";

import { useState, useEffect } from "react";
import { TrainFront, ArrowRight, ShieldCheck, Zap, Navigation, MapPin, Footprints, Info } from "lucide-react";
import { cn } from "@/lib/utils";

export function WelcomeScreen() {
    const [open, setOpen] = useState(false);
    const [isClosing, setIsClosing] = useState(false);
    const [step, setStep] = useState<'WELCOME' | 'DETAILS'>('WELCOME');

    useEffect(() => {
        // Check local storage for first-time flag
        const hasSeenWelcome = localStorage.getItem("traintracks_welcome_seen");
        if (!hasSeenWelcome) {
            // Small delay for smooth entrance after hydration
            setTimeout(() => setOpen(true), 500);
        }
    }, []);

    const handleDismiss = () => {
        // Trigger Exit Animation
        setIsClosing(true);
        // Wait for animation to finish before unmounting
        setTimeout(() => {
            setOpen(false);
            localStorage.setItem("traintracks_welcome_seen", "true");
        }, 300);
    };

    if (!open) return null;

    return (
        <div className={`fixed inset-0 z-[100] flex items-center justify-center px-6 py-4 bg-black/90 backdrop-blur-md transition-all duration-300 ${isClosing ? 'animate-out fade-out fill-mode-forwards' : 'animate-in fade-in fill-mode-forwards'}`}>
            <div className={`w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden shadow-2xl relative transition-all duration-300 ${isClosing ? 'animate-out zoom-out-95 fade-out fill-mode-forwards' : 'animate-in zoom-in-95 fade-in fill-mode-forwards'}`}>

                {/* Decorative Background Elements */}
                <div className="absolute top-0 inset-x-0 h-32 bg-gradient-to-b from-blue-900/20 to-transparent pointer-events-none" />
                <div className="absolute -top-20 -left-20 w-60 h-60 bg-blue-500/10 rounded-full blur-[80px] pointer-events-none" />

                <div className="p-6 relative z-10">

                    {/* BRAND HEADER */}
                    <div className="flex flex-col items-center text-center space-y-6 pt-4 pb-6">
                        {/* Logo Container */}
                        <div className="relative">
                            <div className="absolute inset-0 bg-blue-500/20 blur-xl rounded-full animate-pulse-slow" />
                            <div className="w-20 h-20 bg-zinc-800/80 backdrop-blur-xl border border-white/10 rounded-2xl flex items-center justify-center shadow-2xl relative rotate-3 transform transition-transform hover:rotate-0 duration-500">
                                <TrainFront className="w-10 h-10 text-white fill-blue-500/20" />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <h1 className="text-2xl font-black tracking-tight text-white/90">
                                Welcome to <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400">TrainTracks</span>
                            </h1>
                            <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest">
                                The Smartest Way to Commute
                            </p>
                        </div>
                    </div>

                    {/* CONTENT SWAPPER */}
                    <div className="min-h-[220px]">
                        {step === 'WELCOME' ? (
                            <div className="space-y-4 animate-in slide-in-from-right-8 fade-in duration-300">
                                <p className="text-zinc-400 text-sm leading-relaxed text-center">
                                    Your personal companion for the Metro Manila rail network.
                                    Real-time tracking, smart alerts, and seamless navigation—all in your pocket.
                                </p>

                                <div className="grid grid-cols-2 gap-3 mt-4">
                                    <FeatureCard icon={<Navigation className="w-4 h-4 text-blue-400" />} title="Live GPS" desc="Real-time train tracking" />
                                    <FeatureCard icon={<ShieldCheck className="w-4 h-4 text-emerald-400" />} title="Smart Alerts" desc="Wrong direction & stall detection" />
                                    <FeatureCard icon={<Zap className="w-4 h-4 text-amber-400" />} title="Offline Ready" desc="Works even with spotty signal" />
                                    <FeatureCard icon={<Footprints className="w-4 h-4 text-purple-400" />} title="Transfer helper" desc="Navigates you between lines" />
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-4 animate-in slide-in-from-right-8 fade-in duration-300">
                                <div className="bg-zinc-800/50 rounded-xl p-4 border border-zinc-700/50 space-y-3">
                                    <div className="flex items-center gap-2 text-xs font-bold uppercase text-zinc-500 tracking-wider">
                                        <Info className="w-3 h-3" /> Technical Brief
                                    </div>
                                    <ul className="space-y-2 text-xs text-zinc-400">
                                        <li className="flex gap-2">
                                            <span className="text-blue-500">•</span>
                                            <span>Uses <strong className="text-zinc-300">Geofencing & Dead Reckoning</strong> for distinct state detection (Station vs. Transit).</span>
                                        </li>
                                        <li className="flex gap-2">
                                            <span className="text-emerald-500">•</span>
                                            <span><strong className="text-zinc-300">Hybrid Positioning</strong> fuses GPS with accelerometer data for tunnel navigation.</span>
                                        </li>
                                        <li className="flex gap-2">
                                            <span className="text-amber-500">•</span>
                                            <span><strong className="text-zinc-300">Background Service Worker</strong> ensures you never miss a stop even when locked.</span>
                                        </li>
                                    </ul>
                                </div>
                                <p className="text-[10px] text-center text-zinc-600 italic px-4">
                                    Built with ❤️ for commuters, railfans, and devs.
                                </p>
                            </div>
                        )}
                    </div>

                    {/* ACTIONS */}
                    <div className="mt-8 space-y-3">
                        {step === 'WELCOME' ? (
                            <button
                                onClick={() => setStep('DETAILS')}
                                className="w-full bg-zinc-800 hover:bg-zinc-700 text-white font-bold py-3.5 rounded-xl transition-all active:scale-[0.98] flex items-center justify-center gap-2 border border-zinc-700"
                            >
                                <span>Tell me more</span>
                                <ArrowRight className="w-4 h-4 opacity-50" />
                            </button>
                        ) : (
                            <button
                                onClick={handleDismiss}
                                className="w-full bg-white hover:bg-zinc-200 text-black font-bold py-3.5 rounded-xl transition-all active:scale-[0.98] flex items-center justify-center gap-2 shadow-lg shadow-white/10"
                            >
                                <span>Let&#39;s Go!</span>
                                <ArrowRight className="w-4 h-4" />
                            </button>
                        )}

                        {step === 'WELCOME' && (
                            <button
                                onClick={handleDismiss}
                                className="w-full text-zinc-500 hover:text-white text-xs font-bold py-2 transition-colors uppercase tracking-widest"
                            >
                                Skip Intro
                            </button>
                        )}
                        {step === 'DETAILS' && (
                            <button
                                onClick={() => setStep('WELCOME')}
                                className="w-full text-zinc-500 hover:text-white text-xs font-bold py-2 transition-colors uppercase tracking-widest"
                            >
                                Back
                            </button>
                        )}
                    </div>

                </div>
            </div>
        </div>
    );
}

function FeatureCard({ icon, title, desc }: { icon: any, title: string, desc: string }) {
    return (
        <div className="bg-zinc-800/30 border border-zinc-700/30 p-2.5 rounded-xl flex flex-col gap-1">
            <div className="flex items-center gap-2 mb-0.5">
                {icon}
                <span className="text-xs font-bold text-zinc-200">{title}</span>
            </div>
            <span className="text-[10px] text-zinc-500 leading-tight">{desc}</span>
        </div>
    );
}
