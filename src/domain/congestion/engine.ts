import type { Direction, LineId, OperationalMode, Station } from '@/types';
import type { TrainPresence } from '@/types/train';
import { getManilaDateParts, getManilaDaypart } from '@/domain/time/manila';

export type CongestionTier = 'LOW' | 'MODERATE' | 'HIGH' | 'EXTREME';
export type CongestionConfidence = 'low' | 'medium' | 'high';
export type CongestionReasonCode =
    | 'forecast_weight'
    | 'station_profile'
    | 'daypart_profile'
    | 'time_window'
    | 'direction_flow'
    | 'counter_flow'
    | 'holiday_mode'
    | 'weekend_mall'
    | 'station_event'
    | 'remote_override'
    | 'crowd_signal'
    | 'train_dwell'
    | 'stale_signal';
export type CongestionSource = 'forecast' | 'local_fallback' | 'supabase' | 'crowd' | 'operator' | 'simulated' | 'predicted';
export type CongestionDayMode = 'holiday' | 'school_day' | 'special_event' | 'normal_weekday';
export type CongestionDayType = 'monday' | 'weekday' | 'friday' | 'saturday' | 'sunday' | 'holiday';
export type CongestionDaypart =
    | 'closed'
    | 'early_morning'
    | 'am_peak'
    | 'late_morning'
    | 'midday'
    | 'afternoon'
    | 'pm_peak'
    | 'late_evening';
export type CongestionStationArchetype =
    | 'terminal'
    | 'transfer_hub'
    | 'cbd'
    | 'school'
    | 'mall'
    | 'church'
    | 'hospital'
    | 'government'
    | 'market'
    | 'bus_terminal'
    | 'airport'
    | 'industrial'
    | 'residential'
    | 'quiet'
    | 'feeder'
    | 'mixed';

export interface CongestionOverride {
    id?: string;
    mode?: CongestionDayMode;
    date?: string;
    startAt?: string;
    endAt?: string;
    stationIds?: string[];
    lineIds?: LineId[];
    multiplier?: number;
    boost?: number;
    dampen?: number;
    scoreDelta?: number;
    label?: string;
    reason?: string;
    tip?: string;
    source?: CongestionSource;
}

export interface CongestionConfig {
    calendar?: CongestionOverride[];
    stationWindows?: CongestionOverride[];
    lineWindows?: CongestionOverride[];
    advisories?: CongestionOverride[];
    updatedAt?: string;
}

export interface CongestionTimeProfile {
    name: string;
    multiplier: number;
    primaryDirections?: Direction[];
    isHolidayMode?: boolean;
    activeOverride?: CongestionOverride;
    source: CongestionSource;
}

export interface OverrideResult {
    score: number;
    activeOverride?: CongestionOverride;
    reasonCodes: CongestionReasonCode[];
    sources: CongestionSource[];
}

export interface CongestionSnapshot {
    score: number;
    tier: CongestionTier;
    label: string;
    description: string;
    color: string;
    direction?: 'NORTH' | 'SOUTH' | 'COMBINED';
    reason?: string;
    tip?: string;
    activeEvent?: string;
    timeWindow: string;
    isFriday: boolean;
    confidence: CongestionConfidence;
    reasonCodes: CongestionReasonCode[];
    sources: CongestionSource[];
    timeProfile: CongestionTimeProfile;
    liveSignalCount: number;
    staleSignalCount: number;
    dayType: CongestionDayType;
    daypart: CongestionDaypart;
    profileArchetypes: CongestionStationArchetype[];
}

export interface DirectionalWeightPreset {
    positive: number;
    negative: number;
}

export interface StationEventPreset {
    day: number;
    boost: number;
    note: string;
    timeRange?: [number, number];
}

export interface StationContextPreset {
    reason: string;
    tip?: string;
    events?: StationEventPreset[];
}

type DaypartMultiplierTable = Partial<Record<CongestionDaypart, number>>;

export interface StationDemandProfile {
    archetypes: CongestionStationArchetype[];
    daypartMultipliers?: Partial<Record<CongestionDayType | 'default', DaypartMultiplierTable>>;
    directionMultipliers?: Partial<Record<Direction, number>>;
    note?: string;
}

