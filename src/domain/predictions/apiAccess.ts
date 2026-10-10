import { createHash, timingSafeEqual } from 'node:crypto';
import type { PostgrestError } from '@supabase/supabase-js';
import { createAdminClient, hasAdminSupabaseConfig } from '@/lib/supabase/admin';
import { publicApiTokenHasScope, type PublicApiScope } from '@/domain/predictions/apiScopes';
import { getServerApiConfiguration, publicApiConfigurationAccess } from './serverConfig';
import { isPublicPredictionUrl } from './http';

export interface PredictionApiAccessResult {
    ok: boolean;
    status: number;
    code:
        | 'ok'
        | 'api_tokens_not_configured'
        | 'missing_api_token'
        | 'invalid_api_token'
        | 'origin_not_allowed'
        | 'insufficient_scope'
        | 'api_config_unavailable'
        | 'public_api_disabled';
    message: string;
    tokenId?: string | null;
    allowedOrigins?: string[];
    scopes?: string[];
}

type EnvLike = Record<string, string | undefined>;
const lastUsageWrites = new Map<string, number>();
const usageWritesInFlight = new Map<string, Promise<void>>();

async function recordTokenUsage(admin: ReturnType<typeof createAdminClient>, tokenId: string) {
    const active = usageWritesInFlight.get(tokenId);
    if (active) return active;
    const now = Date.now();
    if (now - (lastUsageWrites.get(tokenId) ?? 0) < 60_000) return;
    const write = (async () => {
        try {
            const { error } = await admin.from('api_tokens')
                .update({ last_used_at: new Date(now).toISOString() }).eq('id', tokenId);
            if (!error) {
                if (lastUsageWrites.size >= 1000) lastUsageWrites.delete(lastUsageWrites.keys().next().value!);
                lastUsageWrites.set(tokenId, now);
            }
        } catch { /* Telemetry failure must not revoke otherwise valid access. */ }
    })();
    usageWritesInFlight.set(tokenId, write);
    try { await write; } finally { usageWritesInFlight.delete(tokenId); }
}

