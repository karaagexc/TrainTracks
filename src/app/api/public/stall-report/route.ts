import { NextRequest, NextResponse } from 'next/server';
import { processStallReport } from '@/domain/crowd/durableIncidents';
import { verifyPredictionApiAccess } from '@/domain/predictions/apiAccess';
import { getPublicApiHeaders, noStoreHeaders } from '@/domain/predictions/http';

export const dynamic = 'force-dynamic';

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
    const access = await verifyPredictionApiAccess({
        headers: request.headers,
        url: request.nextUrl,
        requiredScope: 'incidents:write',
    });
    if (!access.ok) {
        return NextResponse.json({
            ok: false,
            error: access.code,
            message: access.message,
        }, {
            status: access.status,
            headers: noStoreHeaders(getPublicApiHeaders(request, 'POST, OPTIONS')),
        });
    }

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
        headers: noStoreHeaders(getPublicApiHeaders(request, 'POST, OPTIONS')),
    });
}
