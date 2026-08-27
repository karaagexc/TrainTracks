import type {
    CongestionDaypart,
    CongestionDayType,
    CongestionStationArchetype,
    StationDemandProfile,
} from '@/domain/congestion/engine';

type DaypartMultipliers = NonNullable<StationDemandProfile['daypartMultipliers']>;

function profile(
    archetypes: CongestionStationArchetype[],
    daypartMultipliers: DaypartMultipliers,
    note?: string,
): StationDemandProfile {
    return { archetypes, daypartMultipliers, note };
}

const d = (values: Partial<Record<CongestionDaypart, number>>) => values;
const table = (values: Partial<Record<CongestionDayType | 'default', Partial<Record<CongestionDaypart, number>>>>) => values;

const TERMINAL_COMMUTER = profile(['terminal', 'feeder'], table({
    default: d({ early_morning: 1.18, am_peak: 1.16, late_morning: 0.9, midday: 0.85, afternoon: 0.95, pm_peak: 1.12, late_evening: 1.05 }),
    monday: d({ am_peak: 1.24 }),
    friday: d({ pm_peak: 1.22, late_evening: 1.12 }),
    saturday: d({ early_morning: 0.8, am_peak: 0.78, late_morning: 0.9, midday: 0.95, afternoon: 1.02, pm_peak: 1.05, late_evening: 0.9 }),
    sunday: d({ early_morning: 0.55, am_peak: 0.6, late_morning: 0.82, midday: 0.9, afternoon: 0.88, pm_peak: 0.75, late_evening: 0.65 }),
    holiday: d({ early_morning: 0.72, am_peak: 0.68, late_morning: 0.82, midday: 0.9, afternoon: 0.95, pm_peak: 0.82, late_evening: 0.7 }),
}));

const TRANSFER_HUB = profile(['transfer_hub', 'feeder'], table({
    default: d({ early_morning: 1.08, am_peak: 1.18, late_morning: 1.05, midday: 1.0, afternoon: 1.04, pm_peak: 1.18, late_evening: 0.96 }),
    monday: d({ am_peak: 1.24 }),
    friday: d({ pm_peak: 1.3, late_evening: 1.08 }),
    saturday: d({ early_morning: 0.75, am_peak: 0.85, late_morning: 1.02, midday: 1.08, afternoon: 1.12, pm_peak: 1.1, late_evening: 0.88 }),
    sunday: d({ early_morning: 0.58, am_peak: 0.7, late_morning: 0.92, midday: 1.0, afternoon: 0.98, pm_peak: 0.86, late_evening: 0.72 }),
    holiday: d({ early_morning: 0.62, am_peak: 0.68, late_morning: 0.84, midday: 0.9, afternoon: 0.94, pm_peak: 0.86, late_evening: 0.72 }),
}));

const CBD_CORE = profile(['cbd'], table({
    default: d({ early_morning: 0.9, am_peak: 1.18, late_morning: 1.0, midday: 0.95, afternoon: 1.0, pm_peak: 1.24, late_evening: 0.78 }),
    monday: d({ am_peak: 1.22 }),
    friday: d({ afternoon: 1.1, pm_peak: 1.38, late_evening: 1.08 }),
    saturday: d({ early_morning: 0.38, am_peak: 0.45, late_morning: 0.55, midday: 0.62, afternoon: 0.7, pm_peak: 0.68, late_evening: 0.55 }),
    sunday: d({ early_morning: 0.3, am_peak: 0.36, late_morning: 0.45, midday: 0.5, afternoon: 0.55, pm_peak: 0.5, late_evening: 0.42 }),
    holiday: d({ early_morning: 0.32, am_peak: 0.38, late_morning: 0.48, midday: 0.55, afternoon: 0.58, pm_peak: 0.52, late_evening: 0.42 }),
}));