export interface CongestionBaseline {
    stationWeights: Record<string, DirectionalWeightPreset>;
    defaultWeight: DirectionalWeightPreset;
    stationContext: Record<string, StationContextPreset>;
    stationDemandProfiles?: Record<string, StationDemandProfile>;
    fridayWeightOverrides: Record<string, number>;
    mallHotspots: ReadonlySet<string>;
    hubStations: ReadonlySet<string>;
}

export interface CongestionSnapshotInput {
    station?: Pick<Station, 'id' | 'lineId'> | null;
    stationId?: string;
    lineId?: LineId | string | null;
    direction?: Direction | 'NORTH' | 'SOUTH' | null;
    now?: Date;
    mode?: OperationalMode;
    liveSignals?: TrainPresence[];
    config?: CongestionConfig | null;
    baseline: CongestionBaseline;
}

const LOCAL_CALENDAR_FALLBACKS: CongestionOverride[] = [
    { id: 'new-year', date: '01-01', mode: 'holiday', label: 'New Year holiday', multiplier: 0.4, source: 'local_fallback' },
    { id: 'edsa-anniversary', date: '02-25', mode: 'holiday', label: 'EDSA People Power anniversary', multiplier: 0.4, source: 'local_fallback' },
    { id: 'day-of-valor', date: '04-09', mode: 'holiday', label: 'Day of Valor holiday', multiplier: 0.4, source: 'local_fallback' },
    { id: 'labor-day', date: '05-01', mode: 'holiday', label: 'Labor Day holiday', multiplier: 0.4, source: 'local_fallback' },
    { id: 'independence-day', date: '06-12', mode: 'holiday', label: 'Independence Day holiday', multiplier: 0.4, source: 'local_fallback' },
    { id: 'ninoy-aquino-day', date: '08-21', mode: 'holiday', label: 'Ninoy Aquino Day', multiplier: 0.4, source: 'local_fallback' },
    { id: 'all-saints-day', date: '11-01', mode: 'holiday', label: 'All Saints Day', multiplier: 0.4, source: 'local_fallback' },
    { id: 'all-souls-day', date: '11-02', mode: 'holiday', label: 'All Souls Day', multiplier: 0.4, source: 'local_fallback' },
    { id: 'bonifacio-day', date: '11-30', mode: 'holiday', label: 'Bonifacio Day holiday', multiplier: 0.4, source: 'local_fallback' },
    { id: 'immaculate-conception', date: '12-08', mode: 'holiday', label: 'Immaculate Conception holiday', multiplier: 0.4, source: 'local_fallback' },
    { id: 'christmas-day', date: '12-25', mode: 'holiday', label: 'Christmas Day holiday', multiplier: 0.4, source: 'local_fallback' },
    { id: 'rizal-day', date: '12-30', mode: 'holiday', label: 'Rizal Day holiday', multiplier: 0.4, source: 'local_fallback' },
    { id: 'eid-adha-2026', date: '2026-05-27', mode: 'holiday', label: 'Eid al-Adha holiday', multiplier: 0.4, source: 'local_fallback' },
];

export const DEFAULT_CONGESTION_CONFIG: CongestionConfig = {
    calendar: LOCAL_CALENDAR_FALLBACKS,
};

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

function getDateKey(date: Date): string {
    return getManilaDateParts(date).dateKey;
}

function getMonthDayKey(date: Date): string {
    return getManilaDateParts(date).monthDayKey;
}

function getHourFloat(date: Date): number {
    return getManilaDateParts(date).hourFloat;
}

function getDayType(now: Date, timeProfile: CongestionTimeProfile): CongestionDayType {
    if (timeProfile.isHolidayMode) return 'holiday';
    const day = getManilaDateParts(now).weekdayIndex;
    if (day === 0) return 'sunday';
    if (day === 1) return 'monday';
    if (day === 5) return 'friday';
    if (day === 6) return 'saturday';
    return 'weekday';
}

function getDaypart(now: Date, timeProfile: CongestionTimeProfile): CongestionDaypart {
    if (timeProfile.name === 'CLOSED') return 'closed';
    return getManilaDaypart(now);
}

function arrayOrEmpty<T>(value: T[] | undefined): T[] {
    return Array.isArray(value) ? value : [];
}

export function normalizeCongestionConfig(config?: CongestionConfig | null): CongestionConfig {
    if (!config || typeof config !== 'object') return {};
    return {
        calendar: arrayOrEmpty(config.calendar),
        stationWindows: arrayOrEmpty(config.stationWindows),
        lineWindows: arrayOrEmpty(config.lineWindows),
        advisories: arrayOrEmpty(config.advisories),
        updatedAt: typeof config.updatedAt === 'string' ? config.updatedAt : undefined,
    };
}

