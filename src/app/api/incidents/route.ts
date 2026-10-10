import { NextRequest, NextResponse } from 'next/server';
import { listDurableIncidentSnapshot } from '@/domain/crowd/durableIncidents';
import { noStoreHeaders } from '@/domain/predictions/http';
import type { LineId } from '@/types';

export const dynamic = 'force-dynamic';

const VALID_LINES = new Set<LineId>(['LRT1', 'LRT2', 'MRT3']);

export async function GET(request: NextRequest) {
    const rawLine = request.nextUrl.searchParams.get('line')?.replace('-', '').toUpperCase() as LineId | undefined;
    if (rawLine && !VALID_LINES.has(rawLine)) {
        return NextResponse.json({ ok: false, error: 'invalid_line' }, {
            status: 400,
            headers: noStoreHeaders(),
        });
    }

    const result = await listDurableIncidentSnapshot(rawLine ?? null);
    return NextResponse.json({
        ok: result.ok,
        generatedAt: new Date().toISOString(),
        incidents: result.incidents,
        error: result.ok ? null : 'incident_storage_unavailable',
    }, {
        headers: noStoreHeaders(),
        status: result.status,
    });
}
