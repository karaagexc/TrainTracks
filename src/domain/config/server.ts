import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { readAppConfig, type ConfigLoadResult } from './index';

export async function loadServerConfig(): Promise<ConfigLoadResult> {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return { status: 'error', config: null, error: 'server_not_configured' };
    return readAppConfig(createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }));
}