const CBD_MALL = profile(['cbd', 'mall'], table({
    default: d({ early_morning: 0.9, am_peak: 1.15, late_morning: 1.0, midday: 0.98, afternoon: 1.05, pm_peak: 1.22, late_evening: 0.82 }),
    monday: d({ am_peak: 1.2 }),
    friday: d({ afternoon: 1.12, pm_peak: 1.34, late_evening: 1.12 }),
    saturday: d({ early_morning: 0.48, am_peak: 0.58, late_morning: 0.85, midday: 1.1, afternoon: 1.24, pm_peak: 1.18, late_evening: 0.9 }),
    sunday: d({ early_morning: 0.36, am_peak: 0.46, late_morning: 0.76, midday: 0.94, afternoon: 1.04, pm_peak: 0.94, late_evening: 0.72 }),
    holiday: d({ early_morning: 0.42, am_peak: 0.5, late_morning: 0.75, midday: 0.92, afternoon: 1.0, pm_peak: 0.94, late_evening: 0.76 }),
}));

const SCHOOL_CORE = profile(['school'], table({
    default: d({ early_morning: 0.92, am_peak: 1.18, late_morning: 1.12, midday: 1.0, afternoon: 1.12, pm_peak: 1.1, late_evening: 0.62 }),
    monday: d({ am_peak: 1.28, late_morning: 1.16 }),
    friday: d({ am_peak: 1.08, afternoon: 1.0, pm_peak: 0.98, late_evening: 0.58 }),
    saturday: d({ early_morning: 0.34, am_peak: 0.42, late_morning: 0.55, midday: 0.62, afternoon: 0.65, pm_peak: 0.55, late_evening: 0.42 }),
    sunday: d({ early_morning: 0.25, am_peak: 0.32, late_morning: 0.38, midday: 0.42, afternoon: 0.44, pm_peak: 0.38, late_evening: 0.32 }),
    holiday: d({ early_morning: 0.25, am_peak: 0.3, late_morning: 0.36, midday: 0.4, afternoon: 0.42, pm_peak: 0.36, late_evening: 0.3 }),
}));

const SCHOOL_LOCAL = profile(['school', 'residential'], table({
    default: d({ early_morning: 0.82, am_peak: 1.05, late_morning: 1.0, midday: 0.9, afternoon: 1.0, pm_peak: 0.96, late_evening: 0.55 }),
    monday: d({ am_peak: 1.14 }),
    friday: d({ pm_peak: 0.9 }),
    saturday: d({ early_morning: 0.34, am_peak: 0.42, late_morning: 0.52, midday: 0.56, afternoon: 0.58, pm_peak: 0.5, late_evening: 0.4 }),
    sunday: d({ early_morning: 0.25, am_peak: 0.3, late_morning: 0.36, midday: 0.38, afternoon: 0.4, pm_peak: 0.35, late_evening: 0.3 }),
    holiday: d({ early_morning: 0.25, am_peak: 0.3, late_morning: 0.35, midday: 0.38, afternoon: 0.4, pm_peak: 0.35, late_evening: 0.3 }),
}));

const GOV_HOSPITAL = profile(['government', 'hospital'], table({
    default: d({ early_morning: 0.82, am_peak: 1.08, late_morning: 1.06, midday: 1.0, afternoon: 0.98, pm_peak: 0.92, late_evening: 0.58 }),
    monday: d({ am_peak: 1.14, late_morning: 1.1 }),
    friday: d({ pm_peak: 0.86 }),
    saturday: d({ early_morning: 0.4, am_peak: 0.48, late_morning: 0.62, midday: 0.65, afternoon: 0.62, pm_peak: 0.52, late_evening: 0.42 }),
    sunday: d({ early_morning: 0.32, am_peak: 0.38, late_morning: 0.48, midday: 0.5, afternoon: 0.48, pm_peak: 0.42, late_evening: 0.34 }),
    holiday: d({ early_morning: 0.34, am_peak: 0.4, late_morning: 0.52, midday: 0.54, afternoon: 0.52, pm_peak: 0.45, late_evening: 0.36 }),
}));

