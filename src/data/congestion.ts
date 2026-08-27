import type { Direction, LineId, OperationalMode } from "@/types";
import type { TrainPresence } from "@/types/train";
import {
    DEFAULT_CONGESTION_CONFIG,
    getCongestionSnapshot,
    getTimeProfile,
    normalizeCongestionDirection,
    type CongestionConfidence,
    type CongestionConfig,
    type CongestionDaypart,
    type CongestionDayType,
    type CongestionReasonCode,
    type CongestionSnapshot,
    type CongestionSource,
    type CongestionStationArchetype,
    type CongestionTier,
} from "@/domain/congestion/engine";
import { STATION_DEMAND_PROFILES } from "@/data/congestionProfiles";

// Types
export { DEFAULT_CONGESTION_CONFIG, getCongestionSnapshot, getTimeProfile };
export type {
    CongestionConfidence,
    CongestionConfig,
    CongestionDaypart,
    CongestionDayType,
    CongestionReasonCode,
    CongestionSnapshot,
    CongestionSource,
    CongestionStationArchetype,
    CongestionTier,
};

export interface CongestionResult {
    score: number;
    tier: CongestionTier;
    label: string;
    description: string;
    color: string;
    direction?: 'NORTH' | 'SOUTH' | 'COMBINED';
    // Adaptive intelligence fields
    reason?: string;       // WHY this station is busy (from STATION_CONTEXT)
    tip?: string;          // Station-specific tip
    activeEvent?: string;  // Currently active day-of-week event note
    timeWindow: string;    // Current time window name
    isFriday: boolean;     // Whether it's Friday
    confidence?: CongestionConfidence;
    reasonCodes?: CongestionReasonCode[];
    sources?: CongestionSource[];
    liveSignalCount?: number;
    staleSignalCount?: number;
    dayType?: CongestionDayType;
    daypart?: CongestionDaypart;
    profileArchetypes?: CongestionStationArchetype[];
}

// Direction Mapping: 
// POSITIVE Order (Increasing ID/Index) -> Southbound (L1, M3), Eastbound (L2)
// NEGATIVE Order (Decreasing ID/Index) -> Northbound (L1, M3), Westbound (L2)
export type DirectionalWeight = {
    positive: number; // SB / EB / Cavite-Outbound
    negative: number; // NB / WB / Cavite-Inbound
};

// Default fallback
const DEFAULT_WEIGHT: DirectionalWeight = { positive: 2, negative: 2 };

// ----------------------------------------------------------------------
// 1. STATION PRESETS (Based on Audit Data)
// ----------------------------------------------------------------------

// Helper: P=Positive(South/East), N=Negative(North/West)
const W = (p: number, n: number): DirectionalWeight => ({ positive: p, negative: n });