function mergeWithLocalFallback(config?: CongestionConfig | null): CongestionConfig {
    const normalized = normalizeCongestionConfig(config);
    return {
        ...normalized,
        calendar: [
            ...LOCAL_CALENDAR_FALLBACKS,
            ...arrayOrEmpty(normalized.calendar),
        ],
    };
}

function isOverrideTimeActive(override: CongestionOverride, now: Date): boolean {
    const dateKey = getDateKey(now);
    const monthDay = getMonthDayKey(now);
    if (override.date && override.date !== dateKey && override.date !== monthDay) {
        return false;
    }

    const time = now.getTime();
    if (override.startAt && time < new Date(override.startAt).getTime()) return false;
    if (override.endAt && time > new Date(override.endAt).getTime()) return false;
    return true;
}

function isOverrideTargeted(
    override: CongestionOverride,
    stationId: string,
    lineId: LineId | string | null,
): boolean {
    if (override.stationIds?.length && !override.stationIds.includes(stationId)) return false;
    if (override.lineIds?.length && (!lineId || !override.lineIds.includes(lineId as LineId))) return false;
    return true;
}

function getActiveCalendarOverride(config: CongestionConfig, now: Date): CongestionOverride | undefined {
    const calendar = arrayOrEmpty(config.calendar);
    return [...calendar].reverse().find((override) => isOverrideTimeActive(override, now));
}

export function getTimeProfile(now: Date = new Date(), config?: CongestionConfig | null): CongestionTimeProfile {
    const mergedConfig = mergeWithLocalFallback(config);
    const manila = getManilaDateParts(now);
    const time = manila.hourFloat;
    const day = manila.weekdayIndex;
    const calendarOverride = getActiveCalendarOverride(mergedConfig, now);
    const calendarSource = calendarOverride?.source ?? 'supabase';

    if (time >= 23.0 || time < 4.5) {
        return { name: 'CLOSED', multiplier: 0, source: 'forecast' };
    }

    if (calendarOverride?.mode === 'holiday') {
        return {
            name: 'HOLIDAY',
            multiplier: calendarOverride.multiplier ?? 0.4,
            isHolidayMode: true,
            activeOverride: calendarOverride,
            source: calendarSource,
        };
    }

    const isForcedNormalWeekday = calendarOverride?.mode === 'normal_weekday';
    const effectiveDay = isForcedNormalWeekday && (day === 0 || day === 6) ? 1 : day;

    if (!isForcedNormalWeekday && effectiveDay === 0) {
        if (time >= 9 && time < 16) {
            return { name: 'SUNDAY_PEAK', multiplier: 0.4, source: 'forecast' };
        }
        return { name: 'SUNDAY_OFF', multiplier: 0.25, source: 'forecast' };
    }

    if (!isForcedNormalWeekday && effectiveDay === 6) {
        if (time >= 9 && time < 19) {
            return { name: 'SATURDAY_MALL', multiplier: 0.7, source: 'forecast' };
        }
        return { name: 'SATURDAY_OFF', multiplier: 0.3, source: 'forecast' };
    }

    const isFriday = effectiveDay === 5;
    const isDeepOffPeak = isFriday
        ? time >= 12.0 && time < 15.0
        : time >= 11.0 && time < 16.0;

    if (isDeepOffPeak) {
        return { name: 'DEEP_OFF_PEAK', multiplier: 0.3, source: 'forecast' };
    }

    const amEnd = isFriday ? 12.0 : 11.0;
    if (time >= 6.5 && time < amEnd) {
        return {
            name: 'AM RUSH',
            multiplier: calendarOverride?.mode === 'school_day' ? 1.1 : 1.0,
            primaryDirections: ['SOUTHBOUND', 'WESTBOUND'],
            activeOverride: calendarOverride,
            source: calendarOverride ? calendarSource : 'forecast',
        };
    }

    const pmStart = isFriday ? 15.0 : 17.0;
    const pmEnd = isFriday ? 22.0 : 20.5;
    if (time >= pmStart && time < pmEnd) {
        return {
            name: isFriday ? 'FRIDAY RUSH' : 'PM RUSH',
            multiplier: isFriday ? 1.5 : 1.0,
            primaryDirections: ['NORTHBOUND', 'EASTBOUND'],
            activeOverride: calendarOverride,
            source: calendarOverride ? calendarSource : 'forecast',
        };
    }

    if (calendarOverride?.mode === 'special_event') {
        return {
            name: 'SPECIAL EVENT',
            multiplier: calendarOverride.multiplier ?? 0.75,
            activeOverride: calendarOverride,
            source: calendarSource,
        };
    }

    return {
        name: 'OFF-PEAK',
        multiplier: 0.4,
        activeOverride: calendarOverride,
        source: calendarOverride ? calendarSource : 'forecast',
    };
}

