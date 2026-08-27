import { NextRequest, NextResponse } from 'next/server';
import { resolveDurableIncident } from '@/domain/crowd/durableIncidents';
import { noStoreHeaders } from '@/domain/predictions/http';

export const dynamic = 'force-dynamic';

function readString(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export async function POST(request: NextRequest) {
    const payload = await request.json().catch(() => null) as Record<string, unknown> | null;
    const incidentId = readString(payload?.incidentId);
    const deviceId = readString(payload?.deviceId);

    if (!incidentId || !deviceId || deviceId.length < 8 || deviceId.length > 128) {
        return NextResponse.json({
            ok: false,
            error: 'invalid_payload',
            message: 'incidentId and anonymous deviceId are required.',
        }, {
            status: 400,
            headers: noStoreHeaders(),
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
        headers: noStoreHeaders(),
    });
}
