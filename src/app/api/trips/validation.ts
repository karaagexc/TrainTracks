import { STATIONS } from '@/data/stations';
import { isRecord, type ValidationResult } from '@/domain/config';

export function boundedNumber(value: unknown, max: number, integer = false): number | null {
    if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 && parsed <= max && (!integer || Number.isInteger(parsed)) ? parsed : null;
}

export function boundedText(value: unknown, max = 120): string | null {
    return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max ? value.trim() : null;
}

function timestamp(value: unknown): string | null {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
    const datePart = value.slice(0, 10);
    const day = Date.parse(`${datePart}T00:00:00Z`);
    const ms = Date.parse(value);
    if (!Number.isFinite(day) || new Date(day).toISOString().slice(0, 10) !== datePart
        || !Number.isFinite(ms) || ms < Date.UTC(2000, 0, 1) || ms > Date.now() + 300000) return null;
    return new Date(ms).toISOString();
}

const lines = ['LRT1', 'LRT2', 'MRT3'];
function validDirection(value: unknown, line?: string): boolean {
    return value === null || (typeof value === 'string' && (line === 'LRT2'
        ? ['EASTBOUND', 'WESTBOUND'] : line ? ['NORTHBOUND', 'SOUTHBOUND']
            : ['NORTHBOUND', 'SOUTHBOUND', 'EASTBOUND', 'WESTBOUND']).includes(value));
}

export function validateTrip(body: unknown, owner: string, idempotencyKey: string | null): ValidationResult<Record<string, unknown>> {
    if (!isRecord(body)) return { ok: false, error: 'Invalid JSON body.' };
    const clientTripId = boundedText(body.client_trip_id ?? idempotencyKey, 160);
    const originId = boundedText(body.origin_id, 80);
    const destinationId = boundedText(body.destination_id, 80);
    const origin = STATIONS.find(station => station.id === originId);
    const destination = STATIONS.find(station => station.id === destinationId);
    const line = boundedText(body.line_id, 20);
    const destinationLine = body.destination_line_id ?? destination?.lineId;
    const originName = boundedText(body.origin_name);
    const destinationName = boundedText(body.destination_name);
    const started = timestamp(body.started_at);
    const fare = body.fare === undefined ? 0 : boundedNumber(body.fare, 10000);
    const distance = body.distance_km === undefined ? 0 : boundedNumber(body.distance_km, 500);
    const duration = body.duration_minutes == null ? null : boundedNumber(body.duration_minutes, 1440, true);
    const direction = body.direction === undefined ? null : body.direction;
    if (!clientTripId || !origin || !destination || !originName || !destinationName || !line || !lines.includes(line)
        || origin.lineId !== line || destination.lineId !== destinationLine || !lines.includes(destination.lineId)
        || !['SJT', 'SVC', 'CONCESSION'].includes(body.ticket_type as string)
        || !started || fare === null || distance === null || (body.duration_minutes != null && duration === null)
        || !validDirection(direction, line)) {
        return { ok: false, error: 'Invalid trip catalog, enum, timestamp, or numeric fields.' };
    }
    if (body.user_id !== undefined && body.user_id !== owner) {
        return { ok: false, error: 'Trip owner does not match the authenticated account.' };
    }
    const completed = body.completed_at === undefined
        ? new Date(duration === null ? Date.now() : Date.parse(started) + duration * 60000).toISOString()
        : timestamp(body.completed_at);
    if (!completed || Date.parse(completed) < Date.parse(started) || Date.parse(completed) > Date.now() + 300000) {
        return { ok: false, error: 'completed_at must be a valid timestamp at or after started_at.' };
    }
    return { ok: true, value: {
        user_id: owner, client_trip_id: clientTripId, origin_id: origin.id, origin_name: originName,
        destination_id: destination.id, destination_name: destinationName, line_id: line,
        destination_line_id: destinationLine, ticket_type: body.ticket_type, fare, distance_km: distance,
        direction, duration_minutes: duration, started_at: started, completed_at: completed,
    } };
}

export function validateTripPatch(value: unknown, line?: string): ValidationResult<Record<string, unknown>> {
    if (!isRecord(value) || !Object.keys(value).length || Object.keys(value).some(key => !['fare', 'distance_km', 'direction'].includes(key))) {
        return { ok: false, error: 'No supported repair fields or unknown repair fields.' };
    }
    const patch: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
        const next = key === 'direction' ? item : boundedNumber(item, key === 'fare' ? 10000 : 500);
        if (key === 'direction' ? !validDirection(next, line) : next === null) return { ok: false, error: `Invalid repair field: ${key}.` };
        patch[key] = next;
    }
    return { ok: true, value: patch };
}