const CHURCH_MARKET = profile(['church', 'market'], table({
    default: d({ early_morning: 0.82, am_peak: 0.95, late_morning: 1.0, midday: 1.02, afternoon: 0.98, pm_peak: 0.9, late_evening: 0.72 }),
    friday: d({ late_morning: 1.18, midday: 1.22, afternoon: 1.2, pm_peak: 1.12, late_evening: 0.84 }),
    saturday: d({ early_morning: 0.62, am_peak: 0.75, late_morning: 0.92, midday: 1.0, afternoon: 1.02, pm_peak: 0.95, late_evening: 0.72 }),
    sunday: d({ early_morning: 0.82, am_peak: 1.02, late_morning: 1.32, midday: 1.22, afternoon: 1.04, pm_peak: 0.9, late_evening: 0.68 }),
    holiday: d({ early_morning: 0.68, am_peak: 0.8, late_morning: 1.02, midday: 1.08, afternoon: 1.0, pm_peak: 0.82, late_evening: 0.62 }),
}));

const BUS_TERMINAL = profile(['bus_terminal', 'terminal', 'feeder'], table({
    default: d({ early_morning: 1.22, am_peak: 1.2, late_morning: 1.02, midday: 0.95, afternoon: 1.0, pm_peak: 1.18, late_evening: 1.05 }),
    monday: d({ am_peak: 1.26 }),
    friday: d({ afternoon: 1.08, pm_peak: 1.32, late_evening: 1.18 }),
    saturday: d({ early_morning: 0.95, am_peak: 0.95, late_morning: 1.04, midday: 1.08, afternoon: 1.12, pm_peak: 1.08, late_evening: 0.94 }),
    sunday: d({ early_morning: 0.78, am_peak: 0.82, late_morning: 0.94, midday: 1.0, afternoon: 1.08, pm_peak: 1.0, late_evening: 0.82 }),
    holiday: d({ early_morning: 0.9, am_peak: 0.9, late_morning: 1.08, midday: 1.18, afternoon: 1.3, pm_peak: 1.18, late_evening: 0.95 }),
}));

const AIRPORT_WORKER = profile(['airport', 'feeder'], table({
    default: d({ early_morning: 1.04, am_peak: 0.98, late_morning: 0.95, midday: 0.98, afternoon: 1.0, pm_peak: 1.0, late_evening: 1.02 }),
    saturday: d({ early_morning: 0.88, am_peak: 0.88, late_morning: 0.92, midday: 0.98, afternoon: 1.02, pm_peak: 0.98, late_evening: 0.9 }),
    sunday: d({ early_morning: 0.75, am_peak: 0.78, late_morning: 0.85, midday: 0.92, afternoon: 0.96, pm_peak: 0.9, late_evening: 0.82 }),
    holiday: d({ early_morning: 0.85, am_peak: 0.82, late_morning: 0.9, midday: 0.96, afternoon: 1.0, pm_peak: 0.92, late_evening: 0.86 }),
}));

const MARKET_LOCAL = profile(['market', 'mixed'], table({
    default: d({ early_morning: 0.78, am_peak: 0.95, late_morning: 0.98, midday: 0.92, afternoon: 0.9, pm_peak: 0.88, late_evening: 0.62 }),
    saturday: d({ early_morning: 0.68, am_peak: 0.75, late_morning: 0.9, midday: 0.92, afternoon: 0.88, pm_peak: 0.78, late_evening: 0.58 }),
    sunday: d({ early_morning: 0.62, am_peak: 0.72, late_morning: 0.86, midday: 0.88, afternoon: 0.82, pm_peak: 0.72, late_evening: 0.52 }),
    holiday: d({ early_morning: 0.55, am_peak: 0.62, late_morning: 0.76, midday: 0.8, afternoon: 0.78, pm_peak: 0.68, late_evening: 0.5 }),
}));