function parseLineId(stationId: string, explicit?: LineId | string | null): LineId | string | null {
    if (explicit) return explicit;
    if (stationId.startsWith('L1')) return 'LRT1';
    if (stationId.startsWith('L2')) return 'LRT2';
    if (stationId.startsWith('M3')) return 'MRT3';
    if (stationId.startsWith('M7')) return 'MRT7';
    return null;
}

function isCaviteExtension(stationId: string): boolean {
    const [, suffix] = stationId.split('-');
    const order = Number(suffix);
    return stationId.startsWith('L1-') && order >= 21;
}

export function normalizeCongestionDirection(
    direction: Direction | 'NORTH' | 'SOUTH' | null | undefined,
    stationId: string,
    lineId?: LineId | string | null,
): Direction | null {
    if (!direction) return null;
    if (
        direction === 'NORTHBOUND' ||
        direction === 'SOUTHBOUND' ||
        direction === 'EASTBOUND' ||
        direction === 'WESTBOUND'
    ) {
        return direction;
    }

    const parsedLineId = parseLineId(stationId, lineId);
    if (parsedLineId === 'LRT2') {
        return direction === 'SOUTH' ? 'EASTBOUND' : 'WESTBOUND';
    }
    return direction === 'SOUTH' ? 'SOUTHBOUND' : 'NORTHBOUND';
}

function toLegacyDirection(direction: Direction | null): 'NORTH' | 'SOUTH' | undefined {
    if (!direction) return undefined;
    return direction === 'SOUTHBOUND' || direction === 'EASTBOUND' ? 'SOUTH' : 'NORTH';
}

function isCounterFlow(
    stationId: string,
    lineId: LineId | string | null,
    direction: Direction,
    timeProfile: CongestionTimeProfile,
): boolean {
    const isRush = timeProfile.name.includes('AM') || timeProfile.name.includes('PM') || timeProfile.name.includes('FRIDAY');
    if (!isRush || timeProfile.isHolidayMode) return false;

    const isLrt2 = lineId === 'LRT2' || stationId.startsWith('L2');
    const isCavite = isCaviteExtension(stationId);

    if (timeProfile.name.includes('AM')) {
        if (isLrt2) return direction !== 'WESTBOUND';
        if (isCavite) return direction !== 'NORTHBOUND';
        return direction !== 'SOUTHBOUND';
    }

    if (isLrt2) return direction !== 'EASTBOUND';
    if (isCavite) return direction !== 'SOUTHBOUND';
    return direction !== 'NORTHBOUND';
}

function getDirectionalWeight(weights: DirectionalWeightPreset, direction: Direction): number {
    return direction === 'SOUTHBOUND' || direction === 'EASTBOUND'
        ? weights.positive
        : weights.negative;
}

function getProfileDaypartMultiplier(
    profile: StationDemandProfile | undefined,
    dayType: CongestionDayType,
    daypart: CongestionDaypart,
): number {
    if (!profile?.daypartMultipliers) return 1;
    const defaultMultiplier = profile.daypartMultipliers.default?.[daypart] ?? 1;
    return profile.daypartMultipliers[dayType]?.[daypart] ?? defaultMultiplier;
}

function getStationDemandAdjustment(input: {
    profile: StationDemandProfile | undefined;
    dayType: CongestionDayType;
    daypart: CongestionDaypart;
    direction: Direction;
}): { multiplier: number; applied: boolean; archetypes: CongestionStationArchetype[] } {
    const daypartMultiplier = getProfileDaypartMultiplier(input.profile, input.dayType, input.daypart);
    const directionMultiplier = input.profile?.directionMultipliers?.[input.direction] ?? 1;
    const multiplier = daypartMultiplier * directionMultiplier;
    return {
        multiplier,
        applied: Math.abs(multiplier - 1) > 0.01,
        archetypes: input.profile?.archetypes ?? [],
    };
}