export const STATION_WEIGHTS: Record<string, DirectionalWeight> = {
    // --- MRT-3 (Yellow) ---
    'M3-01': W(5, 5), // North Ave [SUPER HOTSPOT] -> Extreme
    'M3-02': W(4.5, 3), // Quezon Ave (Very Heavy) — Guide: "Very Heavy"
    'M3-03': W(3.5, 3), // GMA-Kamuning (Medium-Heavy)
    'M3-04': W(5, 5), // Cubao [CRITICAL] -> Extreme
    'M3-05': W(2, 2), // Santolan (Light-Medium) -> 2
    'M3-06': W(4, 4), // Ortigas (Heavy)
    'M3-07': W(4, 4), // Shaw [SUPER HOTSPOT] -> Heavy/Extreme (Guide says Heavy)
    'M3-08': W(3.5, 3.5), // Boni (Medium-Heavy)
    'M3-09': W(5, 5), // Guadalupe [SUPER HOTSPOT] -> Heavy/Extreme
    'M3-10': W(4, 3.5), // Buendia (Heavy)
    'M3-11': W(5, 5), // Ayala [CRITICAL] -> Extreme
    'M3-12': W(3.5, 3.5), // Magallanes (Medium-Heavy)
    'M3-13': W(5, 5), // Taft [SUPER HOTSPOT] -> Extreme

    // --- LRT-1 (Green) Main ---
    'L1-20': W(4, 4), // FPJ (Roosevelt) [SUPER HOTSPOT] -> Heavy
    'L1-19': W(4, 3), // Balintawak (Heavy)
    'L1-18': W(4, 4), // Monumento [SUPER HOTSPOT] -> Heavy
    'L1-17': W(3, 3), // 5th Ave (Medium)
    'L1-16': W(1, 1), // R Papa (Quietest) -> Light
    'L1-15': W(2, 2), // Abad Santos (Light-Medium)
    'L1-14': W(3, 3), // Blumentritt (Medium)
    'L1-13': W(4, 3), // Tayuman (Heavy)
    'L1-12': W(3, 3), // Bambang (Medium)
    'L1-11': W(5, 5), // D. Jose [SUPER HOTSPOT] -> Heavy/Extreme
    'L1-10': W(4, 4), // Carriedo (Heavy)
    'L1-09': W(4, 4), // Central (Heavy)
    'L1-08': W(3.5, 3.5), // UN (Medium-Heavy)
    'L1-07': W(4, 4), // Pedro Gil (Heavy)
    'L1-06': W(3, 3), // Quirino (Medium)
    'L1-05': W(4, 3), // Vito Cruz (Heavy)
    'L1-04': W(4, 4), // Gil Puyat [SUPER HOTSPOT] -> Heavy
    'L1-03': W(3, 3), // Libertad (Medium)
    'L1-02': W(5, 5), // EDSA [CRITICAL] -> Extreme
    'L1-01': W(3.5, 4), // Baclaran (Moderate/Heavy)

    // --- LRT-1 Cavite Ext ---
    'L1-21': W(3.5, 3.5), // Redemptorist (Medium-Heavy)
    'L1-22': W(2, 2), // MIA (Light/Medium) -> 2
    'L1-23': W(5, 5), // PITX [SUPER HOTSPOT] -> Extreme
    'L1-24': W(3, 3), // Ninoy Aquino (Medium)
    'L1-25': W(4, 4), // Dr. Santos [SUPER HOTSPOT] -> Medium/Heavy -> 4

    // --- LRT-2 (Blue) ---
    'L2-01': W(5, 5), // Recto [SUPER HOTSPOT] -> Extreme
    'L2-02': W(4, 4), // Legarda (Heavy)
    'L2-03': W(4, 4), // Pureza (Heavy)
    'L2-04': W(3.5, 3.5), // V Mapa (Medium-Heavy)
    'L2-05': W(2, 2), // J Ruiz (Light-Medium)
    'L2-06': W(3, 3), // Gilmore (Medium)
    'L2-07': W(1, 1), // Betty Go (Quietest) -> Light
    'L2-08': W(5, 5), // Cubao [CRITICAL] -> Extreme
    'L2-09': W(3, 3), // Anonas (Medium)
    'L2-10': W(4, 4), // Katipunan [SUPER HOTSPOT] -> Heavy
    'L2-11': W(3.5, 3), // Santolan (Medium/Heavy) -> 3.5
    'L2-12': W(3.5, 3), // Marikina (Medium/Heavy) -> 3.5
    'L2-13': W(5, 5), // Antipolo [SUPER HOTSPOT] -> Extreme
};

// ----------------------------------------------------------------------
// 1b. STATION CONTEXT (Adaptive Intelligence)
// ----------------------------------------------------------------------
// Per-station reasons, tips, and day-of-week event overrides
// sourced from the Quick Commuter Crowd Guide.

export interface StationEvent {
    day: number;         // 0=Sun, 1=Mon, ..., 5=Fri, 6=Sat
    boost: number;       // Multiplier boost (e.g., 1.3 = +30%)
    note: string;        // Human-readable event description
    timeRange?: [number, number]; // Optional hour range [start, end]
}

export interface StationContext {
    reason: string;      // WHY this station is busy
    tip?: string;        // Station-specific commuter tip
    events?: StationEvent[];  // Day-of-week special events
}

