import { NextRequest, NextResponse } from 'next/server';
import { listDurableIncidentSnapshot } from '@/domain/crowd/durableIncidents';
import { verifyPredictionApiAccess } from '@/domain/predictions/apiAccess';
import { getPublicApiHeaders, getConfiguredPublicApiHeaders, noStoreHeaders } from '@/domain/predictions/http';
import type { LineId } from '@/types';

export const dynamic = 'force-dynamic';

const VALID_LINES = new Set<LineId>(['LRT1', 'LRT2', 'MRT3']);

export async function OPTIONS(request: NextRequest) {
    return new Response(null, { status: 204, headers: await getConfiguredPublicApiHeaders(request) });
}

export async function GET(request: NextRequest) {
    const access = await verifyPredictionApiAccess({ headers: request.headers, url: request.nextUrl, requiredScope: 'incidents:read' });
    if (!access.ok) {
        return NextResponse.json({ ok: false, error: access.code, message: access.message }, {
            status: access.status,
            headers: noStoreHeaders(getPublicApiHeaders(request)),
        });
    }

    const rawLine = request.nextUrl.searchParams.get('line')?.replace('-', '').toUpperCase() as LineId | undefined;
    if (rawLine && !VALID_LINES.has(rawLine)) {
        return NextResponse.json({ ok: false, error: 'invalid_line' }, {
            status: 400,
            headers: noStoreHeaders(getPublicApiHeaders(request)),
        });
    }

    const result = await listDurableIncidentSnapshot(rawLine ?? null);
    return NextResponse.json({
        ok: result.ok,
        generatedAt: new Date().toISOString(),
        incidents: result.incidents,
        error: result.ok ? null : 'incident_storage_unavailable',
    }, {
        headers: noStoreHeaders(getPublicApiHeaders(request)),
        status: result.status,
    });
}
