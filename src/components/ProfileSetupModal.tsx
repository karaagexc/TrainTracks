'use client';

import { useState, useRef, useEffect } from 'react';
import { useAuth, UserProfile } from '@/hooks/useAuth';
import { Camera, Check, Loader2, User, AlertCircle, Sparkles, ArrowRight, X, Pencil, TrainFront, Eye, EyeOff } from 'lucide-react';

interface ProfileSetupModalProps {
    isOpen: boolean;
    onClose: () => void;
    /** If true, user is editing existing profile (shows different title, allows close) */
    editMode?: boolean;
}

export default function ProfileSetupModal({ isOpen, onClose, editMode = false }: ProfileSetupModalProps) {
    const { user, profile, updateProfile, uploadAvatar } = useAuth();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [username, setUsername] = useState('');
    const [displayName, setDisplayName] = useState('');
    const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
    const [avatarFile, setAvatarFile] = useState<File | null>(null);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);

    // Check if user is signed in via Google
    // We assume if they have 'google' provider, they might benefit from setting a password if they haven't already.
    const isGoogleUser = user?.app_metadata?.provider === 'google' || user?.app_metadata?.providers?.includes('google');

    // Only show password field during initial setup (not edit mode) for Google users
    const showPasswordField = !editMode && isGoogleUser;

    // Pre-fill fields when modal opens
    useEffect(() => {
        if (isOpen) {
            if (editMode && profile) {
                setUsername(profile.username || '');
                setDisplayName(profile.display_name || '');
                setAvatarPreview(profile.avatar_url || null);
            } else if (user) {
                const metaName = user.user_metadata?.full_name || user.user_metadata?.name || '';
                setDisplayName(metaName);
                setAvatarPreview(profile?.avatar_url || user.user_metadata?.avatar_url || null);
                setUsername(profile?.username || '');
            }
            setAvatarFile(null);
            setError(null);
            setSuccess(null);
            setUsernameStatus('idle');
        }
    }, [isOpen, editMode, user, profile]);

    // Username availability check (debounced)
    useEffect(() => {
        if (!username || username.length < 3) {
            setUsernameStatus('idle');
            return;
        }

        if (!/^[a-zA-Z0-9_]+$/.test(username)) {
            setUsernameStatus('idle');
            return;
        }

        // If editing and username hasn't changed, mark as available
        if (editMode && profile?.username === username.toLowerCase()) {
            setUsernameStatus('available');
            return;
        }

        setUsernameStatus('checking');
        const timer = setTimeout(async () => {
            const { createClient } = await import('@/lib/supabase/client');
            const supabase = createClient();
            const { data } = await supabase
                .from('profiles')
                .select('id')
                .eq('username', username.toLowerCase())
                .maybeSingle();

            if (data && data.id !== user?.id) {
                setUsernameStatus('taken');
            } else {
                setUsernameStatus('available');
            }
        }, 500);

        return () => clearTimeout(timer);
    }, [username, user?.id, editMode, profile?.username]);

    if (!isOpen) return null;

    const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (file.size > 2 * 1024 * 1024) {
            setError('Image must be under 2MB');
            return;
        }

        setAvatarFile(file);
        const reader = new FileReader();
        reader.onload = (e) => setAvatarPreview(e.target?.result as string);
        reader.readAsDataURL(file);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!username || username.length < 3) {
            setError('Username must be at least 3 characters');
            return;
        }
        if (usernameStatus === 'taken') {
            setError('Username is already taken');
            return;
        }

        setSaving(true);
        setError(null);
        setSuccess(null);

        try {
            // Upload avatar if new file selected
            if (avatarFile) {
                const { error: uploadError } = await uploadAvatar(avatarFile);
                if (uploadError) {
                    setError(uploadError);
                    setSaving(false);
                    return;
                }
            }

            // Update profile
            const { error: profileError } = await updateProfile({
                username: username.toLowerCase(),
                display_name: displayName || username,
            });

            if (profileError) {
                setError(profileError);
                setSaving(false);
                return;
            }

            // Set password if provided (for Google users)
            // Use direct REST API to avoid SDK client hanging after updateUser
            if (password && isGoogleUser) {
                const { createClient } = await import('@/lib/supabase/client');
                const supabase = createClient();
                const { data: { session } } = await supabase.auth.getSession();
                const accessToken = session?.access_token;

                if (!accessToken) {
                    setError('Session expired. Please log in again.');
                    setSaving(false);
                    return;
                }

                const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
                const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

                const updateRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${accessToken}`,
                        'apikey': supabaseKey,
                    },
                    body: JSON.stringify({ password }),
                });

                if (!updateRes.ok) {
                    const errData = await updateRes.json().catch(() => ({}));
                    setError('Profile saved, but password failed: ' + (errData.msg || errData.message || 'Unknown error'));
                    setSaving(false);
                    return;
                }

                // Mark has_password in profiles table via REST
                if (user) {
                    try {
                        const patchRes = await fetch(`${supabaseUrl}/rest/v1/profile_private?user_id=eq.${user.id}`, {
                            method: 'PATCH',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${accessToken}`,
                                'apikey': supabaseKey,
                                'Prefer': 'return=minimal',
                            },
                            body: JSON.stringify({ has_password: true, updated_at: new Date().toISOString() }),
                        });
                        if (patchRes.ok) {
                            console.log('[ProfileSetup] ✅ has_password set to true');
                        } else {
                            console.warn('[ProfileSetup] has_password PATCH failed:', patchRes.status);
                        }
                    } catch (err) {
                        console.warn('[ProfileSetup] has_password update error:', err);
                    }
                }
            }

            if (editMode) {
                setSuccess('Profile updated!');
                setTimeout(() => onClose(), 1200);
            } else {
                onClose();
            }
        } catch {
            setError('Something went wrong. Please try again.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className={`absolute inset-0 bg-black/70 backdrop-blur-sm ${editMode ? 'cursor-pointer' : ''}`}
                onClick={editMode ? onClose : undefined}
                style={{ animation: 'psmFadeIn 300ms ease-out' }}
            />

            {/* Modal */}
            <div
                className="relative w-full max-w-sm"
                style={{ animation: 'psmModalIn 500ms cubic-bezier(0.16, 1, 0.3, 1)' }}
            >
                {/* Glow effect */}
                <div className="absolute -inset-4 bg-gradient-to-b from-purple-500/10 via-green-500/5 to-blue-500/10 rounded-[2rem] blur-2xl pointer-events-none" />

                <div className="relative bg-zinc-900/80 backdrop-blur-2xl border border-white/10 rounded-3xl p-6 shadow-2xl overflow-hidden max-h-[85vh] overflow-y-auto no-scrollbar">
                    {/* Inner glow accents */}
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-[1px] bg-gradient-to-r from-transparent via-white/30 to-transparent" />
                    <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/5 rounded-full blur-3xl pointer-events-none" />
                    <div className="absolute bottom-0 left-0 w-24 h-24 bg-green-500/5 rounded-full blur-3xl pointer-events-none" />

                    {/* Close Button (only in edit mode) */}
                    {editMode && (
                        <button
                            onClick={onClose}
                            className="absolute top-4 right-4 p-1.5 rounded-full bg-white/5 hover:bg-white/10 transition-colors z-10"
                        >
                            <X className="w-4 h-4 text-white/50" />
                        </button>
                    )}

                    {/* Header */}
                    <div className="text-center space-y-3 mb-6">
                        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-white/5 border border-white/10 mb-1 relative overflow-hidden">
                            <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 to-green-500/10" />
                            {editMode ? (
                                <Pencil className="w-7 h-7 text-purple-400 relative z-10" />
                            ) : (
                                <Sparkles className="w-7 h-7 text-yellow-400 relative z-10" />
                            )}
                        </div>
                        <div>
                            <div className="flex items-center justify-center gap-1.5 mb-1">
                                <TrainFront className="w-3.5 h-3.5 text-white/30" />
                                <span className="text-[10px] font-bold tracking-[0.25em] text-white/30 uppercase">TrainTracks</span>
                            </div>
                            <h2 className="text-xl font-black tracking-tight text-white">
                                {editMode ? 'Edit Profile' : 'Set Up Your Profile'}
                            </h2>
                            <p className="text-zinc-500 text-xs mt-1">
                                {editMode ? 'Update your name, username, or photo.' : 'Choose a username and add a photo.'}
                            </p>
                        </div>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-5">
                        {/* Avatar Upload */}
                        <div className="flex justify-center">
                            <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                className="relative w-20 h-20 rounded-full group"
                            >
                                {/* Glow ring */}
                                <div className="absolute -inset-1 bg-gradient-to-br from-green-500/20 to-purple-500/20 rounded-full blur-md opacity-50 group-hover:opacity-100 transition-opacity" />

                                {avatarPreview ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                        src={avatarPreview}
                                        alt="Avatar"
                                        className="relative w-full h-full object-cover rounded-full border-2 border-white/10"
                                    />
                                ) : (
                                    <div className="relative w-full h-full rounded-full bg-zinc-800 border-2 border-dashed border-zinc-600 flex items-center justify-center">
                                        <User className="w-7 h-7 text-zinc-500" />
                                    </div>
                                )}

                                {/* Hover overlay */}
                                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-full">
                                    <Camera className="w-5 h-5 text-white" />
                                </div>
                            </button>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                onChange={handleAvatarChange}
                                className="hidden"
                            />
                        </div>

                        {/* Password Input (Google Users Only) */}
                        {showPasswordField && (
                            <div className="space-y-1.5 animate-in fade-in slide-in-from-top-2">
                                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                                    Create Password <span className="text-zinc-600 font-normal">(optional)</span>
                                </label>
                                <div className="relative">
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        placeholder="Set a password for your account"
                                        minLength={6}
                                        className="w-full pl-4 pr-10 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-zinc-600 text-sm focus:outline-none focus:ring-1 focus:ring-green-500/50 focus:border-green-500/30 transition-all"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                                    >
                                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                </div>
                                <p className="text-[10px] text-zinc-500">
                                    Allows you to sign in with email/password too.
                                </p>
                            </div>
                        )}

                        {/* Username Input */}
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                                Username
                            </label>
                            <div className="relative">
                                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">@</span>
                                <input
                                    type="text"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
                                    placeholder="your_username"
                                    required
                                    minLength={3}
                                    maxLength={20}
                                    className="w-full pl-8 pr-10 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-zinc-600 text-sm focus:outline-none focus:ring-1 focus:ring-green-500/50 focus:border-green-500/30 transition-all"
                                />
                                {usernameStatus === 'checking' && (
                                    <Loader2 className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 animate-spin" />
                                )}
                                {usernameStatus === 'available' && (
                                    <Check className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-green-400" />
                                )}
                                {usernameStatus === 'taken' && (
                                    <AlertCircle className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-red-400" />
                                )}
                            </div>
                            <p className={`text-[10px] ${usernameStatus === 'taken' ? 'text-red-400' :
                                usernameStatus === 'available' ? 'text-green-400' : 'text-zinc-600'
                                }`}>
                                {usernameStatus === 'taken'
                                    ? 'This username is taken'
                                    : usernameStatus === 'available'
                                        ? 'Username is available!'
                                        : 'Letters, numbers, and underscores only'}
                            </p>
                        </div>

                        {/* Display Name Input */}
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                                Display Name <span className="text-zinc-600 font-normal">(optional)</span>
                            </label>
                            <input
                                type="text"
                                value={displayName}
                                onChange={(e) => setDisplayName(e.target.value)}
                                placeholder="How should we call you?"
                                maxLength={50}
                                className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-zinc-600 text-sm focus:outline-none focus:ring-1 focus:ring-green-500/50 focus:border-green-500/30 transition-all"
                            />
                        </div>

                        {/* Error / Success */}
                        {error && (
                            <div
                                className="flex items-start gap-2 text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2.5 text-xs"
                                style={{ animation: 'psmShakeIn 400ms ease-out' }}
                            >
                                <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                                <span>{error}</span>
                            </div>
                        )}
                        {success && (
                            <div
                                className="flex items-start gap-2 text-green-400 bg-green-500/10 border border-green-500/20 rounded-xl px-3 py-2.5 text-xs"
                                style={{ animation: 'psmSlideUp 400ms ease-out' }}
                            >
                                <Check className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                                <span>{success}</span>
                            </div>
                        )}

                        {/* Submit Button */}
                        <button
                            type="submit"
                            disabled={saving || usernameStatus === 'taken' || !username || username.length < 3}
                            className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-white text-black font-bold text-sm hover:bg-zinc-200 transition-all duration-200 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-white/10"
                        >
                            {saving ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                <>
                                    {editMode ? 'Save Changes' : "Let's Ride"}
                                    <ArrowRight className="w-4 h-4" />
                                </>
                            )}
                        </button>

                        {/* Skip (first-time setup only) */}
                        {!editMode && (
                            <button
                                type="button"
                                onClick={onClose}
                                className="w-full text-center text-zinc-600 text-xs hover:text-zinc-400 transition-colors font-medium"
                            >
                                Skip for now
                            </button>
                        )}
                    </form>
                </div>
            </div>

            {/* CSS Keyframes */}
            <style jsx>{`
                @keyframes psmFadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                @keyframes psmModalIn {
                    from {
                        opacity: 0;
                        transform: scale(0.95) translateY(10px);
                    }
                    to {
                        opacity: 1;
                        transform: scale(1) translateY(0);
                    }
                }
                @keyframes psmShakeIn {
                    0% { opacity: 0; transform: translateX(-8px); }
                    30% { transform: translateX(4px); }
                    60% { transform: translateX(-2px); }
                    100% { opacity: 1; transform: translateX(0); }
                }
                @keyframes psmSlideUp {
                    from { opacity: 0; transform: translateY(8px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `}</style>
        </div>
    );
}
