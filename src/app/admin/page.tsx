"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useTripStore } from "@/store/useTripStore";
import { createClient } from "@/lib/supabase/client";
import { prepareOAuthRedirect } from "@/lib/auth/oauth";
import { checkAdminAccess, wasAdminSurfaceReloaded } from "@/lib/auth/adminClient";
import { ShieldX, ShieldCheck, Loader2, ArrowRight, TrainFront, LogIn, RefreshCw, User } from "lucide-react";
import { cn } from "@/lib/utils";

const MAX_RETRIES = 3;

export default function DevAccessPage() {
    const { disableDevMode, enableDevMode, isDevMode } = useTripStore();
    const router = useRouter();
    const [status, setStatus] = useState<'checking' | 'granted' | 'denied' | 'not_logged_in'>('checking');
    const [statusMsg, setStatusMsg] = useState('Checking authorization...');
    const [retries, setRetries] = useState(0);
    const [signingIn, setSigningIn] = useState(false);
    const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);

    const checkAdmin = useCallback(async () => {
        setStatus('checking');
        setStatusMsg('Verifying identity...');

        try {
            const result = await checkAdminAccess();
            setCurrentUserEmail(result.email);

            if (result.status === 'not_logged_in') {
                setStatus('not_logged_in');
                setStatusMsg('Sign in to access the developer console.');
                return;
            }

            if (result.status === 'granted') {
                setStatus('granted');
                setStatusMsg(result.message);
                enableDevMode();
                setTimeout(() => router.push("/"), 800);
                return;
            }

            setStatus('denied');
            setStatusMsg(result.message);
        } catch {
            setStatus('denied');
            setStatusMsg('Authorization could not be verified. Please try again.');
        }
    }, [enableDevMode, router]);
    // Handle Retry Logic
    const handleRetry = () => {
        const next = retries + 1;
        setRetries(next);

        if (next >= MAX_RETRIES) {
            // Failed too many times, go home
            router.push("/");
        } else {
            checkAdmin();
        }
    };

    // Initial Check
    useEffect(() => {
        let mounted = true;
        if (wasAdminSurfaceReloaded()) {
            disableDevMode();
            router.replace("/");
            return;
        }

        if (isDevMode) {
            router.push("/");
            return;
        }

        const init = setTimeout(() => {
            if (mounted) checkAdmin();
        }, 100);

        return () => {
            mounted = false;
            clearTimeout(init);
        };
    }, [checkAdmin, disableDevMode, isDevMode, router]);

    const handleSignIn = async () => {
        setSigningIn(true);
        const supabase = createClient();
        if (status !== 'not_logged_in') {
            await supabase.auth.signOut({ scope: 'local' });
        }
        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: prepareOAuthRedirect('/admin'),
                queryParams: { prompt: 'select_account' },
            },
        });
        if (error) {
            setStatusMsg(error.message);
            setSigningIn(false);
        }
    };

    return (
        <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6 select-none font-sans relative overflow-hidden">
            {/* Background Ambient Glow */}
            <div className={cn(
                "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full blur-[120px] pointer-events-none transition-colors duration-1000",
                status === 'granted' ? "bg-emerald-500/15" :
                    status === 'denied' ? "bg-red-500/10" :
                        status === 'not_logged_in' ? "bg-amber-500/10" :
                            "bg-blue-500/10"
            )} />

            <div className="w-full max-w-sm relative z-10">
                <div className="bg-zinc-900/50 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl">

                    {/* Icon */}
                    <div className="flex justify-center mb-6">
                        <div className={cn(
                            "w-20 h-20 rounded-3xl flex items-center justify-center transition-all duration-500",
                            status === 'granted' ? "bg-emerald-500/10" :
                                status === 'denied' ? "bg-red-500/10" :
                                    status === 'not_logged_in' ? "bg-amber-500/10" :
                                        "bg-white/5"
                        )}>
                            {status === 'checking' ? (
                                <Loader2 className="w-10 h-10 text-blue-400 animate-spin" />
                            ) : status === 'granted' ? (
                                <ShieldCheck className="w-10 h-10 text-emerald-400" style={{ animation: 'adminPulse 600ms ease-out' }} />
                            ) : status === 'not_logged_in' ? (
                                <User className="w-10 h-10 text-amber-400" style={{ animation: 'adminFadeIn 300ms ease-out' }} />
                            ) : (
                                <ShieldX className="w-10 h-10 text-red-400" style={{ animation: 'adminShake 500ms ease-out' }} />
                            )}
                        </div>
                    </div>

                    {/* Text */}
                    <div className="text-center space-y-2 mb-8">
                        <h1 className="text-2xl font-black tracking-tight">
                            {status === 'checking' ? 'Verifying Access...' :
                                status === 'granted' ? 'Access Granted' :
                                    status === 'not_logged_in' ? 'Sign In Required' :
                                        'Access Denied'}
                        </h1>
                        <p className="text-zinc-500 text-sm">
                            {statusMsg}
                        </p>
                        {/* Show current account email */}
                        {(status === 'denied' || status === 'granted') && currentUserEmail && (
                            <p className="text-zinc-600 text-xs mt-1">
                                Account: <span className="text-zinc-400">{currentUserEmail}</span>
                            </p>
                        )}
                    </div>

                    {/* Actions */}
                    {status === 'not_logged_in' && (
                        <div className="space-y-3" style={{ animation: 'adminFadeIn 300ms ease-out' }}>
                            <button
                                onClick={handleSignIn}
                                disabled={signingIn}
                                className="w-full font-bold py-4 rounded-xl bg-white text-black hover:bg-zinc-200 transition-all flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50 shadow-lg shadow-white/10"
                            >
                                {signingIn ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <>
                                        <LogIn className="w-4 h-4" />
                                        Sign In with Google
                                    </>
                                )}
                            </button>
                            <button
                                onClick={() => router.push("/")}
                                className="w-full font-semibold py-3 rounded-xl bg-zinc-800/50 text-zinc-400 hover:bg-zinc-800 transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
                            >
                                Go Home
                            </button>
                        </div>
                    )}

                    {status === 'denied' && (
                        <div className="space-y-3" style={{ animation: 'adminFadeIn 300ms ease-out' }}>
                            {/* Retry */}
                            <button
                                onClick={handleRetry}
                                className="w-full font-bold py-4 rounded-xl bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
                            >
                                {retries >= MAX_RETRIES - 1 ? (
                                    <>Return Home<ArrowRight className="w-4 h-4" /></>
                                ) : (
                                    <><RefreshCw className="w-4 h-4" />Re-check ({MAX_RETRIES - retries - 1} left)</>
                                )}
                            </button>

                            {/* Sign in with different account */}
                            <button
                                onClick={handleSignIn}
                                disabled={signingIn}
                                className="w-full font-semibold py-3 rounded-xl bg-white/5 text-zinc-400 hover:bg-white/10 border border-white/5 transition-all flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50"
                            >
                                {signingIn ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <><LogIn className="w-4 h-4" />Sign in with different account</>
                                )}
                            </button>

                            {retries > 0 && (
                                <p className="text-center text-zinc-600 text-xs">
                                    {retries >= MAX_RETRIES - 1
                                        ? 'Last attempt before redirecting...'
                                        : 'Ensure you are using an admin account.'}
                                </p>
                            )}
                        </div>
                    )}

                    {status === 'granted' && (
                        <div className="text-center" style={{ animation: 'adminFadeIn 400ms ease-out' }}>
                            <div className="flex items-center justify-center gap-2 text-emerald-400 text-sm font-medium">
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Entering DevOps console...
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Footer */}
            <div className="mt-12 flex items-center gap-2 opacity-20">
                <TrainFront className="w-3.5 h-3.5" />
                <span className="text-[9px] font-bold tracking-[0.2em] uppercase">TrainTracks DevOps</span>
            </div>

            {/* CSS Keyframes */}
            <style jsx>{`
                @keyframes adminShake {
                    0% { transform: translateX(0); }
                    20% { transform: translateX(-8px); }
                    40% { transform: translateX(6px); }
                    60% { transform: translateX(-4px); }
                    80% { transform: translateX(2px); }
                    100% { transform: translateX(0); }
                }
                @keyframes adminPulse {
                    0% { transform: scale(0.8); opacity: 0; }
                    50% { transform: scale(1.1); }
                    100% { transform: scale(1); opacity: 1; }
                }
                @keyframes adminFadeIn {
                    from { opacity: 0; transform: translateY(8px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `}</style>
        </div>
    );
}
