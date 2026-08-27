'use client';

import { useEffect, useSyncExternalStore } from 'react';
import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';

export interface UserProfile {
    id: string;
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
    phone: string | null;
    is_admin: boolean;
    has_password: boolean;
    created_at: string;
    updated_at: string;
}

type ProfileStatus = 'idle' | 'loading' | 'ready' | 'missing' | 'error';

interface AuthSnapshot {
    user: User | null;
    profile: UserProfile | null;
    profileStatus: ProfileStatus;
    profileError: string | null;
    loading: boolean;
}

type SafeProfileUpdate = Pick<UserProfile, 'username' | 'display_name' | 'avatar_url' | 'phone' | 'has_password'>;

const NEW_USER_SETUP_WINDOW_MS = 48 * 60 * 60 * 1000;
const PROFILE_UPDATED_EVENT = 'traintracks:profile-updated';
const PUBLIC_PROFILE_COLUMNS = 'id,username,display_name,avatar_url,created_at,updated_at';
const supabase = createClient();
const listeners = new Set<() => void>();
const serverSnapshot: AuthSnapshot = {
    user: null,
    profile: null,
    profileStatus: 'idle',
    profileError: null,
    loading: true,
};

let snapshot: AuthSnapshot = {
    user: null,
    profile: null,
    profileStatus: 'idle',
    profileError: null,
    loading: true,
};
let initialized = false;
let profileEventBound = false;
let authSubscription: { unsubscribe: () => void } | null = null;
let initialSessionHandled = false;
let authQueue: Promise<void> = Promise.resolve();

function publish(patch: Partial<AuthSnapshot>) {
    snapshot = { ...snapshot, ...patch };
    listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

function getSnapshot() {
    return snapshot;
}

function getServerSnapshot() {
    return serverSnapshot;
}

function isFreshAccount(user: User | null, profile: UserProfile | null): boolean {
    const createdAt = profile?.created_at || user?.created_at;
    if (!createdAt) return false;

    const createdMs = new Date(createdAt).getTime();
    return Number.isFinite(createdMs) && Date.now() - createdMs <= NEW_USER_SETUP_WINDOW_MS;
}

async function fetchProfile(user: User) {
    publish({ profileStatus: 'loading', profileError: null });

    const loadPublicProfile = () => supabase
        .from('profiles')
        .select(PUBLIC_PROFILE_COLUMNS)
        .eq('id', user.id)
        .maybeSingle();

    let publicResult = await loadPublicProfile();
    if (publicResult.error) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        publicResult = await loadPublicProfile();
    }

    if (publicResult.error) {
        publish({
            profile: null,
            profileStatus: 'error',
            profileError: publicResult.error.message,
        });
        return;
    }

    if (!publicResult.data) {
        publish({
            profile: null,
            profileStatus: 'missing',
            profileError: null,
        });
        return;
    }

    const [privateResult, roleResult] = await Promise.all([
        supabase
            .from('profile_private')
            .select('phone,has_password')
            .eq('user_id', user.id)
            .maybeSingle(),
        supabase
            .from('user_roles')
            .select('role')
            .eq('user_id', user.id)
            .maybeSingle(),
    ]);

    const providerHasPassword = user.app_metadata?.provider === 'email';
    const hasPassword = privateResult.data?.has_password === true || providerHasPassword;

    if (providerHasPassword && privateResult.data && !privateResult.data.has_password) {
        void supabase
            .from('profile_private')
            .update({ has_password: true, updated_at: new Date().toISOString() })
            .eq('user_id', user.id);
    }

    const publicProfile = publicResult.data;
    publish({
        profile: {
            id: publicProfile.id,
            username: publicProfile.username,
            display_name: publicProfile.display_name,
            avatar_url: publicProfile.avatar_url,
            phone: privateResult.data?.phone ?? null,
            is_admin: roleResult.data?.role === 'admin',
            has_password: hasPassword,
            created_at: publicProfile.created_at ?? user.created_at,
            updated_at: publicProfile.updated_at ?? publicProfile.created_at ?? user.created_at,
        },
        profileStatus: 'ready',
        profileError: null,
    });
}

async function handleAuthState(event: AuthChangeEvent, session: Session | null) {
    const user = session?.user ?? null;

    if (event === 'SIGNED_OUT' || !user) {
        publish({
            user: null,
            profile: null,
            profileStatus: 'idle',
            profileError: null,
            loading: false,
        });
        return;
    }

    if (event === 'TOKEN_REFRESHED' && snapshot.user?.id === user.id) {
        publish({ user, loading: false });
        return;
    }

    publish({ user, loading: true });
    await fetchProfile(user);
    publish({ loading: false });
}

function bindProfileEvent() {
    if (profileEventBound || typeof window === 'undefined') return;
    profileEventBound = true;
    window.addEventListener(PROFILE_UPDATED_EVENT, () => {
        if (snapshot.user) void fetchProfile(snapshot.user);
    });
}

