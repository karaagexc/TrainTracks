"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { prepareOAuthRedirect } from "@/lib/auth/oauth";
import { checkAdminAccess, wasAdminSurfaceReloaded } from "@/lib/auth/adminClient";
import { ShieldX, Loader2, ArrowRight, Terminal, LogIn, RefreshCw, User } from "lucide-react";
import { cn } from "@/lib/utils";
import dynamic from "next/dynamic";

const ApiConsole = dynamic(() => import("@/components/ApiConsole").then((m) => m.ApiConsole), { ssr: false });

const MAX_RETRIES = 3;

export default function ApiConsolePage() {
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
                setStatusMsg('Sign in to access the API console.');
                return;
            }

            if (result.status === 'granted') {
                setStatus('granted');
                setStatusMsg(result.message);
                return;
            }

            setStatus('denied');
            setStatusMsg(result.message);
        } catch {
            setStatus('denied');
            setStatusMsg('Authorization could not be verified. Please try again.');
        }
    }, []);
    const handleRetry = () => {
        const next = retries + 1;
        setRetries(next);
        if (next >= MAX_RETRIES) {
            window.location.href = '/';
        } else {
            checkAdmin();
        }
    };

    useEffect(() => {
        let mounted = true;
        if (wasAdminSurfaceReloaded()) {
            window.location.replace('/');
            return;
        }
        const init = setTimeout(() => {
            if (mounted) checkAdmin();
        }, 100);
        return () => {
            mounted = false;
            clearTimeout(init);
        };
    }, [checkAdmin]);

    const handleSignIn = async () => {
        setSigningIn(true);
        const supabase = createClient();
        if (status !== 'not_logged_in') {
            await supabase.auth.signOut({ scope: 'local' });
        }
        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: prepareOAuthRedirect('/api-console'),
                queryParams: { prompt: 'select_account' },
            },
        });
        if (error) {
            setStatusMsg(error.message);
            setSigningIn(false);
        }
    };

    // If granted, show the full console
    if (status === 'granted') {
        return <ApiConsole userEmail={currentUserEmail} />;
    }

    return (
        <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6 select-none font-sans relative overflow-hidden">
            {/* Background Ambient Glow */}
            <div className={cn(
                "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full blur-[120px] pointer-events-none transition-colors duration-1000",

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

                                status === 'denied' ? "bg-red-500/10" :
                                    status === 'not_logged_in' ? "bg-amber-500/10" :
                                        "bg-white/5"
                        )}>
                            {status === 'checking' ? (
                                <Loader2 className="w-10 h-10 text-blue-400 animate-spin" />
                            ) : status === 'not_logged_in' ? (
                                <User className="w-10 h-10 text-amber-400" style={{ animation: 'apiFadeIn 300ms ease-out' }} />
                            ) : (
                                <ShieldX className="w-10 h-10 text-red-400" style={{ animation: 'apiShake 500ms ease-out' }} />
                            )}
                        </div>
                    </div>

                    {/* Text */}
                    <div className="text-center space-y-2 mb-8">
                        <h1 className="text-2xl font-black tracking-tight">
                            {status === 'checking' ? 'Verifying Access...' :

                                    status === 'not_logged_in' ? 'Sign In Required' :
                                        'Access Denied'}
                        </h1>
                        <p className="text-zinc-500 text-sm">
                            {statusMsg}
                        </p>
                        {status === 'denied' && currentUserEmail && (
                            <p className="text-zinc-600 text-xs mt-1">
                                Account: <span className="text-zinc-400">{currentUserEmail}</span>
                            </p>
                        )}
                    </div>

                    {/* Actions */}
                    {status === 'not_logged_in' && (
                        <div className="space-y-3" style={{ animation: 'apiFadeIn 300ms ease-out' }}>
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
                                onClick={() => window.location.href = '/'}
                                className="w-full font-semibold py-3 rounded-xl bg-zinc-800/50 text-zinc-400 hover:bg-zinc-800 transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
                            >
                                Go Home
                            </button>
                        </div>
                    )}

                    {status === 'denied' && (
                        <div className="space-y-3" style={{ animation: 'apiFadeIn 300ms ease-out' }}>
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
                        </div>
                    )}


                </div>
            </div>

            {/* Footer */}
            <div className="mt-12 flex items-center gap-2 opacity-20">
                <Terminal className="w-3.5 h-3.5" />
                <span className="text-[9px] font-bold tracking-[0.2em] uppercase">TrainTracks API Console</span>
            </div>

            <style jsx>{`
                @keyframes apiShake {
                    0% { transform: translateX(0); }
                    20% { transform: translateX(-8px); }
                    40% { transform: translateX(6px); }
                    60% { transform: translateX(-4px); }
                    80% { transform: translateX(2px); }
                    100% { transform: translateX(0); }
                }
                @keyframes apiPulse {
                    0% { transform: scale(0.8); opacity: 0; }
                    50% { transform: scale(1.1); }
                    100% { transform: scale(1); opacity: 1; }
                }
                @keyframes apiFadeIn {
                    from { opacity: 0; transform: translateY(8px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `}</style>
        </div>
    );
}
