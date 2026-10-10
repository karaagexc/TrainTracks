import { NextRequest, NextResponse } from 'next/server';
import { verifyPredictionApiAccess } from '@/domain/predictions/apiAccess';
import { getConfiguredPredictionResponse } from '@/domain/predictions/serverConfig';
import { getPublicApiHeaders, getConfiguredPublicApiHeaders, noStoreHeaders } from '@/domain/predictions/http';
import { parsePredictionRequestFromUrl } from '@/domain/predictions/request';

export const dynamic = 'force-dynamic';

export async function OPTIONS(request: NextRequest) {
    return new Response(null, {
        status: 204,
        headers: await getConfiguredPublicApiHeaders(request),
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

    const response = await getConfiguredPredictionResponse(parsePredictionRequestFromUrl(request.nextUrl));

    return NextResponse.json(response, {
        headers: noStoreHeaders(getPublicApiHeaders(request)),
    });
}