export const STATION_CONTEXT: Record<string, StationContext> = {
    // --- MRT-3 ---
    'M3-01': { reason: 'North Terminal — TriNoma & SM North EDSA transfers', tip: 'AM "snake" queue can extend into the mall walkway' },
    'M3-02': { reason: 'Commonwealth & Fairview bus transfers, Eton Centris' },
    'M3-03': { reason: 'GMA Network, Timog, LTO & PSA offices' },
    'M3-04': { reason: 'LRT-2 interconnect — Gateway Mall transfer crush', tip: 'Farmers Plaza walkway is a major choke point' },
    'M3-05': { reason: 'Camp Crame & Greenhills — most relaxed MRT-3 station' },
    'M3-06': { reason: 'Ortigas CBD — SM Megamall & Robinsons Galleria', tip: 'Narrow platforms make it feel more crowded than it is' },
    'M3-07': { reason: 'SM Megamall, Shangri-La & Greenfield District' },
    'M3-08': { reason: 'Dense condo area — SM Light, Pioneer, BPO offices' },
    'M3-09': { reason: '"Jeepney Capital" — main Makati CBD transfer hub', tip: 'Stairs and escalators are notoriously packed' },
    'M3-10': { reason: 'Makati CBD gateway — Jupiter/Zodiac side & BPO offices' },
    'M3-11': { reason: 'Heart of Financial District — BGC bus transfers, Greenbelt & Glorietta', tip: 'PM queue loops around station exterior (5:30-8PM)' },
    'M3-12': { reason: 'Industrial Makati & SLEX/Alabang bus transfers' },
    'M3-13': { reason: 'South Terminal — LRT-1 interconnect, MOA & Cavite transfers', tip: 'LRT-1 connecting walkway is permanently slow during rush' },

    // --- LRT-1 ---
    'L1-20': { reason: 'North Terminal — EDSA Carousel & Fairview buses', tip: 'Trains often full before leaving this station in AM' },
    'L1-19': { reason: 'Ayala Cloverleaf & North-bound bus terminals' },
    'L1-18': { reason: 'Caloocan/Malabon/Navotas transport hub' },
    'L1-17': { reason: 'Caloocan residential area' },
    'L1-16': { reason: 'Quietest LRT-1 station — cemeteries & residential' },
    'L1-15': { reason: 'Mostly residential — easy boarding' },
    'L1-14': { reason: 'Major jeepney routes & market area' },
    'L1-13': {
        reason: 'SM San Lazaro & Dept. of Health',
        events: [{ day: 6, boost: 1.2, note: 'Weekend SM San Lazaro shoppers' }, { day: 0, boost: 1.2, note: 'Weekend SM San Lazaro shoppers' }]
    },
    'L1-12': { reason: 'UST & medical supply stores' },
    'L1-11': { reason: 'LRT-2 interconnect (Recto) — UBelt student transfers', tip: 'Bridge crossing is a PM bottleneck' },
    'L1-10': {
        reason: 'Quiapo Church & Escolta shopping district',
        events: [{ day: 5, boost: 1.3, note: 'Quiapo Friday — devotee crowds' }],
        tip: 'Avoid on Fridays due to intense shopper/devotee crowds'
    },
    'L1-09': { reason: 'City Hall, SM Manila, Mapua & PLM' },
    'L1-08': { reason: 'NBI, WHO, Manila Doctors & Luneta' },
    'L1-07': { reason: 'UP Manila, PGH Hospital & Robinsons Manila' },
    'L1-06': { reason: 'Malate district, Manila Zoo & government bureaus' },
    'L1-05': { reason: 'DLSU, CSB & St. Scholastica — student schedule spikes' },
    'L1-04': { reason: 'Provincial bus terminals (DLTB, JAC) & Makati CBD workers' },
    'L1-03': { reason: 'Pasay local traffic, Victory Mall & DFA appointments' },
    'L1-02': { reason: 'MRT-3 interconnect — most congested point on LRT-1', tip: 'Platforms packed to the edge during rush hours' },
    'L1-01': { reason: 'Former terminal — flea markets & jeepney terminals' },
    'L1-21': {
        reason: 'Near Baclaran Church',
        events: [{ day: 3, boost: 1.3, note: 'Baclaran Wednesday — extra devotee crowds' }],
        tip: 'Avoid on Wednesdays (Baclaran Day)'
    },
    'L1-22': { reason: 'Airport workers & NAIA travelers — consistent but manageable' },
    'L1-23': { reason: 'PITX bus transfers — Cavite & Batangas commuters', tip: 'Heavy foot traffic all day, peaks sharply in rush hours' },
    'L1-24': { reason: 'Parañaque residential — La Huerta area' },
    'L1-25': { reason: 'South Terminal — Sucat, Parañaque & Cavite commuters' },

    // --- LRT-2 ---
    'L2-01': { reason: 'West Terminal — FEU, UE & Divisoria shopping district', tip: 'PM exodus to Rizal peaks 5:30-7:30PM' },
    'L2-02': { reason: 'University Belt gateway — San Beda, CEU, Arellano' },
    'L2-03': {
        reason: 'PUP (Polytechnic University) — student surge station',
        events: [
            { day: 1, boost: 1.3, note: 'PUP class shift', timeRange: [11.5, 12.5] },
            { day: 1, boost: 1.3, note: 'PUP class shift', timeRange: [17.5, 18.5] },
            { day: 2, boost: 1.3, note: 'PUP class shift', timeRange: [11.5, 12.5] },
            { day: 2, boost: 1.3, note: 'PUP class shift', timeRange: [17.5, 18.5] },
            { day: 3, boost: 1.3, note: 'PUP class shift', timeRange: [11.5, 12.5] },
            { day: 3, boost: 1.3, note: 'PUP class shift', timeRange: [17.5, 18.5] },
            { day: 4, boost: 1.3, note: 'PUP class shift', timeRange: [11.5, 12.5] },
            { day: 4, boost: 1.3, note: 'PUP class shift', timeRange: [17.5, 18.5] },
            { day: 5, boost: 1.3, note: 'PUP class shift', timeRange: [11.5, 12.5] },
            { day: 5, boost: 1.3, note: 'PUP class shift', timeRange: [17.5, 18.5] },
        ],
        tip: 'Platform gets packed instantly during PUP class changes'
    },
    'L2-04': { reason: 'SM Sta. Mesa & UERM — shoppers + students' },
    'L2-05': { reason: 'San Juan residential — easy boarding' },
    'L2-06': { reason: 'PC Gilmore IT center, St. Paul & St. Luke\'s' },
    'L2-07': { reason: 'Quietest LRT-2 station — New Manila residential' },
    'L2-08': { reason: 'MRT-3 interconnect — Gateway Mall & BPO workers', tip: 'Long baggage check queues' },
    'L2-09': { reason: 'TIP & World Citi Med — Project 2/3 residents' },
    'L2-10': { reason: 'Ateneo, UP Diliman & Miriam College — underground platform', tip: 'Platform gets very humid and crowded' },
    'L2-11': { reason: 'Former terminal — Marikina Riverbanks transfers' },
    'L2-12': { reason: 'Sta. Lucia East & Robinsons Metro East' },
    'L2-13': { reason: 'East Terminal — all Rizal commuters (Cainta, Taytay, Antipolo)', tip: 'Security line snakes to street level 6-7:30AM' },
};

