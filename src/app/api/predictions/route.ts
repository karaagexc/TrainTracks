import { NextRequest, NextResponse } from 'next/server';
import { getPredictionResponse } from '@/domain/predictions/engine';
import { noStoreHeaders } from '@/domain/predictions/http';
import { parsePredictionRequestFromUrl } from '@/domain/predictions/request';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    const response = getPredictionResponse(parsePredictionRequestFromUrl(request.nextUrl));

    return NextResponse.json(response, {
        headers: noStoreHeaders(),
    });
}
