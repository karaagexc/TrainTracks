import 'server-only';

import { broadcastCrowdPresence } from '@/domain/crowd/broadcast';
import { createCrowdPseudonym, createCrowdSampleIdentity } from '@/domain/crowd/identity';
import {
    readCrowdPresenceDeviceId,
    sanitizeCrowdPresencePayload,
} from '@/domain/crowd/presence';
import { createAdminClient, hasAdminSupabaseConfig } from '@/lib/supabase/admin';
import type { TrainPresence } from '@/types/train';
import { isReceivedCrowdPresence } from '@/domain/crowd/receiver';
import { getServerApiConfiguration } from '@/domain/predictions/serverConfig';
import { API_CONFIG_DEFAULTS } from '@/domain/config';

export interface CrowdPresenceServiceResult {
    ok: boolean;
    status: number;
    code: string;
    message: string;
    train: TrainPresence | null;
    duplicate?: boolean;
}

interface CrowdPresenceRecordResult {
    ok?: boolean;
    code?: string;
    duplicate?: boolean;
    broadcast_state_supported?: boolean;
    broadcasted?: boolean;
    train?: TrainPresence;
}

interface CrowdBroadcastClaimResult {
    ok?: boolean;
    status?: 'acquired' | 'already_broadcasted' | 'claimed_elsewhere' | 'sample_not_found';
    claim_token?: string;
    train?: TrainPresence;
}

