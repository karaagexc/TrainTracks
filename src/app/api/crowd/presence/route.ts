import { NextRequest, NextResponse } from 'next/server';
import { processCrowdPresence } from '@/domain/crowd/service';
import { noStoreHeaders } from '@/domain/predictions/http';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
    const payload = await request.json().catch(() => null);
    const result = await processCrowdPresence(payload);

    return NextResponse.json({
        ok: result.ok,
        error: result.ok ? null : result.code,
        message: result.message,
        train: result.train,
        duplicate: result.duplicate ?? false,
    }, {
        status: result.status,
        headers: noStoreHeaders(),
    });
}