const MIXED_LOCAL = profile(['mixed', 'feeder'], table({
    default: d({ early_morning: 0.78, am_peak: 0.98, late_morning: 0.86, midday: 0.78, afternoon: 0.82, pm_peak: 0.94, late_evening: 0.62 }),
    monday: d({ am_peak: 1.04 }),
    friday: d({ pm_peak: 1.02 }),
    saturday: d({ early_morning: 0.52, am_peak: 0.62, late_morning: 0.72, midday: 0.78, afternoon: 0.82, pm_peak: 0.76, late_evening: 0.56 }),
    sunday: d({ early_morning: 0.42, am_peak: 0.5, late_morning: 0.62, midday: 0.66, afternoon: 0.66, pm_peak: 0.58, late_evening: 0.44 }),
    holiday: d({ early_morning: 0.42, am_peak: 0.48, late_morning: 0.58, midday: 0.64, afternoon: 0.66, pm_peak: 0.58, late_evening: 0.44 }),
}));

const RESIDENTIAL = profile(['residential'], table({
    default: d({ early_morning: 0.72, am_peak: 0.9, late_morning: 0.68, midday: 0.62, afternoon: 0.68, pm_peak: 0.84, late_evening: 0.54 }),
    monday: d({ am_peak: 0.96 }),
    friday: d({ pm_peak: 0.9 }),
    saturday: d({ early_morning: 0.42, am_peak: 0.5, late_morning: 0.58, midday: 0.62, afternoon: 0.66, pm_peak: 0.62, late_evening: 0.48 }),
    sunday: d({ early_morning: 0.34, am_peak: 0.42, late_morning: 0.5, midday: 0.54, afternoon: 0.54, pm_peak: 0.48, late_evening: 0.38 }),
    holiday: d({ early_morning: 0.32, am_peak: 0.38, late_morning: 0.46, midday: 0.5, afternoon: 0.52, pm_peak: 0.46, late_evening: 0.36 }),
}));

const QUIET = profile(['quiet', 'residential'], table({
    default: d({ early_morning: 0.58, am_peak: 0.72, late_morning: 0.52, midday: 0.48, afternoon: 0.5, pm_peak: 0.62, late_evening: 0.4 }),
    monday: d({ am_peak: 0.78 }),
    friday: d({ pm_peak: 0.66 }),
    saturday: d({ early_morning: 0.3, am_peak: 0.36, late_morning: 0.42, midday: 0.45, afternoon: 0.46, pm_peak: 0.42, late_evening: 0.32 }),
    sunday: d({ early_morning: 0.25, am_peak: 0.3, late_morning: 0.34, midday: 0.36, afternoon: 0.36, pm_peak: 0.32, late_evening: 0.25 }),
    holiday: d({ early_morning: 0.24, am_peak: 0.28, late_morning: 0.32, midday: 0.34, afternoon: 0.34, pm_peak: 0.3, late_evening: 0.24 }),
}));

const INDUSTRIAL = profile(['industrial', 'feeder'], table({
    default: d({ early_morning: 0.86, am_peak: 1.08, late_morning: 0.78, midday: 0.7, afternoon: 0.8, pm_peak: 1.02, late_evening: 0.58 }),
    monday: d({ am_peak: 1.12 }),
    friday: d({ pm_peak: 1.05 }),
    saturday: d({ early_morning: 0.35, am_peak: 0.42, late_morning: 0.48, midday: 0.52, afternoon: 0.55, pm_peak: 0.48, late_evening: 0.36 }),
    sunday: d({ early_morning: 0.25, am_peak: 0.3, late_morning: 0.34, midday: 0.36, afternoon: 0.36, pm_peak: 0.32, late_evening: 0.25 }),
    holiday: d({ early_morning: 0.25, am_peak: 0.3, late_morning: 0.34, midday: 0.36, afternoon: 0.38, pm_peak: 0.32, late_evening: 0.25 }),
}));

