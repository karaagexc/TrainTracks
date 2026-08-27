/**
 * Stall Report — Crowdsourced stall signal broadcasting.
 *
 * When a client detects a stall (train hasn't moved for N minutes),
 * it can POST a stall report to this module. The report is broadcast
 * via Supabase Realtime so other clients on the same line can be
 * proactively warned.
 *
 * Anti-Abuse Measures:
 *  1. Per-device rate limiting (1 report per DEVICE_COOLDOWN_MS)
 *  2. Geo-fenced to Metro Manila rail corridor
 *  3. Must be within MAX_STATION_DIST_KM of a rail station
 *  4. Duration clamped 1–180 min
 *  5. Device ID hashed server-side (privacy)
 *  6. Service hours enforcement (no reports during CLOSED)
 */

import { STATIONS } from '@/data/stations';
import { isBuiltLine } from '@/domain/railway';
import type { LineId } from '@/types';
import { createHash } from 'node:crypto';

export const STALL_REPORT_CHANNEL = 'traintracks:stall-reports';
export const STALL_REPORT_EVENT = 'stall';

// ─── Anti-Abuse Configuration ────────────────────────────────
// These values are exposed in the Config UI and the stall-config API.
export const STALL_ABUSE_CONFIG = {
    /** Minimum ms between stall reports from the same device */
    deviceCooldownMs: 300_000,       // 5 minutes
    /** Max distance (km) from nearest station to accept a report */
    maxStationDistKm: 1.5,
    /** Max reports per device per hour */
    maxReportsPerHour: 6,
    /** Reject reports during service closed hours (23:00–04:30) */
    enforceServiceHours: true,
    /** Minimum stall duration (min) before accepting a report */
    minStallDurationMin: 3,
} as const;

export type StallSeverity = 'possible' | 'confirmed_traffic' | 'confirmed_emergency';
export type StallReason =
    | 'slow_traffic'
    | 'full_stop'
    | 'door_issue'
    | 'medical_emergency'
    | 'power_outage'
    | 'signal_fault'
    | 'crowd_surge'
    | 'unknown';

export interface StallReport {
    id: string;
    lineId: LineId;
    lat: number;
    lng: number;
    nearestStationId: string | null;
    nearestStationName: string | null;
    nearestStationDistKm: number;
    severity: StallSeverity;
    reason: StallReason;
    message: string | null;
    stallDurationMin: number;
    reportedAt: number;
    deviceHash: string;
}

export interface StallReportValidationResult {
    ok: boolean;
    status: number;
    code: 'ok' | 'invalid_payload' | 'invalid_line' | 'invalid_location' | 'invalid_severity' | 'invalid_duration' | 'invalid_device' | 'rate_limited' | 'too_far_from_rail' | 'service_closed';
    message: string;
    report?: StallReport;
    retryAfterMs?: number;
}

const VALID_SEVERITIES = new Set<StallSeverity>(['possible', 'confirmed_traffic', 'confirmed_emergency']);
const VALID_REASONS = new Set<StallReason>([
    'slow_traffic',
    'full_stop',
    'door_issue',
    'medical_emergency',
    'power_outage',
    'signal_fault',
    'crowd_surge',
    'unknown',
]);
const VALID_LINES = new Set<LineId>(['LRT1', 'LRT2', 'MRT3']);

const METRO_MANILA_BOUNDS = {
    minLat: 14.30,
    maxLat: 14.90,
    minLng: 120.80,
    maxLng: 121.30,
};

// ─── In-memory rate limit store ──────────────────────────────
// Maps deviceHash → { lastReportMs, reportCountThisHour, hourStart }
const deviceRateMap = new Map<string, { lastMs: number; count: number; hourStart: number }>();

// Cleanup stale entries every 10 minutes
if (typeof setInterval !== 'undefined') {
    const cleanupInterval = setInterval(() => {
        const cutoff = Date.now() - 3_600_000; // 1 hour
        for (const [hash, entry] of deviceRateMap) {
            if (entry.lastMs < cutoff) deviceRateMap.delete(hash);
        }
    }, 600_000);
    cleanupInterval.unref?.();
}

