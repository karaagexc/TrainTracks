import type { SupabaseClient } from '@supabase/supabase-js';

export const PUBLIC_PROFILE_COLUMNS = 'id,username,display_name,avatar_url,created_at,updated_at';
export type PublicProfileEdit = { username?: string | null; display_name?: string | null; avatar_url?: string | null };

export async function writePublicProfile(client: Pick<SupabaseClient, 'from'>, userId: string, updates: PublicProfileEdit) {
    const existing = await client.from('profiles').select('id').eq('id', userId).maybeSingle();
    if (existing.error) return { error: existing.error.message };
    const update = () => client.from('profiles').update(updates).eq('id', userId).select(PUBLIC_PROFILE_COLUMNS).single();
    let result = existing.data ? await update()
        : await client.from('profiles').insert({ id: userId, ...updates }).select(PUBLIC_PROFILE_COLUMNS).single();
    // A simultaneous onboarding request may have inserted the owner's row first.
    if (!existing.data && result.error?.code === '23505') result = await update();
    return { error: result.error?.message ?? (!result.data ? 'Profile write was not acknowledged.' : null) };
}
