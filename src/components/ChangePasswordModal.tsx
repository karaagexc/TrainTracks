'use client';

import { useState } from 'react';
import { Loader2, KeyRound, Eye, EyeOff, AlertCircle, X, ShieldCheck } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

type PasswordMode = 'set' | 'change' | 'reset';

interface ChangePasswordModalProps {
    isOpen: boolean;
    onClose: () => void;
    userEmail: string;
    /** 'set' = first-time (no current field), 'change' = has password, 'reset' = via email link */
    mode: PasswordMode;
    onPasswordSet?: () => void;
}

export default function ChangePasswordModal({ isOpen, onClose, userEmail, mode, onPasswordSet }: ChangePasswordModalProps) {
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    const [showCurrent, setShowCurrent] = useState(false);
    const [showNew, setShowNew] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);

    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    const supabase = createClient();

    if (!isOpen) return null;

    const showCurrentField = mode === 'change';

    const titles: Record<PasswordMode, string> = {
        set: 'Set Password',
        change: 'Change Password',
        reset: 'Reset Password',
    };

    const subtitles: Record<PasswordMode, string> = {
        set: 'Add a password to your account',
        change: 'Secure your account',
        reset: 'Choose a new password',
    };

    const buttonLabels: Record<PasswordMode, string> = {
        set: 'Set Password',
        change: 'Update Password',
        reset: 'Reset Password',
    };

    const resetFields = () => {
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setShowCurrent(false);
        setShowNew(false);
        setShowConfirm(false);
        setError(null);
        setSuccess(false);
    };

    const handleClose = () => {
        resetFields();
        onClose();
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        // Validation
        if (newPassword.length < 6) {
            setError('Password must be at least 6 characters.');
            return;
        }
        if (newPassword !== confirmPassword) {
            setError('Passwords do not match.');
            return;
        }

        setIsLoading(true);

        try {
            const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
            const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

            // Step 1: Verify current password (only in 'change' mode)
            // Use direct fetch to avoid corrupting SDK client
            if (mode === 'change') {
                console.log('[ChangePassword] Verifying current password via REST...');
                const verifyRes = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'apikey': supabaseKey,
                    },
                    body: JSON.stringify({
                        email: userEmail,
                        password: currentPassword,
                    }),
                });

                if (!verifyRes.ok) {
                    console.log('[ChangePassword] Current password verification failed:', verifyRes.status);
                    setError('Incorrect current password.');
                    setIsLoading(false);
                    return;
                }
                console.log('[ChangePassword] Current password verified OK');
            }

            // Step 2: Get access token BEFORE the update
            const { data: { session } } = await supabase.auth.getSession();
            const accessToken = session?.access_token;
            const userId = session?.user?.id;

            if (!accessToken) {
                setError('Session expired. Please log in again.');
                setIsLoading(false);
                return;
            }

            // Step 3: Update password via direct REST API
            console.log('[ChangePassword] Sending PUT /auth/v1/user...');
            const updateRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${accessToken}`,
                    'apikey': supabaseKey,
                },
                body: JSON.stringify({ password: newPassword }),
            });

            console.log('[ChangePassword] PUT response status:', updateRes.status);

            if (!updateRes.ok) {
                const errBody = await updateRes.text();
                console.error('[ChangePassword] PUT failed:', errBody);
                try {
                    const errData = JSON.parse(errBody);
                    setError(errData.msg || errData.message || errData.error_description || 'Failed to update password.');
                } catch {
                    setError('Failed to update password. Status: ' + updateRes.status);
                }
                setIsLoading(false);
                return;
            }

            console.log('[ChangePassword] ✅ Password updated successfully via REST');

            // Step 4: Update has_password in profiles via SDK upsert
            if (userId) {
                console.log('[ChangePassword] Updating has_password in profiles...');
                const { error: dbError } = await supabase
                    .from('profile_private')
                    .update({ has_password: true, updated_at: new Date().toISOString() })
                    .eq('user_id', userId);

                if (dbError) {
                    console.warn('[ChangePassword] has_password update error:', dbError.message, dbError.details, dbError.hint);
                } else {
                    console.log('[ChangePassword] ✅ has_password set to true');
                }
            }

            // Step 5: Success!
            setIsLoading(false);
            setSuccess(true);
            console.log('[ChangePassword] ✅ All done, showing success');

            if (onPasswordSet) {
                console.log('[ChangePassword] Calling onPasswordSet callback');
                onPasswordSet();
            }

            // Auto-close after showing success
            setTimeout(() => {
                handleClose();
            }, 1500);
            return;

        } catch (err: any) {
            console.error('[ChangePassword] ❌ Unexpected error:', err);
            setError(err.message || 'An unexpected error occurred.');
            setIsLoading(false);
        }
    };

    // Success state
    if (success) {
        return (
            <div className="fixed inset-0 z-[250] flex items-center justify-center p-4">
                <div
                    className="absolute inset-0 bg-black/70 backdrop-blur-sm"
                    style={{ animation: 'cpmFadeIn 300ms ease-out' }}
                />
                <div
                    className="relative w-full max-w-sm"
                    style={{ animation: 'cpmModalIn 400ms cubic-bezier(0.16, 1, 0.3, 1)' }}
                >
                    <div className="absolute -inset-4 bg-gradient-to-b from-green-500/20 via-emerald-500/10 to-transparent rounded-[2rem] blur-xl pointer-events-none" />
                    <div className="relative bg-zinc-900/90 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl text-center">
                        <div className="w-16 h-16 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center mx-auto mb-4" style={{ animation: 'cpmPulse 600ms ease-out' }}>
                            <ShieldCheck className="w-8 h-8 text-green-400" />
                        </div>
                        <h2 className="text-xl font-black text-white mb-1">Password Updated!</h2>
                        <p className="text-sm text-zinc-500">Your account is now secured.</p>
                    </div>
                </div>
                <style jsx>{`
                    @keyframes cpmFadeIn {
                        from { opacity: 0; }
                        to { opacity: 1; }
                    }
                    @keyframes cpmModalIn {
                        from { opacity: 0; transform: scale(0.95) translateY(10px); }
                        to { opacity: 1; transform: scale(1) translateY(0); }
                    }
                    @keyframes cpmPulse {
                        0% { transform: scale(0.8); opacity: 0; }
                        50% { transform: scale(1.1); }
                        100% { transform: scale(1); opacity: 1; }
                    }
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
                style={{ animation: 'cpmFadeIn 300ms ease-out' }}
            />

            {/* Modal */}
            <div
                className="relative w-full max-w-sm"
                style={{ animation: 'cpmModalIn 400ms cubic-bezier(0.16, 1, 0.3, 1)' }}
            >
                {/* Glow */}
                <div className="absolute -inset-4 bg-gradient-to-b from-purple-500/20 via-blue-500/10 to-transparent rounded-[2rem] blur-xl pointer-events-none" />

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
                        <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center border border-purple-500/20">
                            <KeyRound className="w-5 h-5 text-purple-400" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-white">{titles[mode]}</h2>
                            <p className="text-xs text-zinc-500">{subtitles[mode]}</p>
                        </div>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        {/* Current Password (only in change mode) */}
                        {showCurrentField && (
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Current Password</label>
                                <div className="relative">
                                    <input
                                        type={showCurrent ? 'text' : 'password'}
                                        value={currentPassword}
                                        onChange={(e) => setCurrentPassword(e.target.value)}
                                        className="w-full pl-4 pr-10 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-zinc-600 text-sm focus:outline-none focus:ring-1 focus:ring-purple-500/50 focus:border-purple-500/30 transition-all"
                                        placeholder="Enter current password"
                                        required
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowCurrent(!showCurrent)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                                    >
                                        {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* New Password */}
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                                {mode === 'change' ? 'New Password' : 'Password'}
                            </label>
                            <div className="relative">
                                <input
                                    type={showNew ? 'text' : 'password'}
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    className="w-full pl-4 pr-10 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-zinc-600 text-sm focus:outline-none focus:ring-1 focus:ring-purple-500/50 focus:border-purple-500/30 transition-all"
                                    placeholder={mode === 'change' ? 'Enter new password' : 'Create a password'}
                                    required
                                    minLength={6}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowNew(!showNew)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                                >
                                    {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>
                        </div>

                        {/* Confirm Password */}
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Confirm Password</label>
                            <div className="relative">
                                <input
                                    type={showConfirm ? 'text' : 'password'}
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    className="w-full pl-4 pr-10 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-zinc-600 text-sm focus:outline-none focus:ring-1 focus:ring-purple-500/50 focus:border-purple-500/30 transition-all"
                                    placeholder="Repeat password"
                                    required
                                    minLength={6}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowConfirm(!showConfirm)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                                >
                                    {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>
                        </div>

                        {/* Forgot Password link (only in change mode) */}
                        {mode === 'change' && (
                            <button
                                type="button"
                                onClick={async () => {
                                    setError(null);
                                    const { error } = await supabase.auth.resetPasswordForEmail(userEmail, {
                                        redirectTo: `${window.location.origin}/?reset_password=true`,
                                    });
                                    if (error) {
                                        setError(error.message);
                                    } else {
                                        setError(null);
                                        handleClose();
                                        alert('Password reset link sent to your email!');
                                    }
                                }}
                                className="text-xs text-purple-400 hover:text-purple-300 transition-colors font-medium"
                            >
                                Forgot your password?
                            </button>
                        )}

                        {/* Error */}
                        {error && (
                            <div className="flex items-start gap-2 text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2.5 text-xs" style={{ animation: 'cpmShake 400ms ease-out' }}>
                                <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                                <span>{error}</span>
                            </div>
                        )}

                        {/* Submit Button */}
                        <div className="pt-2">
                            <button
                                type="submit"
                                disabled={isLoading}
                                className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-white text-black font-bold text-sm hover:bg-zinc-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-white/10"
                            >
                                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : buttonLabels[mode]}
                            </button>
                        </div>
                    </form>
                </div>
            </div>

            <style jsx>{`
                @keyframes cpmFadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                @keyframes cpmModalIn {
                    from {
                        opacity: 0;
                        transform: scale(0.95) translateY(10px);
                    }
                    to {
                        opacity: 1;
                        transform: scale(1) translateY(0);
                    }
                }
                @keyframes cpmShake {
                    0% { opacity: 0; transform: translateX(-8px); }
                    30% { transform: translateX(4px); }
                    60% { transform: translateX(-2px); }
                    100% { opacity: 1; transform: translateX(0); }
                }
                @keyframes cpmPulse {
                    0% { transform: scale(0.8); opacity: 0; }
                    50% { transform: scale(1.1); }
                    100% { transform: scale(1); opacity: 1; }
                }
            `}</style>
        </div>
    );
}
