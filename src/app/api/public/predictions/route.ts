import { NextRequest, NextResponse } from 'next/server';
import { verifyPredictionApiAccess } from '@/domain/predictions/apiAccess';
import { getPredictionResponse } from '@/domain/predictions/engine';
import { getPublicApiHeaders, noStoreHeaders } from '@/domain/predictions/http';
import { parsePredictionRequestFromUrl } from '@/domain/predictions/request';

export const dynamic = 'force-dynamic';

export async function OPTIONS(request: NextRequest) {
    return new Response(null, {
        status: 204,
        headers: getPublicApiHeaders(request),
    });
}

export async function GET(request: NextRequest) {
    const access = await verifyPredictionApiAccess({
        headers: request.headers,
        url: request.nextUrl,
        requiredScope: 'predictions:read',
    });

    if (!access.ok) {
        return NextResponse.json({
            error: access.code,
            message: access.message,
        }, {
            status: access.status,
            headers: noStoreHeaders(getPublicApiHeaders(request)),
        });
    }

    const response = getPredictionResponse(parsePredictionRequestFromUrl(request.nextUrl));

    return NextResponse.json(response, {
        headers: noStoreHeaders(getPublicApiHeaders(request)),
    });
}
