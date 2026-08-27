import { NextRequest, NextResponse } from 'next/server';
import { verifyPredictionApiAccess } from '@/domain/predictions/apiAccess';
import { getPublicApiHeaders, noStoreHeaders } from '@/domain/predictions/http';
import { getTimeMultiplier, isRushHourWindow } from '@/data/congestion';
import { getManilaDateParts, getManilaDaypart, parseManilaTimestamp } from '@/domain/time/manila';

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
            ok: false,
            error: access.code,
            message: access.message,
        }, {
            status: access.status,
            headers: noStoreHeaders(getPublicApiHeaders(request)),
        });
    }

    const atParam = request.nextUrl.searchParams.get('at');
    const now = atParam ? parseManilaTimestamp(atParam) : new Date();

    if (!now) {
        return NextResponse.json({
            ok: false,
            error: 'invalid_timestamp',
            message: `Invalid "at" timestamp: "${atParam}". Use ISO 8601 format, e.g. 2026-05-28T17:30:00`,
        }, {
            status: 400,
            headers: noStoreHeaders(getPublicApiHeaders(request)),
        });
    }

    const timeWindow = getTimeMultiplier(now);
    const manila = getManilaDateParts(now);

    const dayTypeMap: Record<number, string> = {
        0: 'sunday', 1: 'monday', 2: 'weekday', 3: 'weekday',
        4: 'weekday', 5: 'friday', 6: 'saturday',
    };

    return NextResponse.json({
        ok: true,
        timeProfile: {
            name: timeWindow.name,
            multiplier: timeWindow.multiplier,
            primaryFlow: timeWindow.primaryFlow ?? null,
            isHolidayMode: timeWindow.isHolidayMode ?? false,
            isRushHour: isRushHourWindow(timeWindow.name),
        },
        dayType: timeWindow.isHolidayMode ? 'holiday' : dayTypeMap[manila.weekdayIndex] ?? 'weekday',
        daypart: getManilaDaypart(manila),
        schedule: {
            amRush: { start: '06:30', end: '09:30', note: 'Extended to 12:00 on Fridays' },
            pmRush: { start: '17:00', end: '20:30', note: 'Starts 15:00 on Fridays, ends 22:00' },
            deepOffPeak: { start: '11:00', end: '16:00', note: '12:00–15:00 on Fridays' },
            closed: { start: '23:00', end: '04:30' },
        },
        meta: {
            computedAt: now.toISOString(),
            engine: 'v1',
        },
    }, {
        headers: noStoreHeaders(getPublicApiHeaders(request)),
    });
}
