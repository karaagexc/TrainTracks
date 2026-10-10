import { NextRequest, NextResponse } from 'next/server';
import { getConfiguredPredictionResponse } from '@/domain/predictions/serverConfig';
import { noStoreHeaders } from '@/domain/predictions/http';
import { parsePredictionRequestFromUrl } from '@/domain/predictions/request';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    const response = await getConfiguredPredictionResponse(parsePredictionRequestFromUrl(request.nextUrl));

    return NextResponse.json(response, {
        headers: noStoreHeaders(),
    });
}
