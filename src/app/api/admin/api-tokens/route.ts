import { randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getAdminContext } from '@/domain/auth/admin';
import { hashPredictionApiToken } from '@/domain/predictions/apiAccess';
import { validateTokenEdit } from '@/domain/auth/token';
import { isSameOriginMutation } from '@/domain/auth/request';
import { noStoreHeaders } from '@/domain/predictions/http';
import { createAdminClient, hasAdminSupabaseConfig } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';


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
    if (!isSameOriginMutation(request)) return NextResponse.json({ ok: false, error: 'forbidden_origin' }, { status: 403, headers: noStoreHeaders() });
    const context = await authorize();
    if (!context) {
        return NextResponse.json({ ok: false, error: 'forbidden' }, {
            status: 403,
            headers: noStoreHeaders(),
        });
    }
    if (!hasAdminSupabaseConfig()) return unavailable();

    const payload: unknown = await request.json().catch(() => null);
    const validated = validateTokenEdit(payload, true);
    if (!validated.ok) return NextResponse.json({ ok: false, error: validated.error }, { status: 400, headers: noStoreHeaders() });

    const rawToken = `tt_live_${randomBytes(24).toString('base64url')}`;
    const admin = createAdminClient();
    const { data, error } = await admin
        .from('api_tokens')
        .insert({
            ...validated.value,
            token_hash: hashPredictionApiToken(rawToken),
            token_prefix: rawToken.slice(0, 16),
            created_by: context.user.id,
        })
        .select('id,name,token_prefix,scopes,allowed_origins,is_active,expires_at,created_at')
        .single();

    return NextResponse.json({
        ok: !error && !!data,
        token: error || !data ? null : rawToken,
        record: data ?? null,
        error: error?.message ?? (!data ? 'Token write was not acknowledged.' : null),
    }, {
        status: error || !data ? 500 : 201,
        headers: noStoreHeaders(),
    });
}
