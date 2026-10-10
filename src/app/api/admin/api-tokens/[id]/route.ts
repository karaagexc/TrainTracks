import { NextRequest, NextResponse } from 'next/server';
import { getAdminContext } from '@/domain/auth/admin';
import { noStoreHeaders } from '@/domain/predictions/http';
import { validateTokenEdit } from '@/domain/auth/token';
import { isSameOriginMutation } from '@/domain/auth/request';
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
    if (!isSameOriginMutation(request)) return NextResponse.json({ ok: false, error: 'forbidden_origin' }, { status: 403, headers: noStoreHeaders() });
    const denied = await guard();
    if (denied) return denied;

    const { id } = await params;
    const payload: unknown = await request.json().catch(() => null);
    const validated = validateTokenEdit(payload);
    if (!validated.ok) return NextResponse.json({ ok: false, error: validated.error }, { status: 400, headers: noStoreHeaders() });

    const admin = createAdminClient();
    const { data, error } = await admin
        .from('api_tokens')
        .update(validated.value)
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
    if (!isSameOriginMutation(_request)) return NextResponse.json({ ok: false, error: 'forbidden_origin' }, { status: 403, headers: noStoreHeaders() });
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
