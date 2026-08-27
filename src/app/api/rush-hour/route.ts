import { NextRequest, NextResponse } from 'next/server';
import { noStoreHeaders } from '@/domain/predictions/http';
import { getTimeMultiplier, isRushHourWindow } from '@/data/congestion';
import { getManilaDateParts, getManilaDaypart, parseManilaTimestamp } from '@/domain/time/manila';

export const dynamic = 'force-dynamic';

/**
 * Internal (no auth) rush-hour endpoint.
 * Used by the API Console Live Stats to show the current time window.
 */
export async function GET(request: NextRequest) {
    const atParam = request.nextUrl.searchParams.get('at');
    const now = atParam ? parseManilaTimestamp(atParam) : new Date();

    if (!now) {
        return NextResponse.json({
            ok: false,
            error: 'invalid_timestamp',
            message: `Invalid "at" timestamp: "${atParam}".`,
        }, { status: 400, headers: noStoreHeaders() });
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
    }, { headers: noStoreHeaders() });
}
