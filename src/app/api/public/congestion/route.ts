import { NextRequest, NextResponse } from 'next/server';
import { verifyPredictionApiAccess } from '@/domain/predictions/apiAccess';
import { getPublicApiHeaders, noStoreHeaders } from '@/domain/predictions/http';
import { getCongestionLevel } from '@/data/congestion';
import { STATION_WEIGHTS } from '@/data/congestion';

export const dynamic = 'force-dynamic';

const VALID_STATION_IDS = new Set(Object.keys(STATION_WEIGHTS));

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
            ok: false,
            error: access.code,
            message: access.message,
        }, {
            status: access.status,
            headers: noStoreHeaders(getPublicApiHeaders(request)),
        });
    }

    const stationId = request.nextUrl.searchParams.get('station');
    if (!stationId) {
        return NextResponse.json({
            ok: false,
            error: 'missing_station',
            message: 'The "station" query parameter is required. Example: ?station=M3-11',
        }, {
            status: 400,
            headers: noStoreHeaders(getPublicApiHeaders(request)),
        });
    }

    if (!VALID_STATION_IDS.has(stationId)) {
        return NextResponse.json({
            ok: false,
            error: 'invalid_station',
            message: `Unknown station ID "${stationId}". Valid IDs: ${[...VALID_STATION_IDS].sort().join(', ')}`,
        }, {
            status: 400,
            headers: noStoreHeaders(getPublicApiHeaders(request)),
        });
    }

    const direction = request.nextUrl.searchParams.get('direction') as 'NORTH' | 'SOUTH' | null;
    const lineId = request.nextUrl.searchParams.get('line');
    const atParam = request.nextUrl.searchParams.get('at');
    const now = atParam ? new Date(atParam) : new Date();

    if (atParam && isNaN(now.getTime())) {
        return NextResponse.json({
            ok: false,
            error: 'invalid_timestamp',
            message: `Invalid "at" timestamp: "${atParam}". Use ISO 8601 format, e.g. 2026-05-28T17:30:00`,
        }, {
            status: 400,
            headers: noStoreHeaders(getPublicApiHeaders(request)),
        });
    }

    const congestion = getCongestionLevel(stationId, now, direction, lineId);

    return NextResponse.json({
        ok: true,
        station: stationId,
        congestion: {
            score: congestion.score,
            tier: congestion.tier,
            label: congestion.label,
            description: congestion.description,
            direction: congestion.direction,
            reason: congestion.reason ?? null,
            tip: congestion.tip ?? null,
            activeEvent: congestion.activeEvent ?? null,
            timeWindow: congestion.timeWindow,
            isFriday: congestion.isFriday,
            confidence: congestion.confidence ?? 'medium',
            reasonCodes: congestion.reasonCodes ?? [],
            sources: congestion.sources ?? [],
            dayType: congestion.dayType ?? null,
            daypart: congestion.daypart ?? null,
            profileArchetypes: congestion.profileArchetypes ?? [],
        },
        meta: {
            computedAt: now.toISOString(),
            engine: 'v1',
        },
    }, {
        headers: noStoreHeaders(getPublicApiHeaders(request)),
    });
}
