import { NextRequest } from 'next/server';
import { createPredictionStream, predictionStreamHeaders } from '@/domain/predictions/stream';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    return new Response(createPredictionStream(request.nextUrl, request.signal), {
        headers: predictionStreamHeaders(),
    });
}
