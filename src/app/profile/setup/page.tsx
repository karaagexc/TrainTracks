'use client';

import { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Camera, Check, Loader2, User, AlertCircle, Sparkles, ArrowRight } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function ProfileSetupPage() {
    const { user, profile, loading, updateProfile, uploadAvatar } = useAuth();
    const router = useRouter();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [username, setUsername] = useState('');
    const [displayName, setDisplayName] = useState('');
    const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
    const [avatarFile, setAvatarFile] = useState<File | null>(null);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');

    // Pre-fill from auth provider (Google name, avatar)
    useEffect(() => {
        if (user && !displayName) {
            const metaName = user.user_metadata?.full_name || user.user_metadata?.name || '';
            setDisplayName(metaName);
        }
        if (profile?.avatar_url && !avatarPreview) {
            setAvatarPreview(profile.avatar_url);
        }
    }, [user, profile, displayName, avatarPreview]);

    // Username availability check (debounced)
    useEffect(() => {
        if (!username || username.length < 3) {
            setUsernameStatus('idle');
            return;
        }

        // Validate format
        if (!/^[a-zA-Z0-9_]+$/.test(username)) {
            setUsernameStatus('idle');
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

            // If data exists and it's not our own profile
            if (data && data.id !== user?.id) {
                setUsernameStatus('taken');
            } else {
                setUsernameStatus('available');
            }
        }, 500);

        return () => clearTimeout(timer);
    }, [username, user?.id]);

    const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Validate size (max 2MB)
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

        try {
            // Upload avatar if selected
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

            // Success — redirect to main app
            router.push('/');
        } catch (err) {
            setError('Something went wrong. Please try again.');
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-[100dvh] bg-black flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-zinc-500 animate-spin" />
            </div>
        );
    }

    return (
        <div className="min-h-[100dvh] bg-black text-white flex flex-col items-center justify-center p-6 overflow-hidden">
            {/* Background Glow */}
            <div className="fixed inset-0 pointer-events-none">
                <div className="absolute top-[-20%] left-[30%] w-[40%] h-[40%] bg-purple-500/5 rounded-full blur-[120px]" />
            </div>

            <div className="relative w-full max-w-sm space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
                {/* Header */}
                <div className="text-center space-y-3">
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-zinc-900 border border-zinc-800">
                        <Sparkles className="w-6 h-6 text-yellow-400" />
                    </div>
                    <h1 className="text-2xl font-black tracking-tight">
                        Set up your profile
                    </h1>
                    <p className="text-zinc-500 text-sm">
                        Choose a username and add a photo.
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Avatar Upload */}
                    <div className="flex justify-center">
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="relative w-24 h-24 rounded-full bg-zinc-900 border-2 border-dashed border-zinc-700 hover:border-zinc-500 transition-colors group overflow-hidden"
                        >
                            {avatarPreview ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                    src={avatarPreview}
                                    alt="Avatar"
                                    className="w-full h-full object-cover rounded-full"
                                />
                            ) : (
                                <User className="w-8 h-8 text-zinc-600 absolute inset-0 m-auto" />
                            )}
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

                    {/* Username Input */}
                    <div className="space-y-2">
                        <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
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
                                className="w-full pl-8 pr-10 py-3.5 rounded-xl bg-zinc-900 border border-zinc-800 text-white placeholder:text-zinc-600 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-600 focus:border-transparent transition-all"
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
                        <p className="text-xs text-zinc-600">
                            {usernameStatus === 'taken'
                                ? 'This username is taken'
                                : usernameStatus === 'available'
                                    ? 'Username is available!'
                                    : 'Letters, numbers, and underscores only'}
                        </p>
                    </div>

                    {/* Display Name Input */}
                    <div className="space-y-2">
                        <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                            Display Name <span className="text-zinc-600 font-normal">(optional)</span>
                        </label>
                        <input
                            type="text"
                            value={displayName}
                            onChange={(e) => setDisplayName(e.target.value)}
                            placeholder="How should we call you?"
                            maxLength={50}
                            className="w-full px-4 py-3.5 rounded-xl bg-zinc-900 border border-zinc-800 text-white placeholder:text-zinc-600 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-600 focus:border-transparent transition-all"
                        />
                    </div>

                    {/* Error Message */}
                    {error && (
                        <div className="flex items-start gap-2.5 text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm animate-in fade-in slide-in-from-top-2">
                            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}

                    {/* Submit */}
                    <button
                        type="submit"
                        disabled={saving || usernameStatus === 'taken' || !username || username.length < 3}
                        className="w-full flex items-center justify-center gap-2 py-4 px-4 rounded-xl bg-white text-black font-bold text-sm hover:bg-zinc-200 transition-all duration-200 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-white/10"
                    >
                        {saving ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <>
                                Let&apos;s Ride
                                <ArrowRight className="w-4 h-4" />
                            </>
                        )}
                    </button>
                </form>
            </div>
        </div>
    );
}
