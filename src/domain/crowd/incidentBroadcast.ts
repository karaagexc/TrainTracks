import {
    INCIDENT_CHANNEL,
    type IncidentEventPayload,
} from '@/domain/crowd/incidentAggregator';

export interface IncidentBroadcastResult {
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

export async function broadcastIncidentEvent(
    eventPayload: IncidentEventPayload,
    options: { env?: EnvLike; fetchImpl?: FetchLike } = {},
): Promise<IncidentBroadcastResult> {
    const config = getBroadcastConfig(options.env);
    if (!config) {
        return {
            ok: false,
            status: 503,
            code: 'supabase_not_configured',
            message: 'Supabase incident broadcast is not configured.',
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
                topic: INCIDENT_CHANNEL,
                event: eventPayload.event,
                payload: eventPayload,
            }],
        }),
    });

    if (!response.ok) {
        const detail = await response.text().catch(() => '');
        return {
            ok: false,
            status: response.status || 502,
            code: 'broadcast_failed',
            message: detail || 'Supabase Realtime incident broadcast failed.',
        };
    }

    return {
        ok: true,
        status: response.status || 202,
        code: 'ok',
        message: 'Incident broadcast.',
    };
}
