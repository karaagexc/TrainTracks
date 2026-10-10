import { NextRequest, NextResponse } from 'next/server';
import { getAdminContext } from '@/domain/auth/admin';
import { noStoreHeaders } from '@/domain/predictions/http';
import { createAdminClient, hasAdminSupabaseConfig } from '@/lib/supabase/admin';
import { APP_CONFIG_COLUMNS, isRecord, readAppConfig, parseAppConfig, validateApiConfig, validateCongestionConfig } from '@/domain/config';
import { isSameOriginMutation } from '@/domain/auth/request';

export const dynamic = 'force-dynamic';

async function authorized() {
    const context = await getAdminContext();
    return context?.isAdmin === true;
}

export async function GET() {
    if (!await authorized()) {
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

    const result = await readAppConfig(createAdminClient());

    return NextResponse.json({ ok: result.status === 'ready', ...result }, {
        status: result.status === 'error' ? 503 : 200,
        headers: noStoreHeaders(),
    });
}

export async function PATCH(request: NextRequest) {
    if (!isSameOriginMutation(request)) return NextResponse.json({ ok: false, error: 'forbidden_origin' }, { status: 403, headers: noStoreHeaders() });
    if (!await authorized()) {
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

    const payload: unknown = await request.json().catch(() => null);
    const invalid = (error: string) => NextResponse.json({ ok: false, error }, { status: 400, headers: noStoreHeaders() });
    const fields = ['maintenanceMode', 'maintenanceMessage', 'congestionConfig', 'apiConfig', 'publicApiEnabled'];
    if (!isRecord(payload) || !Object.keys(payload).length || Object.keys(payload).some(key => !fields.includes(key))) {
        return invalid('Invalid or empty configuration edit.');
    }
    const updates: Record<string, unknown> = {};
    if ('maintenanceMode' in payload) {
        if (typeof payload.maintenanceMode !== 'boolean') return invalid('maintenanceMode must be boolean.');
        updates.maintenance_mode = payload.maintenanceMode;
    }
    if ('maintenanceMessage' in payload) {
        if (payload.maintenanceMessage !== null && (typeof payload.maintenanceMessage !== 'string' || payload.maintenanceMessage.length > 240)) {
            return invalid('maintenanceMessage must be null or at most 240 characters.');
        }
        updates.maintenance_message = typeof payload.maintenanceMessage === 'string'
            ? payload.maintenanceMessage.trim()
            : null;
    }
    if ('congestionConfig' in payload) {
        const validated = validateCongestionConfig(payload.congestionConfig);
        if (!validated.ok) return invalid(validated.error);
        updates.congestion_config = validated.value;
    }
    if ('apiConfig' in payload) {
        const validated = validateApiConfig(payload.apiConfig);
        if (!validated.ok) return invalid(validated.error);
        updates.api_config = validated.value;
    }
    if ('publicApiEnabled' in payload) {
        if (typeof payload.publicApiEnabled !== 'boolean') return invalid('publicApiEnabled must be boolean.');
        updates.public_api_enabled = payload.publicApiEnabled;
    }

    const { data, error } = await createAdminClient()
        .from('app_config')
        .update(updates)
        .eq('id', 1)
        .select(APP_CONFIG_COLUMNS)
        .single();

    const result = error ? { status: 'error', config: null, error: error.message } : parseAppConfig(data);
    return NextResponse.json({ ok: result.status === 'ready', ...result }, {
        status: result.status === 'ready' ? 200 : 503,
        headers: noStoreHeaders(),
    });
}
