export const MANILA_TIMEZONE = 'Asia/Manila' as const;

export type ManilaDaypart =
    | 'closed'
    | 'early_morning'
    | 'am_peak'
    | 'late_morning'
    | 'midday'
    | 'afternoon'
    | 'pm_peak'
    | 'late_evening';

export interface ManilaDateParts {
    year: number;
    month: number;
    day: number;
    weekday: string;
    weekdayIndex: number;
    hour: number;
    minute: number;
    second: number;
    minutesOfDay: number;
    hourFloat: number;
    dateKey: string;
    monthDayKey: string;
}

const WEEKDAY_INDEX: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
};

let cachedTime = Number.NaN;
let cachedParts: ManilaDateParts | null = null;

function pad(value: number): string {
    return String(value).padStart(2, '0');
}

export function getManilaDateParts(date: Date): ManilaDateParts {
    const time = date.getTime();
    if (cachedParts && cachedTime === time) return cachedParts;

    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: MANILA_TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
    }).formatToParts(date);

    const byType = new Map(parts.map((part) => [part.type, part.value]));
    const year = Number(byType.get('year'));
    const month = Number(byType.get('month'));
    const day = Number(byType.get('day'));
    const weekday = byType.get('weekday') ?? 'Mon';
    const hour = Number(byType.get('hour'));
    const minute = Number(byType.get('minute'));
    const second = Number(byType.get('second'));
    const dateKey = `${year}-${pad(month)}-${pad(day)}`;
    const monthDayKey = `${pad(month)}-${pad(day)}`;

    cachedTime = time;
    cachedParts = {
        year,
        month,
        day,
        weekday,
        weekdayIndex: WEEKDAY_INDEX[weekday] ?? 1,
        hour,
        minute,
        second,
        minutesOfDay: hour * 60 + minute,
        hourFloat: hour + (minute / 60),
        dateKey,
        monthDayKey,
    };

    return cachedParts;
}

export function getManilaDaypart(dateOrParts: Date | ManilaDateParts): ManilaDaypart {
    const hour = dateOrParts instanceof Date
        ? getManilaDateParts(dateOrParts).hourFloat
        : dateOrParts.hourFloat;

    if (hour < 4.5 || hour >= 23) return 'closed';
    if (hour < 6.5) return 'early_morning';
    if (hour < 9.5) return 'am_peak';
    if (hour < 11.5) return 'late_morning';
    if (hour < 14) return 'midday';
    if (hour < 16.5) return 'afternoon';
    if (hour < 20.5) return 'pm_peak';
    return 'late_evening';
}

export function parseManilaTimestamp(input: string): Date | null {
    const trimmed = input.trim();
    if (!trimmed) return null;

    const hasExplicitOffset = /(?:z|[+-]\d{2}:?\d{2})$/i.test(trimmed);
    const normalized = trimmed.includes('T')
        ? trimmed
        : trimmed.replace(' ', 'T');
    const withTimezone = hasExplicitOffset
        ? normalized
        : `${normalized}${/^\d{4}-\d{2}-\d{2}$/.test(normalized) ? 'T00:00:00' : ''}+08:00`;
    const parsed = new Date(withTimezone);

    return Number.isNaN(parsed.getTime()) ? null : parsed;
}
