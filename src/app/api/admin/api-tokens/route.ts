import { randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getAdminContext } from '@/domain/auth/admin';
import { hashPredictionApiToken } from '@/domain/predictions/apiAccess';
import { isPublicApiScope, normalizePublicApiScopes, type PublicApiScope } from '@/domain/predictions/apiScopes';
import { noStoreHeaders } from '@/domain/predictions/http';
import { createAdminClient, hasAdminSupabaseConfig } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const DEFAULT_SCOPES: PublicApiScope[] = ['predictions:read'];

function unavailable() {
    return NextResponse.json({ ok: false, error: 'server_not_configured' }, {
        status: 503,
        headers: noStoreHeaders(),
    });
}

async function authorize() {
    const context = await getAdminContext();
    return context?.isAdmin ? context : null;
}

export async function GET() {
    if (!await authorize()) {
        return NextResponse.json({ ok: false, error: 'forbidden' }, {
            status: 403,
            headers: noStoreHeaders(),
        });
    }
    if (!hasAdminSupabaseConfig()) return unavailable();

    const admin = createAdminClient();
    const { data, error } = await admin
        .from('api_tokens')
        .select('id,name,token_prefix,scopes,allowed_origins,is_active,expires_at,last_used_at,created_at,updated_at')
        .order('created_at', { ascending: false });

    return NextResponse.json({
        ok: !error,
        tokens: data ?? [],
        error: error?.message ?? null,
    }, {
        status: error ? 500 : 200,
        headers: noStoreHeaders(),
    });
}

export async function POST(request: NextRequest) {
    const context = await authorize();
    if (!context) {
        return NextResponse.json({ ok: false, error: 'forbidden' }, {
            status: 403,
            headers: noStoreHeaders(),
        });
    }
    if (!hasAdminSupabaseConfig()) return unavailable();

    const payload = await request.json().catch(() => null) as Record<string, unknown> | null;
    const name = typeof payload?.name === 'string' ? payload.name.trim().slice(0, 80) : '';
    if (!name) {
        return NextResponse.json({ ok: false, error: 'invalid_name' }, {
            status: 400,
            headers: noStoreHeaders(),
        });
    }

    if (Array.isArray(payload?.scopes) && (
        payload.scopes.length === 0 ||
        !payload.scopes.every(isPublicApiScope)
    )) {
        return NextResponse.json({ ok: false, error: 'invalid_scopes' }, {
            status: 400,
            headers: noStoreHeaders(),
        });
    }
    const scopes = Array.isArray(payload?.scopes)
        ? normalizePublicApiScopes(payload.scopes)
        : DEFAULT_SCOPES;
    const allowedOrigins = Array.isArray(payload?.allowedOrigins)
        ? payload.allowedOrigins
            .filter((origin): origin is string => typeof origin === 'string')
            .map((origin) => origin.trim())
            .filter((origin) => /^https?:\/\//i.test(origin))
            .slice(0, 20)
        : [];
    const expiresAt = typeof payload?.expiresAt === 'string'
        && Number.isFinite(new Date(payload.expiresAt).getTime())
        ? new Date(payload.expiresAt).toISOString()
        : null;

    const rawToken = `tt_live_${randomBytes(24).toString('base64url')}`;
    const admin = createAdminClient();
    const { data, error } = await admin
        .from('api_tokens')
        .insert({
            name,
            token_hash: hashPredictionApiToken(rawToken),
            token_prefix: rawToken.slice(0, 16),
            scopes,
            allowed_origins: allowedOrigins,
            expires_at: expiresAt,
            created_by: context.user.id,
        })
        .select('id,name,token_prefix,scopes,allowed_origins,is_active,expires_at,created_at')
        .single();

    return NextResponse.json({
        ok: !error,
        token: error ? null : rawToken,
        record: data ?? null,
        error: error?.message ?? null,
    }, {
        status: error ? 500 : 201,
        headers: noStoreHeaders(),
    });
}
