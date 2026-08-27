import 'server-only';

import type { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

export interface AdminContext {
    user: User;
    isAdmin: boolean;
}

export async function getAdminContext(): Promise<AdminContext | null> {
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return null;

    const { data, error } = await supabase.rpc('current_user_is_admin');
    if (error) {
        console.error('[AdminAuth] Role verification failed:', error.message);
        return { user, isAdmin: false };
    }

    return { user, isAdmin: data === true };
}