// Friday specific overrides (Boost specific hubs)
const FRIDAY_WEIGHT_OVERRIDES: Record<string, number> = {
    'M3-06': 5, // Ortigas Extreme
    'M3-11': 5, // Ayala Extreme
    'L1-10': 5, // Carriedo — Quiapo Friday
};


// ----------------------------------------------------------------------
// 2. TIME WINDOW LOGIC
// ----------------------------------------------------------------------

interface TimeWindow {
    name: string;
    multiplier: number;
    primaryFlow?: 'POSITIVE' | 'NEGATIVE' | 'CAVITE_SPECIAL';
    isHolidayMode?: boolean;
}

export function getTimeMultiplier(date: Date, config: CongestionConfig | null = DEFAULT_CONGESTION_CONFIG): TimeWindow {
    const profile = getTimeProfile(date, config);
    const hasPositiveFlow = profile.primaryDirections?.some((dir) => dir === 'SOUTHBOUND' || dir === 'EASTBOUND');
    const hasNegativeFlow = profile.primaryDirections?.some((dir) => dir === 'NORTHBOUND' || dir === 'WESTBOUND');

    return {
        name: profile.name,
        multiplier: profile.multiplier,
        primaryFlow: hasPositiveFlow && !hasNegativeFlow
            ? 'POSITIVE'
            : hasNegativeFlow && !hasPositiveFlow
                ? 'NEGATIVE'
                : undefined,
        isHolidayMode: profile.isHolidayMode,
    };
}

