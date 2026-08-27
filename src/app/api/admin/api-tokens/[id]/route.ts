import { NextRequest, NextResponse } from 'next/server';
import { getAdminContext } from '@/domain/auth/admin';
import { noStoreHeaders } from '@/domain/predictions/http';
import { isPublicApiScope, normalizePublicApiScopes } from '@/domain/predictions/apiScopes';
import { createAdminClient, hasAdminSupabaseConfig } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

async function guard() {
    const context = await getAdminContext();
    if (!context?.isAdmin) {
        return NextResponse.json({ ok: false, error: 'forbidden' }, {
            status: 403,
            headers: noStoreHeaders(),
        });
    }
    if (!hasAdminSupabaseConfig()) {
        return NextResponse.json({ ok: false, error: 'server_not_configured' }, {
            status: 503,
            headers: noStoreHeaders(),
        });
    }
    return null;
}

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const denied = await guard();
    if (denied) return denied;

    const { id } = await params;
    const payload = await request.json().catch(() => null) as Record<string, unknown> | null;
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (typeof payload?.name === 'string' && payload.name.trim()) {
        updates.name = payload.name.trim().slice(0, 80);
    }
    if (typeof payload?.isActive === 'boolean') {
        updates.is_active = payload.isActive;
    }
    if (Array.isArray(payload?.scopes)) {
        if (payload.scopes.length === 0 || !payload.scopes.every(isPublicApiScope)) {
            return NextResponse.json({ ok: false, error: 'invalid_scopes' }, {
                status: 400,
                headers: noStoreHeaders(),
            });
        }
        updates.scopes = normalizePublicApiScopes(payload.scopes);
    }
    if (Array.isArray(payload?.allowedOrigins)) {
        updates.allowed_origins = payload.allowedOrigins
            .filter((origin): origin is string => typeof origin === 'string')
            .map((origin) => origin.trim())
            .filter((origin) => /^https?:\/\//i.test(origin))
            .slice(0, 20);
    }

    const admin = createAdminClient();
    const { data, error } = await admin
        .from('api_tokens')
        .update(updates)
        .eq('id', id)
        .select('id,name,token_prefix,scopes,allowed_origins,is_active,expires_at,last_used_at,updated_at')
        .maybeSingle();

    return NextResponse.json({ ok: !error && !!data, token: data ?? null, error: error?.message ?? null }, {
        status: error ? 500 : data ? 200 : 404,
        headers: noStoreHeaders(),
    });
}

export async function DELETE(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const denied = await guard();
    if (denied) return denied;

    const { id } = await params;
    const admin = createAdminClient();
    const { error, count } = await admin
        .from('api_tokens')
        .delete({ count: 'exact' })
        .eq('id', id);

    return NextResponse.json({ ok: !error && (count ?? 0) > 0, error: error?.message ?? null }, {
        status: error ? 500 : (count ?? 0) > 0 ? 200 : 404,
        headers: noStoreHeaders(),
    });
}
