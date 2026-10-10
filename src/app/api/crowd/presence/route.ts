import { NextRequest, NextResponse } from 'next/server';
import { processCrowdPresence } from '@/domain/crowd/service';
import { listCrowdPresenceSnapshot } from '@/domain/crowd/snapshot';
import { noStoreHeaders } from '@/domain/predictions/http';

export const dynamic = 'force-dynamic';

export async function GET() {
    const result = await listCrowdPresenceSnapshot();
    return NextResponse.json({
        ok: result.ok,
        generatedAt: new Date().toISOString(),
        trains: result.trains,
        error: result.ok ? null : 'crowd_storage_unavailable',
    }, { status: result.status, headers: noStoreHeaders() });
}

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
