'use client';

import { useState, useEffect } from 'react';
import { TrainFront, KeyRound, Sparkles, ArrowRight, Eye, EyeOff, CheckCircle2, Loader2, AlertCircle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';

export default function ResetPasswordPage() {
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [showPw, setShowPw] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const [mounted, setMounted] = useState(false);

    useEffect(() => { setMounted(true); }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (password.length < 6) {
            setError('Password must be at least 6 characters');
            return;
        }
        if (password !== confirm) {
            setError('Passwords do not match');
            return;
        }

        setLoading(true);

        try {
            const supabase = createClient();
            const { data: { user }, error: userError } = await supabase.auth.getUser();
            if (userError || !user) {
                setError('Session expired. Please request a new reset link.');
                return;
            }

            const { error: updateError } = await supabase.auth.updateUser({ password });
            if (updateError) {
                setError(updateError.message || 'Failed to update password.');
                return;
            }

            const { error: profileError } = await supabase
                .from('profile_private')
                .update({ has_password: true, updated_at: new Date().toISOString() })
                .eq('user_id', user.id);
            if (profileError) {
                console.warn('[Auth] Password changed, but profile metadata could not be refreshed:', profileError.message);
            }
            setSuccess(true);
        } catch {
            setError('Something went wrong. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    if (!mounted) return null;

    return (
        <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6 relative overflow-hidden">
            {/* Ambient background glow */}
            <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-blue-500/8 rounded-full blur-[120px] pointer-events-none animate-pulse" />
            <div className="absolute bottom-1/4 left-1/3 w-[300px] h-[300px] bg-indigo-500/5 rounded-full blur-[100px] pointer-events-none" />

            {/* Floating particles */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
                {[...Array(6)].map((_, i) => (
                    <div
                        key={i}
                        className="absolute w-1 h-1 bg-blue-400/30 rounded-full"
                        style={{
                            left: `${15 + i * 15}%`,
                            top: `${20 + (i % 3) * 25}%`,
                            animation: `rpFloat ${3 + i * 0.5}s ease-in-out infinite alternate`,
                            animationDelay: `${i * 0.3}s`,
                        }}
                    />
                ))}
            </div>

            {/* Main content */}
            <div
                className="relative z-10 flex flex-col items-center max-w-sm w-full"
                style={{ animation: 'rpPageIn 800ms cubic-bezier(0.16, 1, 0.3, 1)' }}
            >
                {success ? (
                    /* Success State */
                    <>
                        <div className="relative mb-8">
                            <div
                                className="absolute inset-0 w-28 h-28 rounded-full border border-green-500/20"
                                style={{ animation: 'rpRing 1.5s ease-out forwards', animationDelay: '0.3s', opacity: 0 }}
                            />
                            <div
                                className="w-28 h-28 rounded-full bg-gradient-to-br from-green-500/20 to-emerald-500/10 border border-green-500/30 flex items-center justify-center relative overflow-hidden"
                                style={{ animation: 'rpIconPop 600ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards', animationDelay: '0.2s', opacity: 0, transform: 'scale(0.5)' }}
                            >
                                <div
                                    className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full"
                                    style={{ animation: 'rpShimmer 2s ease-in-out forwards', animationDelay: '1s' }}
                                />
                                <CheckCircle2 className="w-14 h-14 text-green-400 relative z-10" strokeWidth={1.5} />
                            </div>
                        </div>

                        <div className="flex items-center gap-1.5 mb-4" style={{ animation: 'rpFadeUp 500ms ease-out forwards', animationDelay: '0.4s', opacity: 0 }}>
                            <TrainFront className="w-4 h-4 text-white/30" />
                            <span className="text-[11px] font-bold tracking-[0.25em] text-white/30 uppercase">TrainTracks</span>
                        </div>

                        <h1 className="text-3xl font-black tracking-tight text-white text-center mb-3"
                            style={{ animation: 'rpFadeUp 500ms ease-out forwards', animationDelay: '0.5s', opacity: 0 }}>
                            Password Updated!
                        </h1>

                        <p className="text-zinc-500 text-sm text-center mb-10 max-w-xs"
                            style={{ animation: 'rpFadeUp 500ms ease-out forwards', animationDelay: '0.6s', opacity: 0 }}>
                            Your password has been changed successfully.
                        </p>

                        <div className="flex items-center gap-1 mb-6" style={{ animation: 'rpFadeUp 500ms ease-out forwards', animationDelay: '0.7s', opacity: 0 }}>
                            <Sparkles className="w-3 h-3 text-green-400/50" />
                            <div className="w-16 h-px bg-gradient-to-r from-transparent via-green-500/30 to-transparent" />
                            <Sparkles className="w-3 h-3 text-green-400/50" />
                        </div>

                        <Link
                            href="/"
                            className="group w-full flex items-center justify-center gap-2.5 py-4 px-6 rounded-2xl bg-gradient-to-r from-green-500/20 to-emerald-500/15 hover:from-green-500/30 hover:to-emerald-500/25 text-green-300 font-bold text-sm border border-green-500/20 hover:border-green-500/30 transition-all duration-300 active:scale-[0.98] shadow-lg shadow-green-500/5"
                            style={{ animation: 'rpFadeUp 500ms ease-out forwards', animationDelay: '0.8s', opacity: 0 }}
                        >
                            <TrainFront className="w-5 h-5" />
                            Open TrainTracks
                            <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                        </Link>
                    </>
                ) : (
                    /* Form State */
                    <>
                        {/* Icon */}
                        <div className="relative mb-8">
                            <div
                                className="w-24 h-24 rounded-full bg-gradient-to-br from-blue-500/15 to-indigo-500/10 border border-blue-500/20 flex items-center justify-center"
                                style={{ animation: 'rpIconPop 600ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards', animationDelay: '0.1s', opacity: 0, transform: 'scale(0.5)' }}
                            >
                                <KeyRound className="w-10 h-10 text-blue-400" strokeWidth={1.5} />
                            </div>
                        </div>

                        {/* Branding */}
                        <div className="flex items-center gap-1.5 mb-4" style={{ animation: 'rpFadeUp 500ms ease-out forwards', animationDelay: '0.2s', opacity: 0 }}>
                            <TrainFront className="w-4 h-4 text-white/30" />
                            <span className="text-[11px] font-bold tracking-[0.25em] text-white/30 uppercase">TrainTracks</span>
                        </div>

                        {/* Title */}
                        <h1 className="text-2xl font-black tracking-tight text-white text-center mb-2"
                            style={{ animation: 'rpFadeUp 500ms ease-out forwards', animationDelay: '0.3s', opacity: 0 }}>
                            Reset Your Password
                        </h1>
                        <p className="text-zinc-500 text-sm text-center mb-8 max-w-xs"
                            style={{ animation: 'rpFadeUp 500ms ease-out forwards', animationDelay: '0.4s', opacity: 0 }}>
                            Enter your new password below.
                        </p>

                        {/* Form */}
                        <form onSubmit={handleSubmit} className="w-full space-y-3"
                            style={{ animation: 'rpFadeUp 500ms ease-out forwards', animationDelay: '0.5s', opacity: 0 }}>

                            {/* Password */}
                            <div className="relative">
                                <input
                                    type={showPw ? 'text' : 'password'}
                                    placeholder="New password (min 6 characters)"
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    className="w-full px-4 py-3.5 pr-12 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white text-sm font-medium placeholder:text-white/20 focus:outline-none focus:border-blue-500/40 focus:bg-white/[0.06] transition-all"
                                />
                                <button type="button" onClick={() => setShowPw(!showPw)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-white/20 hover:text-white/40 transition-colors">
                                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>

                            {/* Confirm */}
                            <div className="relative">
                                <input
                                    type={showConfirm ? 'text' : 'password'}
                                    placeholder="Confirm new password"
                                    value={confirm}
                                    onChange={e => setConfirm(e.target.value)}
                                    className="w-full px-4 py-3.5 pr-12 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white text-sm font-medium placeholder:text-white/20 focus:outline-none focus:border-blue-500/40 focus:bg-white/[0.06] transition-all"
                                />
                                <button type="button" onClick={() => setShowConfirm(!showConfirm)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-white/20 hover:text-white/40 transition-colors">
                                    {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>

                            {/* Error */}
                            {error && (
                                <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-red-500/10 border border-red-500/15">
                                    <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                                    <span className="text-xs text-red-300 font-medium">{error}</span>
                                </div>
                            )}

                            {/* Submit */}
                            <button
                                type="submit"
                                disabled={loading || !password || !confirm}
                                className="w-full flex items-center justify-center gap-2.5 py-4 px-6 rounded-2xl bg-gradient-to-r from-blue-500/20 to-indigo-500/15 hover:from-blue-500/30 hover:to-indigo-500/25 text-blue-300 font-bold text-sm border border-blue-500/20 hover:border-blue-500/30 transition-all duration-300 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-blue-500/5"
                            >
                                {loading ? (
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                ) : (
                                    <>
                                        <KeyRound className="w-5 h-5" />
                                        Set New Password
                                        <ArrowRight className="w-4 h-4" />
                                    </>
                                )}
                            </button>
                        </form>

                        {/* Back link */}
                        <Link
                            href="/"
                            className="mt-6 text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
                            style={{ animation: 'rpFadeUp 500ms ease-out forwards', animationDelay: '0.6s', opacity: 0 }}
                        >
                            Back to TrainTracks
                        </Link>
                    </>
                )}
            </div>

            {/* Footer */}
            <div className="absolute bottom-6 flex items-center gap-1.5"
                style={{ animation: 'rpFadeUp 500ms ease-out forwards', animationDelay: '1s', opacity: 0 }}>
                <TrainFront className="w-3 h-3 text-zinc-800" />
                <span className="text-[10px] text-zinc-800 font-medium tracking-wider">TRAINTRACKS ALPHA</span>
            </div>

            <style jsx>{`
                @keyframes rpPageIn {
                    from { opacity: 0; transform: scale(0.95) translateY(20px); }
                    to { opacity: 1; transform: scale(1) translateY(0); }
                }
                @keyframes rpFadeUp {
                    from { opacity: 0; transform: translateY(12px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                @keyframes rpIconPop {
                    from { opacity: 0; transform: scale(0.5); }
                    to { opacity: 1; transform: scale(1); }
                }
                @keyframes rpRing {
                    from { opacity: 0; transform: scale(0.8); }
                    to { opacity: 1; transform: scale(1.15); }
                }
                @keyframes rpShimmer {
                    from { transform: translateX(-100%); }
                    to { transform: translateX(100%); }
                }
                @keyframes rpFloat {
                    from { transform: translateY(0px) scale(1); opacity: 0.3; }
                    to { transform: translateY(-20px) scale(1.5); opacity: 0.1; }
                }
            `}</style>
        </div>
    );
}
