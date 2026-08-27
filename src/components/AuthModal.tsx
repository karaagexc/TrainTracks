'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { prepareOAuthRedirect } from '@/lib/auth/oauth';
import { X, Mail, Lock, Eye, EyeOff, ArrowRight, ArrowLeft, Loader2, AlertCircle, TrainFront, UserPlus, LogIn, KeyRound } from 'lucide-react';
import LoginSuccessModal from './LoginSuccessModal';

interface AuthModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function AuthModal({ isOpen, onClose }: AuthModalProps) {
    const supabase = createClient();
    const [mode, setMode] = useState<'signin' | 'signup'>('signin');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [googleLoading, setGoogleLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [animating, setAnimating] = useState(false);
    const [animDirection, setAnimDirection] = useState<'left' | 'right'>('left');
    const [showForgot, setShowForgot] = useState(false);
    const [forgotLoading, setForgotLoading] = useState(false);
    const formRef = useRef<HTMLDivElement>(null);
    const [showLoginSuccess, setShowLoginSuccess] = useState(false);

    const handleLoginComplete = useCallback(() => {
        setShowLoginSuccess(false);
        onClose();
    }, [onClose]);

    // Reset state when modal closes
    useEffect(() => {
        if (!isOpen) {
            setMode('signin');
            setEmail('');
            setPassword('');
            setError(null);
            setSuccess(null);
            setAnimating(false);
            setShowForgot(false);
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const switchMode = (newMode: 'signin' | 'signup') => {
        if (animating || mode === newMode) return;
        setAnimDirection(newMode === 'signup' ? 'left' : 'right');
        setAnimating(true);
        setError(null);
        setSuccess(null);

        // Phase 1: slide out
        setTimeout(() => {
            setMode(newMode);
            setEmail('');
            setPassword('');
            // Phase 2: slide in (after state update)
            setTimeout(() => {
                setAnimating(false);
            }, 50);
        }, 200);
    };

    const handleEmailAuth = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        setSuccess(null);
        const normalizedEmail = email.trim().toLowerCase();

        if (mode === 'signup') {
            const { error } = await supabase.auth.signUp({
                email: normalizedEmail,
                password,
                options: {
                    emailRedirectTo: prepareOAuthRedirect('/'),
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
                setShowLoginSuccess(true);
            }
        }

        setLoading(false);
    };

    const handleForgotPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setForgotLoading(true);
        setError(null);
        setSuccess(null);

        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: prepareOAuthRedirect('/auth/reset-password'),
        });

        if (error) {
            setError(error.message);
        } else {
            setSuccess('Password reset link sent! Check your email.');
        }

        setForgotLoading(false);
    };

    const handleGoogleLogin = async () => {
        setGoogleLoading(true);
        setError(null);

        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: prepareOAuthRedirect('/'),
            },
        });

