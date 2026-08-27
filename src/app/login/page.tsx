'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { prepareOAuthRedirect } from '@/lib/auth/oauth';
import { sanitizeAuthReturnTo } from '@/domain/auth/redirect';
import { Mail, Lock, Eye, EyeOff, ArrowRight, Loader2, AlertCircle, User } from 'lucide-react';

export default function LoginPage() {
    const supabase = createClient();
    const [mode, setMode] = useState<'signin' | 'signup'>('signin');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [googleLoading, setGoogleLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [forgotMode, setForgotMode] = useState(false);
    const getReturnTo = () => sanitizeAuthReturnTo(
        new URLSearchParams(window.location.search).get('next'),
    );

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const callbackError = params.get('error');
        if (callbackError === 'auth_callback_failed') {
            const reason = params.get('reason');
            setError(reason === 'pkce_verifier_missing'
                ? 'Sign-in returned without its secure login cookie. Start again from traintracks.vercel.app.'
                : 'Sign-in could not be completed. Please try again.');
        }
    }, []);
    const handleEmailAuth = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        setSuccess(null);
        const normalizedEmail = email.trim().toLowerCase();

        if (forgotMode) {
            // Send password reset email
            const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
                redirectTo: prepareOAuthRedirect('/auth/reset-password'),
            });
            if (error) {
                setError(error.message);
            } else {
                setSuccess('Password reset link sent! Check your email.');
            }
            setLoading(false);
            return;
        }

        if (mode === 'signup') {
            const { error } = await supabase.auth.signUp({
                email: normalizedEmail,
                password,
                options: {
                    emailRedirectTo: prepareOAuthRedirect(getReturnTo()),
                },
            });

            if (error) {
                setError(error.message);
            } else {
                setSuccess('Check your email for a confirmation link!');
            }
        } else {
            const { error } = await supabase.auth.signInWithPassword({
                email: normalizedEmail,
                password,
            });

            if (error) {
                setError(error.message);
            } else {
                window.location.href = getReturnTo();
            }
        }

        setLoading(false);
    };

    const handleGoogleLogin = async () => {
        setGoogleLoading(true);
        setError(null);

        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: prepareOAuthRedirect(getReturnTo()),
            },
        });

        if (error) {
            setError(error.message);
            setGoogleLoading(false);
        }
    };

    return (
        <div className="min-h-[100dvh] bg-black text-white flex flex-col items-center justify-center p-6 overflow-hidden">
            {/* Background Glow Effect */}
            <div className="fixed inset-0 pointer-events-none">
                <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-green-500/5 rounded-full blur-[120px]" />
                <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-blue-500/5 rounded-full blur-[120px]" />
            </div>

            <div className="relative w-full max-w-sm space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
                {/* Logo / Header */}
                <div className="text-center space-y-3">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-zinc-900 border border-zinc-800 mb-2">
                        <span className="text-3xl">🚆</span>
                    </div>
                    <h1 className="text-3xl font-black tracking-tight">
                        Metro Manila Rail
                    </h1>
                    <p className="text-zinc-500 text-sm">
                        {forgotMode ? 'Enter your email to reset your password.' : mode === 'signin' ? 'Welcome back, commuter.' : 'Join the commuter network.'}
                    </p>
                </div>

                {/* Google Auth Button */}
                {!forgotMode && (
                    <button
                        onClick={handleGoogleLogin}
                        disabled={googleLoading}
                        className="w-full flex items-center justify-center gap-3 py-3.5 px-4 rounded-xl bg-white text-black font-semibold text-sm hover:bg-zinc-200 transition-all duration-200 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-white/5"
                    >
                        {googleLoading ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                            <svg className="w-5 h-5" viewBox="0 0 24 24">
                                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                            </svg>
                        )}
                        Continue with Google
                    </button>
                )}

                {/* Divider */}
                {!forgotMode && (
                    <div className="flex items-center gap-4">
                        <div className="flex-1 h-px bg-zinc-800" />
                        <span className="text-zinc-600 text-xs font-medium uppercase tracking-wider">or</span>
                        <div className="flex-1 h-px bg-zinc-800" />
                    </div>
                )}

                {/* Email Form */}
                <form onSubmit={handleEmailAuth} className="space-y-4">
                    <div className="space-y-3">
                        {/* Email Input */}
                        <div className="relative">
                            <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="Email address"
                                required
                                className="w-full pl-11 pr-4 py-3.5 rounded-xl bg-zinc-900 border border-zinc-800 text-white placeholder:text-zinc-600 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-600 focus:border-transparent transition-all"
                            />
                        </div>

                        {/* Password Input (hidden in forgot mode) */}
                        {!forgotMode && (
                            <div className="relative">
                                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder={mode === 'signup' ? 'Create a password' : 'Password'}
                                    required
                                    minLength={6}
                                    className="w-full pl-11 pr-12 py-3.5 rounded-xl bg-zinc-900 border border-zinc-800 text-white placeholder:text-zinc-600 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-600 focus:border-transparent transition-all"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
                                >
                                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Forgot Password Link (only in signin mode, not in forgot mode) */}
                    {mode === 'signin' && !forgotMode && (
                        <div className="text-right">
                            <button
                                type="button"
                                onClick={() => {
                                    setForgotMode(true);
                                    setError(null);
                                    setSuccess(null);
        const normalizedEmail = email.trim().toLowerCase();
                                }}
                                className="text-zinc-500 text-xs hover:text-white transition-colors"
                            >
                                Forgot password?
                            </button>
                        </div>
                    )}

                    {/* Error / Success Messages */}
                    {error && (
                        <div className="flex items-start gap-2.5 text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm animate-in fade-in slide-in-from-top-2">
                            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}

                    {success && (
                        <div className="flex items-start gap-2.5 text-green-400 bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-3 text-sm animate-in fade-in slide-in-from-top-2">
                            <Mail className="w-4 h-4 mt-0.5 flex-shrink-0" />
                            <span>{success}</span>
                        </div>
                    )}

                    {/* Submit Button */}
                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl bg-zinc-800 text-white font-semibold text-sm hover:bg-zinc-700 transition-all duration-200 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed border border-zinc-700"
                    >
                        {loading ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <>
                                {forgotMode ? 'Send Reset Link' : mode === 'signin' ? 'Sign In' : 'Create Account'}
                                <ArrowRight className="w-4 h-4" />
                            </>
                        )}
                    </button>
                </form>

                {/* Toggle Mode / Back from forgot */}
                <div className="text-center">
                    {forgotMode ? (
                        <button
                            type="button"
                            onClick={() => {
                                setForgotMode(false);
                                setError(null);
                                setSuccess(null);
        const normalizedEmail = email.trim().toLowerCase();
                            }}
                            className="text-zinc-500 text-sm hover:text-white transition-colors"
                        >
                            <span className="text-white font-semibold">← Back to Sign In</span>
                        </button>
                    ) : (
                        <button
                            type="button"
                            onClick={() => {
                                setMode(mode === 'signin' ? 'signup' : 'signin');
                                setError(null);
                                setSuccess(null);
        const normalizedEmail = email.trim().toLowerCase();
                            }}
                            className="text-zinc-500 text-sm hover:text-white transition-colors"
                        >
                            {mode === 'signin' ? (
                                <>Don&apos;t have an account? <span className="text-white font-semibold">Sign up</span></>
                            ) : (
                                <>Already have an account? <span className="text-white font-semibold">Sign in</span></>
                            )}
                        </button>
                    )}
                </div>

                {/* Footer */}
                <p className="text-center text-zinc-700 text-xs">
                    By continuing, you agree to our Terms of Service.
                </p>
            </div>
        </div>
    );
}