function getStationEvent(
    context: StationContextPreset | undefined,
    now: Date,
): StationEventPreset | undefined {
    const manila = getManilaDateParts(now);
    const currentDay = manila.weekdayIndex;
    const currentTime = manila.hourFloat;
    return context?.events?.find((event) => {
        if (event.day !== currentDay) return false;
        if (!event.timeRange) return true;
        const [start, end] = event.timeRange;
        return currentTime >= start && currentTime < end;
    });
}

function applyWeekendMallBoost(
    scoreMultiplier: number,
    stationId: string,
    now: Date,
    timeProfile: CongestionTimeProfile,
    baseline: CongestionBaseline,
): { multiplier: number; applied: boolean } {
    if (timeProfile.isHolidayMode) return { multiplier: scoreMultiplier, applied: false };
    const manila = getManilaDateParts(now);
    const day = manila.weekdayIndex;
    if (day !== 0 && day !== 6) return { multiplier: scoreMultiplier, applied: false };
    if (!baseline.mallHotspots.has(stationId)) return { multiplier: scoreMultiplier, applied: false };

    const hour = manila.hour;
    const endHour = day === 6 ? 19 : 16;
    if (hour < 9 || hour >= endHour) return { multiplier: scoreMultiplier, applied: false };

    return { multiplier: day === 6 ? 0.8 : 0.6, applied: true };
}

function getCandidateOverrides(
    config: CongestionConfig,
    stationId: string,
    lineId: LineId | string | null,
    now: Date,
): CongestionOverride[] {
    return [
        ...arrayOrEmpty(config.stationWindows),
        ...arrayOrEmpty(config.lineWindows),
        ...arrayOrEmpty(config.advisories),
        ...arrayOrEmpty(config.calendar),
    ].filter((override) => (
        isOverrideTimeActive(override, now) &&
        isOverrideTargeted(override, stationId, lineId) &&
        (
            typeof override.boost === 'number' ||
            typeof override.dampen === 'number' ||
            typeof override.scoreDelta === 'number' ||
            (override.mode === 'special_event' && typeof override.multiplier === 'number')
        )
    ));
}

export function applyCongestionOverrides(
    base: {
        score: number;
        stationId: string;
        lineId?: LineId | string | null;
    },
    config: CongestionConfig | null | undefined,
    now: Date = new Date(),
): OverrideResult {
    const mergedConfig = mergeWithLocalFallback(config);
    const overrides = getCandidateOverrides(mergedConfig, base.stationId, base.lineId ?? null, now);
    let score = base.score;
    const reasonCodes: CongestionReasonCode[] = [];
    const sources: CongestionSource[] = [];
    let activeOverride: CongestionOverride | undefined;

    for (const override of overrides) {
        activeOverride = override;
        reasonCodes.push('remote_override');
        sources.push(override.source ?? 'supabase');
        if (typeof override.boost === 'number') score *= override.boost;
        if (typeof override.dampen === 'number') score *= override.dampen;
        if (typeof override.multiplier === 'number' && override.mode === 'special_event') score *= override.multiplier;
        if (typeof override.scoreDelta === 'number') score += override.scoreDelta;
    }

    return {
        score: clamp(score, 0, 7),
        activeOverride,
        reasonCodes,
        sources,
    };
}