function splitCsv(value: string | undefined): string[] {
    return (value ?? '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
}

function normalizeOrigin(value: string | null | undefined): string | null {
    if (!value) return null;
    try {
        const url = new URL(value.includes('://') ? value : `https://${value}`);
        if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
        return url.origin;
    } catch {
        return null;
    }
}

function requestOriginAllowed(headers: Headers, url: URL | undefined, env: EnvLike, corsOrigin?: string, allowWildcard = false): boolean {
    const rawOrigin = headers.get('origin');
    if (!rawOrigin) return true;
    const origin = normalizeOrigin(rawOrigin);
    if (!origin || rawOrigin !== origin) return false;
    if (url && origin === url.origin) return true;
    if (allowWildcard && corsOrigin === '*' && isPublicPredictionUrl(url)) return true;

    const configured = new Set([
        normalizeOrigin(env.NEXT_PUBLIC_SITE_URL),
        normalizeOrigin(env.VERCEL_URL),
        normalizeOrigin(env.VERCEL_PROJECT_PRODUCTION_URL),
        ...splitCsv(env.TRAINTRACKS_PUBLIC_API_ORIGINS).map(normalizeOrigin),
        corsOrigin && corsOrigin !== '*' ? normalizeOrigin(corsOrigin) : null,
    ].filter((candidate): candidate is string => Boolean(candidate)));
    if (configured.has(origin)) return true;
    return env.NODE_ENV !== 'production'
        && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
}

function tokenOriginAllowed(headers: Headers, allowedOrigins: string[]): boolean {
    const rawOrigin = headers.get('origin');
    if (!rawOrigin || allowedOrigins.length === 0) return true;
    const origin = normalizeOrigin(rawOrigin);
    if (!origin) return false;
    return allowedOrigins.some((candidate) => normalizeOrigin(candidate) === origin);
}

function safeEqual(left: string, right: string): boolean {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);
    return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function hashPredictionApiToken(value: string): string {
    return createHash('sha256').update(value).digest('hex');
}

export function extractPredictionApiToken(headers: Headers): string | null {
    const authorization = headers.get('authorization')?.trim();
    if (authorization?.toLowerCase().startsWith('bearer ')) {
        const token = authorization.slice(7).trim();
        if (token) return token;
    }

    const headerToken = headers.get('x-api-key')?.trim();
    return headerToken || null;
}

export async function verifyPredictionApiAccess({
    headers,
    url,
    requiredScope,
    env = process.env,
}: {
    headers: Headers;
    url?: URL;
    requiredScope?: PublicApiScope;
    env?: EnvLike;
}): Promise<PredictionApiAccessResult> {
    const configuration = await getServerApiConfiguration();
    const corsOrigin = configuration.status === 'ready' ? configuration.config?.api_config.corsOrigin : undefined;
    const originAllowed = requestOriginAllowed(headers, url, env, corsOrigin);
    const unrestrictedOriginAllowed = requestOriginAllowed(headers, url, env, corsOrigin, requiredScope === 'predictions:read');
    if (!unrestrictedOriginAllowed) {
        return {
            ok: false,
            status: 403,
            code: 'origin_not_allowed',
            message: 'This browser origin is not allowed to use the public API.',
        };
    }

    const rawTokens = splitCsv(env.TRAINTRACKS_PUBLIC_API_TOKENS ?? env.PREDICTION_API_TOKENS);
    const hashTokens = splitCsv(env.TRAINTRACKS_PUBLIC_API_TOKEN_HASHES ?? env.PREDICTION_API_TOKEN_HASHES)
        .map((token) => token.toLowerCase());
    const databaseConfigured = hasAdminSupabaseConfig();

    if (rawTokens.length === 0 && hashTokens.length === 0 && !databaseConfigured) {
        return {
            ok: false,
            status: 503,
            code: 'api_tokens_not_configured',
            message: 'Public prediction API tokens are not configured.',
        };
    }

    const token = extractPredictionApiToken(headers);
    if (!token) {
        return {
            ok: false,
            status: 401,
            code: 'missing_api_token',
            message: 'Provide a Bearer token or x-api-key header.',
        };
    }

    const tokenHash = hashPredictionApiToken(token).toLowerCase();
    const rawMatch = rawTokens.some((candidate) => safeEqual(candidate, token));
    const hashMatch = hashTokens.some((candidate) => safeEqual(candidate, tokenHash));

    if (rawMatch || hashMatch) {
        const gate = publicApiConfigurationAccess(configuration);
        if (!gate.ok) return gate;
        return {
            ok: true,
            status: 200,
            code: 'ok',
            message: 'Authorized.',
            tokenId: null,
            allowedOrigins: [],
            scopes: ['*'],
        };
    }

    let databaseError: PostgrestError | null = null;
    if (databaseConfigured) {
        const admin = createAdminClient();
        const { data, error } = await admin
            .from('api_tokens')
            .select('id,allowed_origins,scopes,expires_at')
            .eq('token_hash', tokenHash)
            .eq('is_active', true)
            .maybeSingle();
        databaseError = error;

        const expired = data?.expires_at
            ? new Date(data.expires_at).getTime() <= Date.now()
            : false;
        if (data && !expired) {
            const allowedOrigins = data.allowed_origins ?? [];
            if ((!originAllowed && allowedOrigins.length > 0) || !tokenOriginAllowed(headers, allowedOrigins)) {
                return {
                    ok: false,
                    status: 403,
                    code: 'origin_not_allowed',
                    message: 'This API token is not valid for the requesting origin.',
                };
            }

            const scopes = data.scopes ?? [];
            if (!publicApiTokenHasScope(scopes, requiredScope)) {
                return {
                    ok: false,
                    status: 403,
                    code: 'insufficient_scope',
                    message: `This API token requires the ${requiredScope} scope.`,
                };
            }

            const gate = publicApiConfigurationAccess(configuration);
            if (!gate.ok) return gate;
            await recordTokenUsage(admin, data.id);

            return {
                ok: true,
                status: 200,
                code: 'ok',
                message: 'Authorized.',
                tokenId: data.id,
                allowedOrigins,
                scopes,
            };
        }
    }

    if (databaseError && rawTokens.length === 0 && hashTokens.length === 0) {
        console.error('[PublicApi] Token lookup failed:', databaseError.message);
        return {
            ok: false,
            status: 503,
            code: 'api_tokens_not_configured',
            message: 'Public API token storage is unavailable.',
        };
    }

    return {
        ok: false,
        status: 401,
        code: 'invalid_api_token',
        message: 'The supplied prediction API token is invalid.',
    };
}
