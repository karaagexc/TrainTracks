'use client';

import { useState } from 'react';
import { User, LogOut, TrainFront, X, Pencil, KeyRound, Mail, Loader2 } from 'lucide-react';
import { UserProfile, useAuth } from '@/hooks/useAuth';
import ChangePasswordModal from './ChangePasswordModal';
import ChangeEmailModal from './ChangeEmailModal';
import LogoutModal from './LogoutModal';

interface ProfileDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    profile: UserProfile | null;
    userEmail?: string;
    onSignOut: () => void;
    onEditProfile: () => void;
}

export default function ProfileDrawer({ isOpen, onClose, profile, userEmail, onSignOut, onEditProfile }: ProfileDrawerProps) {
    const { user, refreshProfile } = useAuth();
    const [activeModal, setActiveModal] = useState<'none' | 'password' | 'email'>('none');
    const [logoutModalOpen, setLogoutModalOpen] = useState(false);

    const isGoogleUser = user?.app_metadata?.provider === 'google' || user?.app_metadata?.providers?.includes('google');

    // Determine if user has a password set:
    // 1. Check profiles.has_password (from DB)
    // 2. Fallback: check if 'email' provider is in Supabase providers list
    const hasPassword = !!(
        profile?.has_password ||
        user?.app_metadata?.providers?.includes('email') ||
        user?.identities?.some((id: any) => id.provider === 'email')
    );

    // Password modal mode: 'set' if no password yet, 'change' if they have one
    const passwordMode = hasPassword ? 'change' : 'set';

    if (!isOpen) return null;

    // Generate initials for avatar placeholder
    const getInitials = () => {
        if (profile?.display_name) {
            return profile.display_name
                .split(' ')
                .map(n => n[0])
                .join('')
                .toUpperCase()
                .slice(0, 2);
        }
        if (profile?.username) return profile.username[0].toUpperCase();
        if (userEmail) return userEmail[0].toUpperCase();
        return '?';
    };

    return (
        <>
            <div className="fixed inset-0 z-[200] flex items-end justify-center">
                {/* Backdrop */}
                <div
                    className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                    onClick={onClose}
                    style={{ animation: 'drawerFadeIn 200ms ease-out' }}
                />

                {/* Drawer */}
                <div
                    className="relative w-full max-w-lg"
                    style={{ animation: 'drawerSlideUp 400ms cubic-bezier(0.16, 1, 0.3, 1)' }}
                >
                    {/* Glow effect */}
                    <div className="absolute -inset-x-4 -top-8 h-16 bg-gradient-to-t from-green-500/5 to-transparent blur-2xl pointer-events-none" />

                    <div className="relative bg-zinc-900/90 backdrop-blur-2xl border-t border-x border-white/10 rounded-t-3xl shadow-2xl overflow-hidden">
                        {/* Top edge light */}
                        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-40 h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent" />

                        {/* Drag handle */}
                        <div className="flex justify-center pt-3 pb-2">
                            <div className="w-10 h-1 rounded-full bg-white/20" />
                        </div>

                        {/* Close button */}
                        <button
                            onClick={onClose}
                            className="absolute top-3 right-4 p-1.5 rounded-full bg-white/5 hover:bg-white/10 transition-colors"
                        >
                            <X className="w-4 h-4 text-white/40" />
                        </button>

                        {/* Profile Content */}
                        <div className="px-6 pb-8 pt-2">
                            {/* Avatar + Info */}
                            <div className="flex items-center gap-4 mb-6">
                                {/* Avatar */}
                                <div className="relative">
                                    <div className="absolute -inset-1 bg-gradient-to-br from-green-500/20 to-blue-500/20 rounded-full blur-md" />
                                    {profile?.avatar_url ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                            src={profile.avatar_url}
                                            alt="Profile"
                                            className="relative w-16 h-16 rounded-full object-cover border-2 border-white/10 shadow-xl"
                                        />
                                    ) : (
                                        <div className="relative w-16 h-16 rounded-full bg-gradient-to-br from-green-500/20 to-blue-500/20 border-2 border-white/10 flex items-center justify-center shadow-xl">
                                            <span className="text-lg font-black text-white/80">{getInitials()}</span>
                                        </div>
                                    )}
                                    {/* Online indicator */}
                                    <div className="absolute bottom-0.5 right-0.5 w-3.5 h-3.5 rounded-full bg-green-500 border-2 border-zinc-900 shadow-lg" />
                                </div>

                                {/* Name + Username */}
                                <div className="flex-1 min-w-0">
                                    <h3 className="text-lg font-black text-white truncate">
                                        {profile?.display_name || profile?.username || 'Commuter'}
                                    </h3>
                                    {profile?.username && (
                                        <p className="text-sm text-white/40 truncate">@{profile.username}</p>
                                    )}
                                    {userEmail && (
                                        <p className="text-xs text-zinc-600 truncate mt-0.5">{userEmail}</p>
                                    )}
                                </div>
                            </div>

                            {/* Stats row */}
                            <div className="grid grid-cols-2 gap-3 mb-6">
                                <div className="bg-white/5 border border-white/5 rounded-xl px-4 py-3">
                                    <div className="text-[10px] uppercase text-white/30 font-bold tracking-wider mb-0.5">Member Since</div>
                                    <div className="text-sm font-bold text-white/80">
                                        {profile?.created_at
                                            ? new Date(profile.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
                                            : '—'}
                                    </div>
                                </div>
                                <div className="bg-white/5 border border-white/5 rounded-xl px-4 py-3">
                                    <div className="text-[10px] uppercase text-white/30 font-bold tracking-wider mb-0.5">Status</div>
                                    <div className="text-sm font-bold text-green-400 flex items-center gap-1.5">
                                        <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                                        Active
                                    </div>
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="space-y-3">
                                {/* Edit Profile Button */}
                                <button
                                    onClick={() => {
                                        onClose();
                                        onEditProfile();
                                    }}
                                    className="w-full flex items-center justify-center gap-2.5 py-3 px-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 text-white/80 font-semibold text-sm transition-all duration-200 active:scale-[0.98]"
                                >
                                    <Pencil className="w-4 h-4" />
                                    Edit Profile
                                </button>

                                {/* Change Password & Email */}
                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        onClick={() => setActiveModal('password')}
                                        className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 text-white/60 font-semibold text-xs transition-all duration-200 active:scale-[0.98]"
                                        title={hasPassword ? 'Change your password' : 'Set a password for your account'}
                                    >
                                        <KeyRound className="w-3.5 h-3.5" />
                                        Password
                                    </button>
                                    {!isGoogleUser && (
                                        <button
                                            onClick={() => setActiveModal('email')}
                                            className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 text-white/60 font-semibold text-xs transition-all duration-200 active:scale-[0.98]"
                                        >
                                            <Mail className="w-3.5 h-3.5" />
                                            Email
                                        </button>
                                    )}
                                </div>

                                {/* Sign Out Button */}
                                <button
                                    onClick={() => setLogoutModalOpen(true)}
                                    className="w-full flex items-center justify-center gap-2.5 py-3 px-4 rounded-xl bg-red-500/10 hover:bg-red-500/15 border border-red-500/10 text-red-400 font-semibold text-sm transition-all duration-200 active:scale-[0.98]"
                                >
                                    <LogOut className="w-4 h-4" />
                                    Sign Out
                                </button>

                                {/* TrainTracks branding */}
                                <div className="flex items-center justify-center gap-1.5 pt-2 opacity-20">
                                    <TrainFront className="w-3 h-3" />
                                    <span className="text-[9px] font-bold tracking-[0.2em] text-white uppercase">TrainTracks</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* CSS Keyframes */}
                <style jsx>{`
                    @keyframes drawerFadeIn {
                        from { opacity: 0; }
                        to { opacity: 1; }
                    }
                    @keyframes drawerSlideUp {
                        from {
                            opacity: 0;
                            transform: translateY(100%);
                        }
                        to {
                            opacity: 1;
                            transform: translateY(0);
                        }
                    }
                `}</style>
            </div>

            {/* Modals */}
            <ChangePasswordModal
                isOpen={activeModal === 'password'}
                onClose={() => setActiveModal('none')}
                userEmail={userEmail || ''}
                mode={passwordMode}
                onPasswordSet={() => {
                    console.log('[ProfileDrawer] Password set — refreshing profile');
                    refreshProfile();
                }}
            />
            <ChangeEmailModal
                isOpen={activeModal === 'email'}
                onClose={() => setActiveModal('none')}
                currentEmail={userEmail}
            />
            <LogoutModal
                isOpen={logoutModalOpen}
                onClose={() => setLogoutModalOpen(false)}
                onConfirm={async () => {
                    onSignOut();
                }}
            />
        </>
    );
}