// ----------------------------------------------------------------------
// 4. MAIN GETTER
// ----------------------------------------------------------------------

// Stations heavily affected by Mall Traffic (Weekends)
const MALL_HOTSPOTS = new Set([
    'M3-01', // North Ave (Trinoma/SM North)
    'M3-04', // Araneta Cubao (Gateway/Farmers)
    'M3-05', // Santolan-Annapolis (Greenhills - Walking distance/Jeep)
    'M3-06', // Ortigas (Megamall/Podium)
    'M3-07', // Shaw (Shangri-La/Megamall)
    'M3-11', // Ayala (Greenbelt/Glorietta/OneAyala)
    'M3-13', // Taft (Metropoint)
    'L2-08', // Araneta Cubao
    'L1-02', // EDSA (Metropoint)
    'L1-20', // Roosevelt (Waltermart/Muñoz Market - slight hotspot)
    'L1-13', // Tayuman (SM San Lazaro — Guide: "Very busy on weekends")
    'L2-04', // V. Mapa (SM Sta. Mesa — Guide: "Heavy shopping crowds on weekends")
]);

// Hubs excluded from some directional logic optimizations because they are always busy
const HUB_STATIONS = new Set(['M3-04', 'L2-08', 'L1-18', 'L1-02', 'M3-13', 'L1-23']);

export function getCongestionLevel(
    stationId: string,
    date: Date = new Date(),
    direction?: 'NORTH' | 'SOUTH' | Direction | null,
    lineId?: string | LineId | null,
    config: CongestionConfig | null = DEFAULT_CONGESTION_CONFIG,
    liveSignals: TrainPresence[] = [],
    mode: OperationalMode = 'live',
): CongestionResult {
    const canonicalDirection = normalizeCongestionDirection(direction, stationId, lineId);
    return getCongestionSnapshot({
        stationId,
        lineId,
        direction: canonicalDirection,
        now: date,
        mode,
        liveSignals,
        config,
        baseline: {
            stationWeights: STATION_WEIGHTS,
            defaultWeight: DEFAULT_WEIGHT,
            stationContext: STATION_CONTEXT,
            stationDemandProfiles: STATION_DEMAND_PROFILES,
            fridayWeightOverrides: FRIDAY_WEIGHT_OVERRIDES,
            mallHotspots: MALL_HOTSPOTS,
            hubStations: HUB_STATIONS,
        },
    });
}

export function isRushHourWindow(timeWindow: string | null | undefined): boolean {
    if (!timeWindow) return false;
    return timeWindow.includes('RUSH');
}

export function shouldDisplayCongestionOverlay(congestion: Pick<CongestionResult, 'tier' | 'timeWindow' | 'reasonCodes' | 'activeEvent'> | null | undefined): boolean {
    if (!congestion || congestion.tier === 'LOW') return false;
    if (congestion.timeWindow === 'CLOSED') return false;

    const hasLiveOrOverrideEvidence =
        !!congestion.activeEvent ||
        congestion.reasonCodes?.some((code) => (
            code === 'remote_override' ||
            code === 'crowd_signal' ||
            code === 'train_dwell' ||
            code === 'station_event'
        ));

    if (isRushHourWindow(congestion.timeWindow)) return true;
    if (hasLiveOrOverrideEvidence && (congestion.tier === 'HIGH' || congestion.tier === 'EXTREME')) return true;

    return false;
}

// ----------------------------------------------------------------------
// 5. HELPER: Score to UI
// ----------------------------------------------------------------------

// ----------------------------------------------------------------------
// 6. ALERT TRIGGER
// ----------------------------------------------------------------------
export function shouldAlertCongestion(
    stationId: string,
    date: Date = new Date(),
    direction?: 'NORTH' | 'SOUTH' | Direction | null,
    lineId?: string | LineId | null,
    config?: CongestionConfig | null,
    liveSignals?: TrainPresence[],
    mode?: OperationalMode,
): boolean {
    const { tier } = getCongestionLevel(stationId, date, direction, lineId, config, liveSignals, mode);
    return tier === 'HIGH' || tier === 'EXTREME';
}
