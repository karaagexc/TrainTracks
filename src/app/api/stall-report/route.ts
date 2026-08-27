import { NextRequest, NextResponse } from 'next/server';
import { processStallReport } from '@/domain/crowd/durableIncidents';
import { noStoreHeaders } from '@/domain/predictions/http';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
    const payload = await request.json().catch(() => null);
    const result = await processStallReport(payload);

    return NextResponse.json({
        ok: result.ok,
        error: result.ok ? null : result.code,
        message: result.message,
        report: result.report ?? null,
        incident: result.incident ?? null,
        duplicate: result.duplicate ?? false,
    }, {
        status: result.status,
        headers: noStoreHeaders(),
    });
}