        if (error) {
            setError(error.message);
            setGoogleLoading(false);
        }
    };

    // Animation classes for form content
    const getFormAnimClass = () => {
        if (animating) {
            return animDirection === 'left'
                ? 'opacity-0 -translate-x-4 scale-95'
                : 'opacity-0 translate-x-4 scale-95';
        }
        return 'opacity-100 translate-x-0 scale-100';
    };

    return (
        <>
            <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
                {/* Backdrop */}
                <div
                    className="absolute inset-0 bg-black/70 backdrop-blur-sm"
                    onClick={onClose}
                    style={{ animation: 'fadeIn 300ms ease-out' }}
                />

                {/* Modal */}
                <div
                    className="relative w-full max-w-sm"
                    style={{ animation: 'modalIn 500ms cubic-bezier(0.16, 1, 0.3, 1)' }}
                >
                    {/* Glow effect behind modal */}
                    <div className="absolute -inset-4 bg-gradient-to-b from-green-500/10 via-blue-500/5 to-purple-500/10 rounded-[2rem] blur-2xl pointer-events-none" />

                    <div className="relative bg-zinc-900/70 backdrop-blur-2xl border border-white/10 rounded-3xl p-6 shadow-2xl overflow-hidden">
                        {/* Inner glow accents */}
                        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-[1px] bg-gradient-to-r from-transparent via-white/30 to-transparent" />
                        <div className="absolute top-0 right-0 w-24 h-24 bg-green-500/5 rounded-full blur-3xl pointer-events-none" />
                        <div className="absolute bottom-0 left-0 w-24 h-24 bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />

                        {/* Close Button */}
                        <button
                            onClick={onClose}
                            className="absolute top-4 right-4 p-1.5 rounded-full bg-white/5 hover:bg-white/10 transition-colors z-10"
                        >
                            <X className="w-4 h-4 text-white/50" />
                        </button>

                        {/* Header with TrainTracks Branding */}
                        <div className="text-center space-y-3 mb-5">
                            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-white/5 border border-white/10 mb-1 relative overflow-hidden">
                                <div className="absolute inset-0 bg-gradient-to-br from-green-500/10 to-blue-500/10" />
                                <TrainFront className="w-7 h-7 text-green-400 relative z-10" />
                            </div>
                            <div>
                                <div className="flex items-center justify-center gap-1.5 mb-1">
                                    <TrainFront className="w-3.5 h-3.5 text-white/30" />
                                    <span className="text-[10px] font-bold tracking-[0.25em] text-white/30 uppercase">TrainTracks</span>
                                </div>

                                {/* Animated title */}
                                <div className={`transition-all duration-300 ease-out ${getFormAnimClass()}`}>
                                    <h2 className="text-xl font-black tracking-tight text-white">
                                        {mode === 'signin' ? 'Welcome Back' : 'Join the Network'}
                                    </h2>
                                    <p className="text-zinc-500 text-xs mt-1">
                                        {mode === 'signin' ? 'Sign in to track your commute.' : 'Create your commuter profile.'}
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Mode Switcher Pill */}
                        <div className="flex bg-white/5 rounded-xl p-1 mb-5 relative border border-white/5">
                            {/* Sliding background indicator */}
                            <div
                                className="absolute top-1 bottom-1 rounded-lg bg-white/10 border border-white/10 transition-all duration-300 ease-out shadow-lg"
                                style={{
                                    left: mode === 'signin' ? '4px' : '50%',
                                    width: 'calc(50% - 4px)',
                                }}
                            />
                            <button
                                type="button"
                                onClick={() => switchMode('signin')}
                                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition-colors duration-300 relative z-10 ${mode === 'signin' ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'
                                    }`}
                            >
                                <LogIn className="w-3.5 h-3.5" />
                                Sign In
                            </button>
                            <button
                                type="button"
                                onClick={() => switchMode('signup')}
                                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition-colors duration-300 relative z-10 ${mode === 'signup' ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'
                                    }`}
                            >
                                <UserPlus className="w-3.5 h-3.5" />
                                Sign Up
                            </button>
                        </div>

                        {/* Animated form content */}
                        <div
                            ref={formRef}
                            className={`transition-all duration-300 ease-out ${getFormAnimClass()}`}
                        >
                            {/* Google Auth Button */}
                            <button
                                onClick={handleGoogleLogin}
                                disabled={googleLoading}
                                className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-xl bg-white text-black font-semibold text-sm hover:bg-zinc-200 transition-all duration-200 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-white/5 mb-4"
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
                                {mode === 'signin' ? 'Continue with Google' : 'Sign up with Google'}
                            </button>

                            {/* Divider */}
                            <div className="flex items-center gap-3 mb-4">
                                <div className="flex-1 h-px bg-white/10" />
                                <span className="text-zinc-600 text-[10px] font-bold uppercase tracking-widest">or</span>
                                <div className="flex-1 h-px bg-white/10" />
                            </div>

                            {/* Email Form */}
                            <form onSubmit={handleEmailAuth} className="space-y-3">
                                {/* Email Input */}
                                <div className="relative">
                                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                                    <input
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        placeholder="Email address"
                                        required
                                        className="w-full pl-10 pr-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-zinc-600 text-sm focus:outline-none focus:ring-1 focus:ring-green-500/50 focus:border-green-500/30 transition-all"
                                    />
                                </div>

                                {/* Password Input */}
                                <div className="relative">
                                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        placeholder={mode === 'signup' ? 'Create a password (min 6 chars)' : 'Password'}
                                        required
                                        minLength={6}
                                        className="w-full pl-10 pr-11 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-zinc-600 text-sm focus:outline-none focus:ring-1 focus:ring-green-500/50 focus:border-green-500/30 transition-all"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
                                    >
                                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                </div>

                                {/* Forgot Password Link (sign-in only) */}
                                {mode === 'signin' && (
                                    <div className="flex justify-end -mt-1">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setShowForgot(true);
                                                setError(null);
                                                setSuccess(null);
                                            }}
                                            className="text-[11px] text-zinc-500 hover:text-green-400 transition-colors font-medium"
                                        >
                                            Forgot password?
                                        </button>
                                    </div>
                                )}

                                {/* Error / Success */}
                                {error && (
                                    <div
                                        className="flex items-start gap-2 text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2.5 text-xs"
                                        style={{ animation: 'shakeIn 400ms ease-out' }}
                                    >
                                        <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                                        <span>{error}</span>
                                    </div>
                                )}
                                {success && (
                                    <div
                                        className="flex items-start gap-2 text-green-400 bg-green-500/10 border border-green-500/20 rounded-xl px-3 py-2.5 text-xs"
                                        style={{ animation: 'slideUp 400ms ease-out' }}
                                    >
                                        <Mail className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                                        <span>{success}</span>
                                    </div>
                                )}

                                {/* Submit Button */}
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className={`w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-semibold text-sm transition-all duration-300 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed border ${mode === 'signup'
                                        ? 'bg-green-500/20 text-green-300 border-green-500/20 hover:bg-green-500/30'
                                        : 'bg-white/10 text-white border-white/10 hover:bg-white/15'
                                        }`}
                                >
                                    {loading ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                        <>
                                            {mode === 'signin' ? 'Sign In' : 'Create Account'}
                                            <ArrowRight className="w-4 h-4" />
                                        </>
                                    )}
                                </button>
                            </form>
                        </div>

                        {/* Forgot Password Overlay */}
                        {showForgot && (
                            <div
                                className="absolute inset-0 bg-zinc-900 backdrop-blur-sm rounded-3xl p-6 flex flex-col justify-center z-20"
                                style={{ animation: 'slideUp 300ms ease-out' }}
                            >
                                {/* Back button */}
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowForgot(false);
                                        setError(null);
                                        setSuccess(null);
                                    }}
                                    className="absolute top-4 left-4 flex items-center gap-1.5 text-zinc-500 hover:text-white transition-colors text-xs font-medium"
                                >
                                    <ArrowLeft className="w-3.5 h-3.5" />
                                    Back
                                </button>

                                <div className="text-center mb-5">
                                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 mb-3">
                                        <KeyRound className="w-6 h-6 text-amber-400" />
                                    </div>
                                    <h3 className="text-lg font-black text-white">Reset Password</h3>
                                    <p className="text-zinc-500 text-xs mt-1">We&apos;ll send you a link to reset it.</p>
                                </div>

                                <form onSubmit={handleForgotPassword} className="space-y-3">
                                    <div className="relative">
                                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                                        <input
                                            type="email"
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            placeholder="Enter your email address"
                                            required
                                            autoFocus
                                            className="w-full pl-10 pr-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-zinc-600 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500/50 focus:border-amber-500/30 transition-all"
                                        />
                                    </div>

                                    {error && (
                                        <div
                                            className="flex items-start gap-2 text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2.5 text-xs"
                                            style={{ animation: 'shakeIn 400ms ease-out' }}
                                        >
                                            <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                                            <span>{error}</span>
                                        </div>
                                    )}
                                    {success && (
                                        <div
                                            className="flex items-start gap-2 text-green-400 bg-green-500/10 border border-green-500/20 rounded-xl px-3 py-2.5 text-xs"
                                            style={{ animation: 'slideUp 400ms ease-out' }}
                                        >
                                            <Mail className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                                            <span>{success}</span>
                                        </div>
                                    )}

                                    <button
                                        type="submit"
                                        disabled={forgotLoading}
                                        className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/20 hover:bg-amber-500/30 font-semibold text-sm transition-all duration-300 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {forgotLoading ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                            <>
                                                Send Reset Link
                                                <ArrowRight className="w-4 h-4" />
                                            </>
                                        )}
                                    </button>
                                </form>
                            </div>
                        )}
                    </div>
                </div>

                {/* CSS Keyframes */}
                <style jsx>{`
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                @keyframes modalIn {
                    from {
                        opacity: 0;
                        transform: scale(0.95) translateY(10px);
                    }
                    to {
                        opacity: 1;
                        transform: scale(1) translateY(0);
                    }
                }
                @keyframes shakeIn {
                    0% { opacity: 0; transform: translateX(-8px); }
                    30% { transform: translateX(4px); }
                    60% { transform: translateX(-2px); }
                    100% { opacity: 1; transform: translateX(0); }
                }
                @keyframes slideUp {
                    from { opacity: 0; transform: translateY(8px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `}</style>
            </div>

            <LoginSuccessModal isOpen={showLoginSuccess} onComplete={handleLoginComplete} />
        </>
    );
}
