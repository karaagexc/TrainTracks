import { TRAIN_PRESENCE_CHANNEL, TRAIN_PRESENCE_EVENT } from '@/domain/crowd/constants';
import type { TrainPresence } from '@/types/train';

export interface CrowdBroadcastResult {
    ok: boolean;
    status: number;
    code: 'ok' | 'supabase_not_configured' | 'broadcast_failed';
    message: string;
}

type EnvLike = Record<string, string | undefined>;
type FetchLike = typeof fetch;

function getBroadcastConfig(env: EnvLike = process.env): { url: string; key: string } | null {
    const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
    const key = env.SUPABASE_SERVICE_ROLE_KEY
        ?? env.SUPABASE_SECRET_KEY
        ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !key) return null;
    return {
        url: `${supabaseUrl.replace(/\/$/, '')}/realtime/v1/api/broadcast`,
        key,
    };
}

export async function broadcastCrowdPresence(
    train: TrainPresence,
    options: { env?: EnvLike; fetchImpl?: FetchLike } = {},
): Promise<CrowdBroadcastResult> {
    const config = getBroadcastConfig(options.env);
    if (!config) {
        return {
            ok: false,
            status: 503,
            code: 'supabase_not_configured',
            message: 'Supabase broadcast is not configured.',
        };
    }

    const fetchImpl = options.fetchImpl ?? fetch;
    const response = await fetchImpl(config.url, {
        method: 'POST',
        headers: {
            apikey: config.key,
            Authorization: `Bearer ${config.key}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            messages: [{
                topic: TRAIN_PRESENCE_CHANNEL,
                event: TRAIN_PRESENCE_EVENT,
                payload: train,
            }],
        }),
    });

    if (!response.ok) {
        const detail = await response.text().catch(() => '');
        return {
            ok: false,
            status: response.status || 502,
            code: 'broadcast_failed',
            message: detail || 'Supabase Realtime broadcast failed.',
        };
    }

    return {
        ok: true,
        status: response.status || 202,
        code: 'ok',
        message: 'Crowd presence broadcast.',
    };
}