export const STATION_DEMAND_PROFILES: Record<string, StationDemandProfile> = {
    'M3-01': profile(['terminal', 'mall', 'feeder'], TERMINAL_COMMUTER.daypartMultipliers!),
    'M3-02': MIXED_LOCAL,
    'M3-03': GOV_HOSPITAL,
    'M3-04': profile(['transfer_hub', 'mall'], TRANSFER_HUB.daypartMultipliers!),
    'M3-05': profile(['mall', 'residential'], MIXED_LOCAL.daypartMultipliers!),
    'M3-06': CBD_MALL,
    'M3-07': CBD_MALL,
    'M3-08': profile(['cbd', 'residential'], CBD_CORE.daypartMultipliers!),
    'M3-09': profile(['transfer_hub', 'feeder', 'cbd'], TRANSFER_HUB.daypartMultipliers!),
    'M3-10': CBD_CORE,
    'M3-11': CBD_MALL,
    'M3-12': INDUSTRIAL,
    'M3-13': profile(['terminal', 'transfer_hub', 'bus_terminal'], BUS_TERMINAL.daypartMultipliers!),

    'L1-20': profile(['terminal', 'mall', 'feeder'], TERMINAL_COMMUTER.daypartMultipliers!),
    'L1-19': MIXED_LOCAL,
    'L1-18': profile(['terminal', 'market', 'feeder'], TERMINAL_COMMUTER.daypartMultipliers!),
    'L1-17': RESIDENTIAL,
    'L1-16': QUIET,
    'L1-15': RESIDENTIAL,
    'L1-14': MARKET_LOCAL,
    'L1-13': profile(['mall', 'hospital'], CBD_MALL.daypartMultipliers!),
    'L1-12': SCHOOL_LOCAL,
    'L1-11': profile(['transfer_hub', 'school'], TRANSFER_HUB.daypartMultipliers!),
    'L1-10': CHURCH_MARKET,
    'L1-09': profile(['government', 'school'], GOV_HOSPITAL.daypartMultipliers!),
    'L1-08': GOV_HOSPITAL,
    'L1-07': profile(['school', 'hospital'], SCHOOL_LOCAL.daypartMultipliers!),
    'L1-06': MIXED_LOCAL,
    'L1-05': SCHOOL_CORE,
    'L1-04': profile(['bus_terminal', 'cbd'], BUS_TERMINAL.daypartMultipliers!),
    'L1-03': MIXED_LOCAL,
    'L1-02': TRANSFER_HUB,
    'L1-01': profile(['church', 'market', 'terminal'], CHURCH_MARKET.daypartMultipliers!),
    'L1-21': profile(['church', 'mall'], CHURCH_MARKET.daypartMultipliers!),
    'L1-22': AIRPORT_WORKER,
    'L1-23': BUS_TERMINAL,
    'L1-24': AIRPORT_WORKER,
    'L1-25': profile(['terminal', 'feeder'], TERMINAL_COMMUTER.daypartMultipliers!),

    'L2-01': profile(['terminal', 'transfer_hub', 'school', 'market'], TRANSFER_HUB.daypartMultipliers!),
    'L2-02': SCHOOL_CORE,
    'L2-03': SCHOOL_CORE,
    'L2-04': profile(['mall', 'school', 'hospital'], CBD_MALL.daypartMultipliers!),
    'L2-05': RESIDENTIAL,
    'L2-06': profile(['hospital', 'mixed'], GOV_HOSPITAL.daypartMultipliers!),
    'L2-07': QUIET,
    'L2-08': profile(['transfer_hub', 'mall'], TRANSFER_HUB.daypartMultipliers!),
    'L2-09': SCHOOL_LOCAL,
    'L2-10': SCHOOL_CORE,
    'L2-11': MIXED_LOCAL,
    'L2-12': profile(['mall', 'feeder'], CBD_MALL.daypartMultipliers!),
    'L2-13': TERMINAL_COMMUTER,
};