function getLiveSignalAdjustment(input: {
    stationId: string;
    lineId: LineId | string | null;
    now: Date;
    mode: OperationalMode;
    liveSignals?: TrainPresence[];
}): {
    adjustment: number;
    liveSignalCount: number;
    staleSignalCount: number;
    reasonCodes: CongestionReasonCode[];
    sources: CongestionSource[];
    hasStrongCrowdConfirmation: boolean;
} {
    const nowMs = input.now.getTime();
    const reasonCodes: CongestionReasonCode[] = [];
    const sources = new Set<CongestionSource>();
    let freshCrowdSignals = 0;
    let freshDwellSignals = 0;
    let staleSignalCount = 0;

    for (const signal of input.liveSignals ?? []) {
        if (input.mode === 'live' && signal.source === 'simulated') continue;
        if (input.mode === 'live' && signal.lineId === 'MRT7') continue;
        if (signal.lineId !== input.lineId) continue;
        if (signal.stationId !== input.stationId) continue;

        const ageMs = Math.max(0, nowMs - signal.updatedAt);
        const signalCount = Math.max(1, signal.sourceCount ?? signal.memberIds?.length ?? 1);
        const isFresh = ageMs <= 90_000 || signal.freshness === 'fresh' || signal.freshness === 'aging';

        sources.add(signal.source);
        if (!isFresh || signal.freshness === 'stale') {
            staleSignalCount += signalCount;
            continue;
        }

        if (signal.source === 'crowd') freshCrowdSignals += signalCount;
        if (signal.statusCode === 'AT_STATION') freshDwellSignals += signalCount;
    }

    const crowdAdjustment = clamp(freshCrowdSignals * 0.12, 0, 0.6);
    const dwellAdjustment = clamp(freshDwellSignals * 0.08, 0, 0.35);
    if (freshCrowdSignals > 0) reasonCodes.push('crowd_signal');
    if (freshDwellSignals > 0) reasonCodes.push('train_dwell');
    if (staleSignalCount > 0) reasonCodes.push('stale_signal');

    return {
        adjustment: crowdAdjustment + dwellAdjustment,
        liveSignalCount: freshCrowdSignals + freshDwellSignals,
        staleSignalCount,
        reasonCodes,
        sources: Array.from(sources),
        hasStrongCrowdConfirmation: freshCrowdSignals >= 3,
    };
}

function scoreToSnapshot(input: {
    score: number;
    stationId: string;
    timeProfile: CongestionTimeProfile;
    isFriday: boolean;
    dayType: CongestionDayType;
    daypart: CongestionDaypart;
    profileArchetypes: CongestionStationArchetype[];
    direction: Direction | null;
    context?: StationContextPreset;
    activeEvent?: string;
    activeOverride?: CongestionOverride;
    reasonCodes: CongestionReasonCode[];
    sources: CongestionSource[];
    liveSignalCount: number;
    staleSignalCount: number;
    confidence: CongestionConfidence;
}): CongestionSnapshot {
    const roundedScore = Math.round(input.score * 2) / 2;
    const hasExtremeEvidence = input.isFriday || input.reasonCodes.includes('remote_override') || input.liveSignalCount >= 4;
    const activeEvent = input.activeOverride?.label ?? input.activeEvent;
    const description = input.activeOverride?.reason ?? input.context?.reason;
    const tip = input.activeOverride?.tip ?? input.context?.tip;

    const base = {
        score: roundedScore,
        direction: input.direction ? toLegacyDirection(input.direction) : 'COMBINED' as const,
        reason: description,
        tip,
        activeEvent,
        timeWindow: input.timeProfile.name,
        isFriday: input.isFriday,
        confidence: input.confidence,
        reasonCodes: input.reasonCodes,
        sources: input.sources,
        timeProfile: input.timeProfile,
        liveSignalCount: input.liveSignalCount,
        staleSignalCount: input.staleSignalCount,
        dayType: input.dayType,
        daypart: input.daypart,
        profileArchetypes: input.profileArchetypes,
    };

    if (roundedScore >= 4.5 && hasExtremeEvidence) {
        return {
            ...base,
            tier: 'EXTREME',
            label: 'Extreme',
            color: 'bg-red-500',
            description: description || (input.timeProfile.name.includes('FRIDAY') ? 'Friday Rush Hour (Heavy)' : 'Queue is spilling to street level.'),
        };
    }

    if (roundedScore >= 3.5) {
        return {
            ...base,
            tier: 'HIGH',
            label: 'Heavy',
            color: 'bg-orange-500',
            description: description || 'Expect 15-20 min queues.',
        };
    }

    if (roundedScore >= 2.0) {
        return {
            ...base,
            tier: 'MODERATE',
            label: 'Moderate',
            color: 'bg-yellow-500',
            description: description || 'Standing room only.',
        };
    }

    return {
        ...base,
        tier: 'LOW',
        label: 'Light',
        color: 'bg-emerald-500',
        description: description || 'Seats available.',
    };
}

