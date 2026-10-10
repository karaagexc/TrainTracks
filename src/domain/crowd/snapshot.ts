import 'server-only';
import { createAdminClient, hasAdminSupabaseConfig } from '@/lib/supabase/admin';
import type { TrainPresence } from '@/types/train';
import { createCrowdSampleIdentity } from './identity';

export function crowdRowToPresence(row: Record<string, unknown>, secret: string): TrainPresence | null {
    const updatedAt = typeof row.updated_at === 'string' ? Date.parse(row.updated_at) : NaN;
    const validUntil = typeof row.expires_at === 'string' ? Date.parse(row.expires_at) : NaN;
    if (!secret || typeof row.sample_id !== 'string' || !row.sample_id
        || typeof row.pseudonym !== 'string' || !Number.isFinite(updatedAt) || !Number.isFinite(validUntil)
        || !['LRT1', 'LRT2', 'MRT3'].includes(String(row.line_id))
        || !['AT_STATION', 'LEAVING_STATION', 'IN_TRANSIT', 'APPROACHING_STATION'].includes(String(row.status_code))
        || ![row.lat, row.lng, row.speed_kph, row.confidence].every((value) => typeof value === 'number' && Number.isFinite(value))) return null;
    const direction = String(row.direction);
    if (!(row.line_id === 'LRT2' ? ['EASTBOUND', 'WESTBOUND'] : ['NORTHBOUND', 'SOUTHBOUND']).includes(direction)) return null;
    return {
        id: `CROWD-${row.pseudonym}`,
        deviceId: row.pseudonym,
        sampleId: /^cs-[0-9a-f]{32}$/.test(row.sample_id) ? row.sample_id
            : createCrowdSampleIdentity(row.sample_id, row.pseudonym, secret),
        lineId: row.line_id as TrainPresence['lineId'],
        direction: direction as TrainPresence['direction'],
        statusCode: row.status_code as TrainPresence['statusCode'],
        stationId: typeof row.station_id === 'string' ? row.station_id : null,
        stationName: typeof row.station_name === 'string' ? row.station_name : null,
        lat: row.lat as number, lng: row.lng as number,
        speedKph: row.speed_kph as number, confidence: row.confidence as number,
        source: 'crowd', sourceCount: 1, updatedAt, validUntil,
    };
}

export async function listCrowdPresenceSnapshot(now = Date.now()) {
    const secret = process.env.TRAINTRACKS_CROWD_ID_SECRET
        ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
    if (!secret || !hasAdminSupabaseConfig()) return { ok: false, status: 503, trains: [] as TrainPresence[] };
    const { data, error } = await createAdminClient().from('crowd_presence')
        .select('pseudonym,sample_id,line_id,direction,status_code,station_id,station_name,lat,lng,speed_kph,confidence,updated_at,expires_at')
        .gt('expires_at', new Date(now).toISOString()).lte('updated_at', new Date(now).toISOString())
        .order('updated_at', { ascending: false }).limit(200);
    if (error) return { ok: false, status: 503, trains: [] as TrainPresence[] };
    const trains = (data ?? []).map((row) => crowdRowToPresence(row, secret)).filter((train): train is TrainPresence => !!train);
    return { ok: true, status: 200, trains };
}