export async function processCrowdPresence(
    payload: unknown,
    now = Date.now(),
): Promise<CrowdPresenceServiceResult> {
    const deviceId = readCrowdPresenceDeviceId(payload);
    const secret = process.env.TRAINTRACKS_CROWD_ID_SECRET
        ?? process.env.SUPABASE_SERVICE_ROLE_KEY
        ?? process.env.SUPABASE_SECRET_KEY;

    if (!deviceId) {
        return {
            ok: false,
            status: 400,
            code: 'invalid_device',
            message: 'Crowd presence requires an anonymous device id.',
            train: null,
        };
    }
    if (!secret || !hasAdminSupabaseConfig()) {
        return {
            ok: false,
            status: 503,
            code: 'crowd_storage_not_configured',
            message: 'Trusted crowd storage is not configured.',
            train: null,
        };
    }

    const observedAt = payload && typeof payload === 'object' && 'updatedAt' in payload
        && typeof payload.updatedAt === 'number' && Number.isFinite(payload.updatedAt) ? payload.updatedAt : now;
    const pseudonym = createCrowdPseudonym(deviceId, secret, observedAt);
    const validation = sanitizeCrowdPresencePayload(payload, now, { pseudonym });
    if (!validation.ok || !validation.train || !validation.sampleId) {
        return {
            ok: false,
            status: validation.status,
            code: validation.code,
            message: validation.message,
            train: null,
        };
    }

    const sampleId = createCrowdSampleIdentity(validation.sampleId, pseudonym, secret);
    let train: TrainPresence = { ...validation.train, sampleId };
    const admin = createAdminClient();
    const configuration = await getServerApiConfiguration();
    const config = configuration.config?.api_config ?? API_CONFIG_DEFAULTS;
    const { data, error } = await admin.rpc('record_crowd_presence', {
        p_pseudonym: pseudonym,
        p_line_id: train.lineId,
        p_direction: train.direction,
        p_status_code: train.statusCode,
        p_station_id: train.stationId,
        p_station_name: train.stationName,
        p_lat: train.lat,
        p_lng: train.lng,
        p_speed_kph: train.speedKph,
        p_confidence: train.confidence,
        p_accuracy_meters: validation.accuracyMeters,
        p_sample_id: sampleId,
        p_reported_at: new Date(train.updatedAt).toISOString(),
        p_interval_ms: config.crowd.intervalMs,
    });

    if (error) {
        console.error('[CrowdPresence] Durable write failed:', error.message);
        return {
            ok: false,
            status: 503,
            code: 'crowd_storage_unavailable',
            message: 'Crowd presence could not be stored.',
            train: null,
        };
    }

    const record = data as CrowdPresenceRecordResult | null;
    if (record?.ok !== true) {
        return {
            ok: false,
            status: record?.code === 'rate_limited' ? 429 : 422,
            code: record?.code ?? 'crowd_presence_rejected',
            message: 'Crowd presence was rejected by server plausibility checks.',
            train: null,
        };
    }

    const duplicate = record?.duplicate === true;
    if (record.train) train = record.train;
    const supportsBroadcastState = record?.broadcast_state_supported === true;
    let claimToken: string | null = null;
    if (!supportsBroadcastState) {
        return { ok: false, status: 503, code: 'crowd_migration_required',
            message: 'Atomic crowd delivery storage is not available.', train: null };
    }
    if (supportsBroadcastState && record?.broadcasted === true) {
        return {
            ok: true,
            status: 200,
            code: 'duplicate',
            message: 'Crowd presence was already broadcast.',
            train,
            duplicate: true,
        };
    }

    if (supportsBroadcastState) {
        const { data: claimData, error: claimError } = await admin.rpc(
            'claim_crowd_presence_broadcast',
            {
                p_pseudonym: pseudonym,
                p_sample_id: sampleId,
                p_claimed_at: new Date(now).toISOString(),
            },
        );
        if (claimError) {
            console.error('[CrowdPresence] Broadcast claim failed:', claimError.message);
            return {
                ok: false,
                status: 503,
                code: 'broadcast_claim_failed',
                message: 'Crowd presence is stored and queued for broadcast retry.',
                train,
                duplicate,
            };
        }

        const claim = claimData as CrowdBroadcastClaimResult | null;
        if (claim?.train && isReceivedCrowdPresence(claim.train, now)) train = claim.train;
        if (claim?.status === 'already_broadcasted') {
            return {
                ok: true,
                status: 200,
                code: 'duplicate',
                message: 'Crowd presence was already broadcast.',
                train,
                duplicate: true,
            };
        }
        if (claim?.status === 'claimed_elsewhere') {
            return {
                ok: true,
                status: 202,
                code: 'broadcast_in_progress',
                message: 'Crowd presence broadcast is already in progress.',
                train,
                duplicate: true,
            };
        }
        if (claim?.status !== 'acquired' || !claim.claim_token || !isReceivedCrowdPresence(claim.train, now)
            || claim.train.sampleId !== sampleId) {
            return {
                ok: false,
                status: 503,
                code: 'broadcast_claim_failed',
                message: 'Crowd presence is stored and queued for broadcast retry.',
                train,
                duplicate,
            };
        }
        claimToken = claim.claim_token;
    }

    let broadcast;
    try {
        broadcast = await broadcastCrowdPresence(train);
    } catch (error) {
        console.error('[CrowdPresence] Broadcast request failed:', error);
        broadcast = {
            ok: false,
            status: 503,
            code: 'broadcast_failed' as const,
            message: 'Supabase Realtime broadcast failed.',
        };
    }

    if (!broadcast.ok) {
        if (supportsBroadcastState) {
            const { error: releaseError } = await admin.rpc('release_crowd_presence_broadcast', {
                p_pseudonym: pseudonym,
                p_sample_id: sampleId,
                p_claim_token: claimToken,
            });
            if (releaseError) {
                console.error('[CrowdPresence] Broadcast claim release failed:', releaseError.message);
            }
        }
        return {
            ok: false,
            status: broadcast.status,
            code: broadcast.code,
            message: broadcast.message,
            train,
            duplicate,
        };
    }

    if (supportsBroadcastState) {
        const { data: markData, error: markError } = await admin.rpc('mark_crowd_presence_broadcasted', {
            p_pseudonym: pseudonym,
            p_sample_id: sampleId,
            p_broadcasted_at: new Date().toISOString(),
            p_claim_token: claimToken,
        });
        if (markError || !(markData as { ok?: boolean } | null)?.ok) {
            console.error('[CrowdPresence] Broadcast completion mark failed:', markError?.message ?? 'Claim no longer owned.');
            return { ok: false, status: 503, code: 'broadcast_completion_failed',
                message: 'Broadcast sent, but durable completion requires retry.', train, duplicate };
        }
    }

    return {
        ok: true,
        status: 200,
        code: duplicate ? 'duplicate_recovered' : 'ok',
        message: duplicate ? 'Stored crowd presence broadcast recovered.' : 'Crowd presence accepted.',
        train,
        duplicate,
    };
}