export function getCongestionSnapshot(input: CongestionSnapshotInput): CongestionSnapshot {
    const now = input.now ?? new Date();
    const manila = getManilaDateParts(now);
    const stationId = input.station?.id ?? input.stationId;
    if (!stationId) {
        throw new Error('getCongestionSnapshot requires station or stationId');
    }

    const lineId = parseLineId(stationId, input.station?.lineId ?? input.lineId);
    const config = normalizeCongestionConfig(input.config);
    const timeProfile = getTimeProfile(now, config);
    const dayType = getDayType(now, timeProfile);
    const daypart = getDaypart(now, timeProfile);
    const weights = input.baseline.stationWeights[stationId] ?? input.baseline.defaultWeight;
    const context = input.baseline.stationContext[stationId];
    const stationProfile = input.baseline.stationDemandProfiles?.[stationId];
    const profileArchetypes = stationProfile?.archetypes ?? [];
    const directions = input.direction
        ? [normalizeCongestionDirection(input.direction, stationId, lineId)].filter(Boolean) as Direction[]
        : (lineId === 'LRT2' ? ['EASTBOUND', 'WESTBOUND'] : ['SOUTHBOUND', 'NORTHBOUND']) as Direction[];

    let bestScore = 0;
    let bestDirection: Direction | null = null;
    const reasonCodes = new Set<CongestionReasonCode>(['forecast_weight', 'time_window']);
    const sources = new Set<CongestionSource>(['forecast']);

    if (timeProfile.source !== 'forecast') sources.add(timeProfile.source);
    if (timeProfile.isHolidayMode) reasonCodes.add('holiday_mode');
    if (timeProfile.primaryDirections?.length) reasonCodes.add('direction_flow');

    const stationEvent = getStationEvent(context, now);

    for (const direction of directions) {
        let weight = getDirectionalWeight(weights, direction);
        let multiplier = timeProfile.multiplier;
        const counterFlow = isCounterFlow(stationId, lineId, direction, timeProfile);

        const weekendBoost = applyWeekendMallBoost(multiplier, stationId, now, timeProfile, input.baseline);
        multiplier = weekendBoost.multiplier;
        if (weekendBoost.applied) reasonCodes.add('weekend_mall');

        const stationDemandAdjustment = getStationDemandAdjustment({
            profile: stationProfile,
            dayType,
            daypart,
            direction,
        });
        multiplier *= stationDemandAdjustment.multiplier;
        if (stationDemandAdjustment.applied) {
            reasonCodes.add('station_profile');
            reasonCodes.add('daypart_profile');
        }

        if (manila.weekdayIndex === 5 && timeProfile.name.includes('FRIDAY') && input.baseline.fridayWeightOverrides[stationId]) {
            weight = input.baseline.fridayWeightOverrides[stationId];
        }

        if (stationEvent && !timeProfile.isHolidayMode) {
            multiplier *= stationEvent.boost;
            reasonCodes.add('station_event');
        }

        if (counterFlow && multiplier > 0.5 && manila.weekdayIndex !== 0 && manila.weekdayIndex !== 6 && !input.baseline.mallHotspots.has(stationId)) {
            multiplier *= 0.6;
            reasonCodes.add('counter_flow');
        }

        const score = weight * multiplier;
        if (score > bestScore) {
            bestScore = score;
            bestDirection = direction;
        }
    }

    const overrideResult = applyCongestionOverrides({ score: bestScore, stationId, lineId }, config, now);
    bestScore = overrideResult.score;
    overrideResult.reasonCodes.forEach((code) => reasonCodes.add(code));
    overrideResult.sources.forEach((source) => sources.add(source));

    const live = getLiveSignalAdjustment({
        stationId,
        lineId,
        now,
        mode: input.mode ?? 'live',
        liveSignals: input.liveSignals,
    });
    bestScore = clamp(bestScore + live.adjustment, 0, 7);
    live.reasonCodes.forEach((code) => reasonCodes.add(code));
    live.sources.forEach((source) => sources.add(source));

    let confidence: CongestionConfidence = 'medium';
    if (overrideResult.activeOverride?.source === 'supabase' || live.hasStrongCrowdConfirmation) {
        confidence = 'high';
    }
    if (live.staleSignalCount > 0 && live.liveSignalCount === 0) {
        confidence = 'low';
    }

    return scoreToSnapshot({
        score: bestScore,
        stationId,
        timeProfile,
        isFriday: manila.weekdayIndex === 5,
        dayType,
        daypart,
        profileArchetypes,
        direction: input.direction ? bestDirection : null,
        context,
        activeEvent: stationEvent?.note,
        activeOverride: overrideResult.activeOverride ?? timeProfile.activeOverride,
        reasonCodes: Array.from(reasonCodes),
        sources: Array.from(sources),
        liveSignalCount: live.liveSignalCount,
        staleSignalCount: live.staleSignalCount,
        confidence,
    });
}