function checkDeviceRateLimit(deviceHash: string, now: number): { ok: boolean; retryAfterMs?: number } {
    const entry = deviceRateMap.get(deviceHash);
    if (!entry) return { ok: true };

    // Per-report cooldown
    const elapsed = now - entry.lastMs;
    if (elapsed < STALL_ABUSE_CONFIG.deviceCooldownMs) {
        return { ok: false, retryAfterMs: STALL_ABUSE_CONFIG.deviceCooldownMs - elapsed };
    }

    // Hourly cap
    const hourElapsed = now - entry.hourStart;
    if (hourElapsed < 3_600_000 && entry.count >= STALL_ABUSE_CONFIG.maxReportsPerHour) {
        return { ok: false, retryAfterMs: 3_600_000 - hourElapsed };
    }

    return { ok: true };
}

function recordDeviceReport(deviceHash: string, now: number) {
    const entry = deviceRateMap.get(deviceHash);
    if (!entry || now - entry.hourStart >= 3_600_000) {
        deviceRateMap.set(deviceHash, { lastMs: now, count: 1, hourStart: now });
    } else {
        entry.lastMs = now;
        entry.count++;
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object';
}

function readString(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readNumber(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function hashStallDeviceId(deviceId: string): string {
    return createHash('sha256').update(deviceId).digest('hex').slice(0, 12);
}

export function resetStallReportRateLimitsForTests() {
    deviceRateMap.clear();
}

function sanitizeMessage(value: unknown): string | null {
    const raw = readString(value);
    if (!raw) return null;
    const sanitized = raw
        .replace(/[\u0000-\u001f\u007f]/g, ' ')
        .replace(/[<>]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    return sanitized ? sanitized.slice(0, 200) : null;
}

function isWithinBounds(lat: number, lng: number): boolean {
    return lat >= METRO_MANILA_BOUNDS.minLat &&
        lat <= METRO_MANILA_BOUNDS.maxLat &&
        lng >= METRO_MANILA_BOUNDS.minLng &&
        lng <= METRO_MANILA_BOUNDS.maxLng;
}

function isServiceClosed(now: number): boolean {
    if (!STALL_ABUSE_CONFIG.enforceServiceHours) return false;
    const date = new Date(now);
    // Philippine time (UTC+8)
    const utcHour = date.getUTCHours();
    const phHour = (utcHour + 8) % 24;
    return phHour >= 23 || phHour < 4.5;
}

/** Approximate distance in km using equirectangular projection */
function approxDistKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180 * Math.cos((lat1 + lat2) / 2 * Math.PI / 180);
    return R * Math.sqrt(dLat * dLat + dLng * dLng);
}

function findNearestStation(lat: number, lng: number, lineId: LineId): { id: string; name: string; distKm: number } | null {
    let best: { id: string; name: string; distKm: number } | null = null;
    for (const station of STATIONS) {
        if (station.lineId !== lineId || !isBuiltLine(station.lineId)) continue;
        const distKm = approxDistKm(lat, lng, station.latitude, station.longitude);
        if (!best || distKm < best.distKm) {
            best = { id: station.id, name: station.name, distKm };
        }
    }
    return best;
}

function errorResult(
    status: number,
    code: StallReportValidationResult['code'],
    message: string,
    retryAfterMs?: number,
): StallReportValidationResult {
    return { ok: false, status, code, message, retryAfterMs };
}

export function sanitizeStallReportPayload(
    payload: unknown,
    now = Date.now(),
    options: { enforceMemoryRateLimit?: boolean } = {},
): StallReportValidationResult {
    if (!isRecord(payload)) {
        return errorResult(400, 'invalid_payload', 'Stall report payload must be an object.');
    }

    const requestedLineId = readString(payload.lineId) as LineId | null;
    if (!requestedLineId || !VALID_LINES.has(requestedLineId) || !isBuiltLine(requestedLineId)) {
        return errorResult(400, 'invalid_line', 'Stall report only accepts built public rail lines (LRT1, LRT2, MRT3).');
    }

    // Service hours check
    if (isServiceClosed(now)) {
        return errorResult(403, 'service_closed', 'Stall reports are not accepted during service closed hours (23:00\u201304:30 PHT).');
    }

    const deviceId = readString(payload.deviceId);
    if (!deviceId || deviceId.length < 8 || deviceId.length > 128) {
        return errorResult(400, 'invalid_device', 'Stall report requires an anonymous device id (8\u2013128 chars).');
    }

    const deviceHash = hashStallDeviceId(deviceId);

    // Pure-domain callers retain the in-memory limiter. Production routes use
    // the transactional database limiter so retries remain idempotent.
    if (options.enforceMemoryRateLimit !== false) {
        const rateCheck = checkDeviceRateLimit(deviceHash, now);
        if (!rateCheck.ok) {
            return errorResult(429, 'rate_limited',
                `Device is rate-limited. Wait ${Math.ceil((rateCheck.retryAfterMs ?? 0) / 1000)}s before the next report.`,
                rateCheck.retryAfterMs);
        }
    }

    const lineId = readString(payload.lineId) as LineId | null;
    if (!lineId || !VALID_LINES.has(lineId) || !isBuiltLine(lineId)) {
        return errorResult(400, 'invalid_line', 'Stall report only accepts built public rail lines (LRT1, LRT2, MRT3).');
    }

    const lat = readNumber(payload.lat);
    const lng = readNumber(payload.lng);
    if (lat === null || lng === null || !isWithinBounds(lat, lng)) {
        return errorResult(400, 'invalid_location', 'Stall report location is outside the supported rail service area.');
    }

    const severity = readString(payload.severity) as StallSeverity | null;
    if (!severity || !VALID_SEVERITIES.has(severity)) {
        return errorResult(400, 'invalid_severity', 'Stall severity must be: possible, confirmed_traffic, or confirmed_emergency.');
    }

    const reason = (readString(payload.reason) ?? 'unknown') as StallReason;
    if (!VALID_REASONS.has(reason)) {
        return errorResult(400, 'invalid_payload', 'Stall reason is invalid.');
    }

    const stallDurationMin = readNumber(payload.stallDurationMin);
    if (stallDurationMin === null || stallDurationMin < STALL_ABUSE_CONFIG.minStallDurationMin || stallDurationMin > 180) {
        return errorResult(400, 'invalid_duration', `Stall duration must be between ${STALL_ABUSE_CONFIG.minStallDurationMin} and 180 minutes.`);
    }

    // Proximity check — must be near a rail station
    const nearest = findNearestStation(lat, lng, lineId);
    if (!nearest || nearest.distKm > STALL_ABUSE_CONFIG.maxStationDistKm) {
        return errorResult(400, 'too_far_from_rail',
            `Location is ${nearest ? nearest.distKm.toFixed(1) + 'km' : 'unknown distance'} from the nearest ${lineId} station. Must be within ${STALL_ABUSE_CONFIG.maxStationDistKm}km.`);
    }

    // All checks passed — record for rate limiting
    if (options.enforceMemoryRateLimit !== false) {
        recordDeviceReport(deviceHash, now);
    }

    return {
        ok: true,
        status: 200,
        code: 'ok',
        message: 'Stall report accepted.',
        report: {
            id: `STALL-${deviceHash}-${now}`,
            lineId,
            lat,
            lng,
            nearestStationId: nearest.id,
            nearestStationName: nearest.name,
            nearestStationDistKm: Math.round(nearest.distKm * 100) / 100,
            severity,
            reason,
            message: sanitizeMessage(payload.message),
            stallDurationMin,
            reportedAt: now,
            deviceHash,
        },
    };
}