function ensureInitialized() {
    if (initialized || typeof window === 'undefined') return;
    initialized = true;
    bindProfileEvent();

    const enqueueAuthState = (event: AuthChangeEvent, session: Session | null) => {
        authQueue = authQueue
            .then(() => handleAuthState(event, session))
            .catch((error: unknown) => {
                console.error('[Auth] Session update failed:', error);
                publish({
                    loading: false,
                    profileStatus: 'error',
                    profileError: 'Unable to restore session.',
                });
            });
    };

    const { data } = supabase.auth.onAuthStateChange((event: AuthChangeEvent, session: Session | null) => {
        const initialStateWasHandled = initialSessionHandled;
        initialSessionHandled = true;
        if (event === 'INITIAL_SESSION' && initialStateWasHandled) return;
        queueMicrotask(() => enqueueAuthState(event, session));
    });
    authSubscription = data.subscription;

    void supabase.auth.getSession()
        .then(({ data: sessionData }: { data: { session: Session | null } }) => {
            if (initialSessionHandled) return;
            initialSessionHandled = true;
            enqueueAuthState('INITIAL_SESSION', sessionData.session);
        })
        .catch((error: unknown) => {
            if (initialSessionHandled) return;
            initialSessionHandled = true;
            console.error('[Auth] Initial session failed:', error);
            publish({
                loading: false,
                profileStatus: 'error',
                profileError: 'Unable to restore session.',
            });
        });
}
async function refreshProfile() {
    if (snapshot.user) await fetchProfile(snapshot.user);
}

async function signOut() {
    try {
        await Promise.race([
            supabase.auth.signOut({ scope: 'local' }),
            new Promise((resolve) => setTimeout(resolve, 2000)),
        ]);
    } catch (error) {
        console.warn('[Auth] Sign out failed; clearing local state:', error);
    }

    publish({
        user: null,
        profile: null,
        profileStatus: 'idle',
        profileError: null,
        loading: false,
    });
    window.location.reload();
}

async function updateProfile(updates: Partial<UserProfile>) {
    const user = snapshot.user;
    if (!user) return { error: 'Not authenticated' };

    const now = new Date().toISOString();
    const publicUpdates: Partial<SafeProfileUpdate> = {};
    const privateUpdates: Partial<SafeProfileUpdate> = {};

    if ('username' in updates) publicUpdates.username = updates.username ?? null;
    if ('display_name' in updates) publicUpdates.display_name = updates.display_name ?? null;
    if ('avatar_url' in updates) publicUpdates.avatar_url = updates.avatar_url ?? null;
    if ('phone' in updates) privateUpdates.phone = updates.phone ?? null;
    if ('has_password' in updates) privateUpdates.has_password = updates.has_password === true;

    const operations: Array<PromiseLike<{ error: { message: string } | null }>> = [];
    if (Object.keys(publicUpdates).length > 0) {
        operations.push(
            supabase
                .from('profiles')
                .upsert({ id: user.id, ...publicUpdates, updated_at: now }),
        );
    }
    if (Object.keys(privateUpdates).length > 0) {
        operations.push(
            supabase
                .from('profile_private')
                .upsert({ user_id: user.id, ...privateUpdates, updated_at: now }),
        );
    }

    const results = await Promise.all(operations);
    const error = results.find((result) => result.error)?.error ?? null;
    if (!error) {
        await fetchProfile(user);
        window.dispatchEvent(new Event(PROFILE_UPDATED_EVENT));
    }

    return { error: error?.message ?? null };
}

async function uploadAvatar(file: File) {
    const user = snapshot.user;
    if (!user) return { url: null, error: 'Not authenticated' };

    const extension = file.name.split('.').pop()?.toLowerCase() || 'webp';
    const fileName = `${user.id}/avatar.${extension}`;
    const { error } = await supabase.storage
        .from('avatars')
        .upload(fileName, file, { upsert: true });

    if (error) return { url: null, error: error.message };

    const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(fileName);

    const update = await updateProfile({ avatar_url: publicUrl });
    return { url: update.error ? null : publicUrl, error: update.error };
}

export function useAuth() {
    const current = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

    useEffect(() => {
        ensureInitialized();
    }, []);

    const needsSetup = !current.loading && !!current.user && (
        (current.profileStatus === 'missing' && isFreshAccount(current.user, null))
        || (current.profileStatus === 'ready'
            && !current.profile?.username
            && isFreshAccount(current.user, current.profile))
    );

    return {
        ...current,
        signOut,
        updateProfile,
        uploadAvatar,
        refreshProfile,
        isAuthenticated: !!current.user,
        needsSetup,
    };
}

export function disposeAuthRuntimeForTests() {
    authSubscription?.unsubscribe();
    authSubscription = null;
    initialized = false;
    initialSessionHandled = false;
    authQueue = Promise.resolve();
}
