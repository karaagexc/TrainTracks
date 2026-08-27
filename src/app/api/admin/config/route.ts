import { NextRequest, NextResponse } from 'next/server';
import { getAdminContext } from '@/domain/auth/admin';
import { noStoreHeaders } from '@/domain/predictions/http';
import { createAdminClient, hasAdminSupabaseConfig } from '@/lib/supabase/admin';

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

    const { data, error } = await createAdminClient()
        .from('app_config')
        .select('id,maintenance_mode,maintenance_message,congestion_config,updated_at')
        .eq('id', 1)
        .single();

    return NextResponse.json({ ok: !error, config: data ?? null, error: error?.message ?? null }, {
        status: error ? 500 : 200,
        headers: noStoreHeaders(),
    });
}

export async function PATCH(request: NextRequest) {
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

    const payload = await request.json().catch(() => null) as Record<string, unknown> | null;
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (typeof payload?.maintenanceMode === 'boolean') {
        updates.maintenance_mode = payload.maintenanceMode;
    }
    if (typeof payload?.maintenanceMessage === 'string' || payload?.maintenanceMessage === null) {
        updates.maintenance_message = typeof payload.maintenanceMessage === 'string'
            ? payload.maintenanceMessage.trim().slice(0, 240)
            : null;
    }
    if (payload?.congestionConfig && typeof payload.congestionConfig === 'object') {
        updates.congestion_config = payload.congestionConfig;
    }

    const { data, error } = await createAdminClient()
        .from('app_config')
        .update(updates)
        .eq('id', 1)
        .select('id,maintenance_mode,maintenance_message,congestion_config,updated_at')
        .single();

    return NextResponse.json({ ok: !error, config: data ?? null, error: error?.message ?? null }, {
        status: error ? 500 : 200,
        headers: noStoreHeaders(),
    });
}
