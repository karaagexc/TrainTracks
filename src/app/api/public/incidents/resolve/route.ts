import { NextRequest, NextResponse } from 'next/server';
import { resolveDurableIncident } from '@/domain/crowd/durableIncidents';
import { verifyPredictionApiAccess } from '@/domain/predictions/apiAccess';
import { getPublicApiHeaders, noStoreHeaders } from '@/domain/predictions/http';

export const dynamic = 'force-dynamic';

function readString(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export async function OPTIONS(request: NextRequest) {
    return new Response(null, {
        status: 204,
        headers: {
            ...getPublicApiHeaders(request, 'POST, OPTIONS'),
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
        },
    });
}

export async function POST(request: NextRequest) {
    const access = await verifyPredictionApiAccess({ headers: request.headers, url: request.nextUrl, requiredScope: 'incidents:write' });
    if (!access.ok) {
        return NextResponse.json({ ok: false, error: access.code, message: access.message }, {
            status: access.status,
            headers: noStoreHeaders(getPublicApiHeaders(request, 'POST, OPTIONS')),
        });
    }

    const payload = await request.json().catch(() => null) as Record<string, unknown> | null;
    const incidentId = readString(payload?.incidentId);
    const deviceId = readString(payload?.deviceId);
    if (!incidentId || !deviceId || deviceId.length < 8 || deviceId.length > 128) {
        return NextResponse.json({ ok: false, error: 'invalid_payload' }, {
            status: 400,
            headers: noStoreHeaders(getPublicApiHeaders(request, 'POST, OPTIONS')),
        });
    }

    const result = await resolveDurableIncident(incidentId, deviceId);
    return NextResponse.json({
        ok: result.ok,
        error: result.ok ? null : result.code,
        message: result.message,
        incident: result.incident ?? null,
    }, {
        status: result.status,
        headers: noStoreHeaders(getPublicApiHeaders(request, 'POST, OPTIONS')),
    });
}
