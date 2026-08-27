'use client';

import { useState } from 'react';
import { LogOut, X, TrainFront, CheckCircle2 } from 'lucide-react';

interface LogoutModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => Promise<void>;
}

export default function LogoutModal({ isOpen, onClose, onConfirm }: LogoutModalProps) {
    const [phase, setPhase] = useState<'confirm' | 'loading' | 'success'>('confirm');
    const [fadeOut, setFadeOut] = useState(false);

    if (!isOpen) return null;

    const handleConfirm = async () => {
        setPhase('loading');
        // Small delay to show loading state
        await new Promise(r => setTimeout(r, 600));
        setPhase('success');
        // Wait for success animation, then trigger the actual logout (which reloads)
        setTimeout(async () => {
            await onConfirm();
        }, 1500);
    };

    const handleCancel = () => {
        setFadeOut(true);
        setTimeout(() => {
            setFadeOut(false);
            setPhase('confirm');
            onClose();
        }, 300);
    };

    // --- SUCCESS STATE ---
    if (phase === 'success') {
        return (
            <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
                <div
                    className="absolute inset-0 bg-black/80 backdrop-blur-md"
                    style={{ animation: 'lmFadeIn 200ms ease-out' }}
                />
                <div
                    className="relative w-full max-w-sm"
                    style={{ animation: 'lmModalIn 500ms cubic-bezier(0.16, 1, 0.3, 1)' }}
                >
                    {/* Glow */}
                    <div className="absolute -inset-6 bg-gradient-to-b from-emerald-500/15 via-green-500/5 to-transparent rounded-[2.5rem] blur-2xl pointer-events-none" />

                    <div className="relative bg-zinc-900/95 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl text-center">
                        {/* Success Icon */}
                        <div className="relative mx-auto mb-5 w-20 h-20">
                            {/* Rings */}
                            <div
                                className="absolute inset-0 rounded-full border border-green-500/20"
                                style={{ animation: 'lmRingPulse 1.5s ease-out forwards', animationDelay: '0.2s', opacity: 0 }}
                            />
                            <div
                                className="absolute -inset-3 rounded-full border border-green-500/10"
                                style={{ animation: 'lmRingPulse 1.5s ease-out forwards', animationDelay: '0.4s', opacity: 0 }}
                            />
                            <div
                                className="w-20 h-20 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center"
                                style={{ animation: 'lmIconPop 500ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards', animationDelay: '0.1s', opacity: 0, transform: 'scale(0.5)' }}
                            >
                                <CheckCircle2 className="w-10 h-10 text-green-400" strokeWidth={1.5} />
                            </div>
                        </div>

                        <h2
                            className="text-xl font-black text-white mb-1"
                            style={{ animation: 'lmFadeSlide 400ms ease-out forwards', animationDelay: '0.3s', opacity: 0 }}
                        >
                            Logged Out
                        </h2>
                        <p
                            className="text-sm text-zinc-500"
                            style={{ animation: 'lmFadeSlide 400ms ease-out forwards', animationDelay: '0.4s', opacity: 0 }}
                        >
                            See you next ride!
                        </p>

                        {/* Branding */}
                        <div
                            className="flex items-center justify-center gap-1.5 mt-6"
                            style={{ animation: 'lmFadeSlide 400ms ease-out forwards', animationDelay: '0.6s', opacity: 0 }}
                        >
                            <TrainFront className="w-3 h-3 text-zinc-700" />
                            <span className="text-[9px] font-bold tracking-[0.2em] text-zinc-700 uppercase">TrainTracks</span>
                        </div>
                    </div>
                </div>

                <style jsx>{`
                    @keyframes lmFadeIn {
                        from { opacity: 0; }
                        to { opacity: 1; }
                    }
                    @keyframes lmModalIn {
                        from { opacity: 0; transform: scale(0.92) translateY(12px); }
                        to { opacity: 1; transform: scale(1) translateY(0); }
                    }
                    @keyframes lmIconPop {
                        from { opacity: 0; transform: scale(0.5); }
                        to { opacity: 1; transform: scale(1); }
                    }
                    @keyframes lmRingPulse {
                        from { opacity: 0; transform: scale(0.8); }
                        to { opacity: 1; transform: scale(1.2); }
                    }
                    @keyframes lmFadeSlide {
                        from { opacity: 0; transform: translateY(8px); }
                        to { opacity: 1; transform: translateY(0); }
                    }
                `}</style>
            </div>
        );
    }

    // --- LOADING STATE ---
    if (phase === 'loading') {
        return (
            <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
                <div className="absolute inset-0 bg-black/80 backdrop-blur-md" />
                <div className="relative bg-zinc-900/95 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl text-center w-full max-w-sm">
                    <div className="w-12 h-12 mx-auto mb-4 rounded-full border-2 border-white/10 border-t-white/60 animate-spin" />
                    <p className="text-sm text-zinc-400 font-medium">Signing out...</p>
                </div>
            </div>
        );
    }

    // --- CONFIRM STATE ---
    return (
        <div className={`fixed inset-0 z-[300] flex items-center justify-center p-4 transition-opacity duration-300 ${fadeOut ? 'opacity-0' : 'opacity-100'}`}>
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/70 backdrop-blur-sm"
                onClick={handleCancel}
                style={{ animation: 'lmFadeIn 250ms ease-out' }}
            />

            {/* Modal */}
            <div
                className="relative w-full max-w-sm"
                style={{ animation: 'lmModalIn 400ms cubic-bezier(0.16, 1, 0.3, 1)' }}
            >
                {/* Glow */}
                <div className="absolute -inset-4 bg-gradient-to-b from-red-500/10 via-orange-500/5 to-transparent rounded-[2rem] blur-xl pointer-events-none" />

                <div className="relative bg-zinc-900/95 backdrop-blur-xl border border-white/10 rounded-3xl p-6 shadow-2xl overflow-hidden">
                    {/* Close button */}
                    <button
                        onClick={handleCancel}
                        className="absolute top-4 right-4 p-1.5 rounded-full bg-white/5 hover:bg-white/10 transition-colors"
                    >
                        <X className="w-4 h-4 text-white/50" />
                    </button>

                    {/* Icon */}
                    <div className="flex items-center gap-3 mb-5">
                        <div className="w-11 h-11 rounded-xl bg-red-500/10 flex items-center justify-center border border-red-500/20">
                            <LogOut className="w-5 h-5 text-red-400" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-white">Log Out</h2>
                            <p className="text-xs text-zinc-500">End your session</p>
                        </div>
                    </div>

                    {/* Message */}
                    <div className="bg-white/5 border border-white/5 rounded-2xl p-4 mb-6">
                        <p className="text-sm text-zinc-300 text-center">
                            Are you sure you want to log out?
                        </p>
                        <p className="text-xs text-zinc-600 text-center mt-1.5">
                            You&apos;ll need to sign in again to access your account.
                        </p>
                    </div>

                    {/* Buttons */}
                    <div className="flex gap-3">
                        <button
                            onClick={handleCancel}
                            className="flex-1 py-3.5 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/5 text-white/70 font-bold text-sm transition-all duration-200 active:scale-[0.97]"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleConfirm}
                            className="flex-1 py-3.5 rounded-2xl bg-red-500/15 hover:bg-red-500/25 border border-red-500/20 text-red-400 font-bold text-sm transition-all duration-200 active:scale-[0.97] flex items-center justify-center gap-2"
                        >
                            <LogOut className="w-4 h-4" />
                            Log Out
                        </button>
                    </div>

                    {/* Branding */}
                    <div className="flex items-center justify-center gap-1.5 mt-5 opacity-20">
                        <TrainFront className="w-3 h-3" />
                        <span className="text-[9px] font-bold tracking-[0.2em] text-white uppercase">TrainTracks</span>
                    </div>
                </div>
            </div>

            <style jsx>{`
                @keyframes lmFadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                @keyframes lmModalIn {
                    from { opacity: 0; transform: scale(0.95) translateY(10px); }
                    to { opacity: 1; transform: scale(1) translateY(0); }
                }
            `}</style>
        </div>
    );
}
