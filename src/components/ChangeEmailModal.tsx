'use client';

import { useState } from 'react';
import { Loader2, Mail, AlertCircle, X, ShieldCheck, Hash } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

interface ChangeEmailModalProps {
    isOpen: boolean;
    onClose: () => void;
    currentEmail?: string;
}

export default function ChangeEmailModal({ isOpen, onClose, currentEmail }: ChangeEmailModalProps) {
    const [step, setStep] = useState<'email' | 'otp'>('email');
    const [newEmail, setNewEmail] = useState('');
    const [otpCode, setOtpCode] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    const supabase = createClient();

    if (!isOpen) return null;

    const resetFields = () => {
        setStep('email');
        setNewEmail('');
        setOtpCode('');
        setError(null);
        setSuccess(false);
    };

    const handleClose = () => {
        resetFields();
        onClose();
    };

    // Step 1: Request email change (sends OTP to new email)
    const handleRequestChange = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (newEmail === currentEmail) {
            setError('New email must be different from your current email.');
            return;
        }

        setIsLoading(true);

        try {
            const { error: updateError } = await supabase.auth.updateUser({
                email: newEmail,
            });

            if (updateError) {
                setError(updateError.message);
                setIsLoading(false);
                return;
            }

            // Move to OTP step
            setStep('otp');
        } catch (err: any) {
            console.error('Email change request error:', err);
            setError(err.message || 'An unexpected error occurred.');
        } finally {
            setIsLoading(false);
        }
    };

    // Step 2: Verify OTP code
    const handleVerifyOtp = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (otpCode.length < 6) {
            setError('Please enter the 6-digit code.');
            return;
        }

        setIsLoading(true);

        try {
            const { error: verifyError } = await supabase.auth.verifyOtp({
                email: newEmail,
                token: otpCode,
                type: 'email_change',
            });

            if (verifyError) {
                setError(verifyError.message);
                setIsLoading(false);
                return;
            }

            // Update profile email in our table too
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                await supabase
                    .from('profiles')
                    .update({ email: newEmail })
                    .eq('id', user.id);
            }

            setSuccess(true);
            setTimeout(() => {
                handleClose();
            }, 1500);

        } catch (err: any) {
            console.error('OTP verify error:', err);
            setError(err.message || 'An unexpected error occurred.');
        } finally {
            setIsLoading(false);
        }
    };

    // Success state
    if (success) {
        return (
            <div className="fixed inset-0 z-[250] flex items-center justify-center p-4">
                <div
                    className="absolute inset-0 bg-black/70 backdrop-blur-sm"
                    style={{ animation: 'cemFadeIn 300ms ease-out' }}
                />
                <div
                    className="relative w-full max-w-sm"
                    style={{ animation: 'cemModalIn 400ms cubic-bezier(0.16, 1, 0.3, 1)' }}
                >
                    <div className="absolute -inset-4 bg-gradient-to-b from-green-500/20 via-emerald-500/10 to-transparent rounded-[2rem] blur-xl pointer-events-none" />
                    <div className="relative bg-zinc-900/90 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl text-center">
                        <div className="w-16 h-16 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center mx-auto mb-4" style={{ animation: 'cemPulse 600ms ease-out' }}>
                            <ShieldCheck className="w-8 h-8 text-green-400" />
                        </div>
                        <h2 className="text-xl font-black text-white mb-1">Email Updated!</h2>
                        <p className="text-sm text-zinc-500">Your new email is now active.</p>
                    </div>
                </div>
                <style jsx>{`
                    @keyframes cemFadeIn { from { opacity: 0; } to { opacity: 1; } }
                    @keyframes cemModalIn { from { opacity: 0; transform: scale(0.95) translateY(10px); } to { opacity: 1; transform: scale(1) translateY(0); } }
                    @keyframes cemPulse { 0% { transform: scale(0.8); opacity: 0; } 50% { transform: scale(1.1); } 100% { transform: scale(1); opacity: 1; } }
                `}</style>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-[250] flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/70 backdrop-blur-sm"
                onClick={handleClose}
                style={{ animation: 'cemFadeIn 300ms ease-out' }}
            />

            {/* Modal */}
            <div
                className="relative w-full max-w-sm"
                style={{ animation: 'cemModalIn 400ms cubic-bezier(0.16, 1, 0.3, 1)' }}
            >
                {/* Glow */}
                <div className="absolute -inset-4 bg-gradient-to-b from-blue-500/20 via-cyan-500/10 to-transparent rounded-[2rem] blur-xl pointer-events-none" />

                <div className="relative bg-zinc-900/90 backdrop-blur-xl border border-white/10 rounded-3xl p-6 shadow-2xl overflow-hidden">
                    {/* Close Button */}
                    <button
                        onClick={handleClose}
                        className="absolute top-4 right-4 p-1.5 rounded-full bg-white/5 hover:bg-white/10 transition-colors"
                    >
                        <X className="w-4 h-4 text-white/50" />
                    </button>

                    {/* Header */}
                    <div className="flex items-center gap-3 mb-6">
                        <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center border border-blue-500/20">
                            {step === 'email' ? (
                                <Mail className="w-5 h-5 text-blue-400" />
                            ) : (
                                <Hash className="w-5 h-5 text-blue-400" />
                            )}
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-white">
                                {step === 'email' ? 'Change Email' : 'Verify Email'}
                            </h2>
                            <p className="text-xs text-zinc-500">
                                {step === 'email'
                                    ? 'Enter your new email address'
                                    : `Code sent to ${newEmail}`}
                            </p>
                        </div>
                    </div>

                    {step === 'email' ? (
                        /* Step 1: Enter new email */
                        <form onSubmit={handleRequestChange} className="space-y-4">
                            {/* Current email display */}
                            {currentEmail && (
                                <div className="bg-white/5 border border-white/5 rounded-xl px-4 py-3">
                                    <div className="text-[10px] uppercase text-white/30 font-bold tracking-wider mb-0.5">Current Email</div>
                                    <div className="text-sm text-white/60 truncate">{currentEmail}</div>
                                </div>
                            )}

                            {/* New email input */}
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">New Email</label>
                                <input
                                    type="email"
                                    value={newEmail}
                                    onChange={(e) => setNewEmail(e.target.value)}
                                    className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-zinc-600 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500/50 focus:border-blue-500/30 transition-all"
                                    placeholder="Enter new email address"
                                    required
                                />
                            </div>

                            {/* Error */}
                            {error && (
                                <div className="flex items-start gap-2 text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2.5 text-xs">
                                    <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                                    <span>{error}</span>
                                </div>
                            )}

                            <div className="pt-2">
                                <button
                                    type="submit"
                                    disabled={isLoading}
                                    className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-white text-black font-bold text-sm hover:bg-zinc-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-white/10"
                                >
                                    {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Send Verification Code'}
                                </button>
                            </div>
                        </form>
                    ) : (
                        /* Step 2: Enter OTP */
                        <form onSubmit={handleVerifyOtp} className="space-y-4">
                            <p className="text-sm text-zinc-400">
                                We sent a 6-digit code to <span className="text-white font-semibold">{newEmail}</span>. Enter it below to confirm.
                            </p>

                            {/* OTP input */}
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Verification Code</label>
                                <input
                                    type="text"
                                    value={otpCode}
                                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                    className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-center text-2xl font-mono tracking-[0.5em] focus:outline-none focus:ring-1 focus:ring-blue-500/50 focus:border-blue-500/30 transition-all"
                                    placeholder="000000"
                                    maxLength={6}
                                    autoFocus
                                    required
                                />
                            </div>

                            {/* Error */}
                            {error && (
                                <div className="flex items-start gap-2 text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2.5 text-xs">
                                    <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                                    <span>{error}</span>
                                </div>
                            )}

                            <div className="pt-2 space-y-2">
                                <button
                                    type="submit"
                                    disabled={isLoading || otpCode.length < 6}
                                    className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-white text-black font-bold text-sm hover:bg-zinc-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-white/10"
                                >
                                    {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Verify & Update Email'}
                                </button>

                                <button
                                    type="button"
                                    onClick={() => {
                                        setStep('email');
                                        setOtpCode('');
                                        setError(null);
                                    }}
                                    className="w-full text-center text-xs text-zinc-500 hover:text-white transition-colors py-2"
                                >
                                    ← Use a different email
                                </button>
                            </div>
                        </form>
                    )}
                </div>
            </div>

            <style jsx>{`
                @keyframes cemFadeIn { from { opacity: 0; } to { opacity: 1; } }
                @keyframes cemModalIn { from { opacity: 0; transform: scale(0.95) translateY(10px); } to { opacity: 1; transform: scale(1) translateY(0); } }
                @keyframes cemPulse { 0% { transform: scale(0.8); opacity: 0; } 50% { transform: scale(1.1); } 100% { transform: scale(1); opacity: 1; } }
            `}</style>
        </div>
    );
}
