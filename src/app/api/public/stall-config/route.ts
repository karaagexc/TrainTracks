import { NextRequest, NextResponse } from 'next/server';
import { verifyPredictionApiAccess } from '@/domain/predictions/apiAccess';
import { getPublicApiHeaders, getConfiguredPublicApiHeaders, noStoreHeaders } from '@/domain/predictions/http';
import { getServerApiConfiguration } from '@/domain/predictions/serverConfig';
import { API_CONFIG_DEFAULTS } from '@/domain/config';

export const dynamic = 'force-dynamic';

const AUTO_DISMISS_MS = 15_000;

export async function OPTIONS(request: NextRequest) {
    return new Response(null, {
        status: 204,
        headers: await getConfiguredPublicApiHeaders(request),
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

    const configured = await getServerApiConfiguration();
    const config = configured.config?.api_config.stall ?? API_CONFIG_DEFAULTS.stall;
    const detectionTimeMinutes = (
        ((config.windowSamples - 1) * config.sampleIntervalMs) / 60_000
    );

    return NextResponse.json({
        ok: true,
        config: {
            ...config,
            autoDismissMs: AUTO_DISMISS_MS,
        },
        derived: {
            detectionTimeMinutes,
            movementThresholdMeters: config.thresholdKm * 1000,
            activationDistanceMeters: config.activationDistKm * 1000,
            description: `Triggers after ${detectionTimeMinutes} minutes of < ${config.thresholdKm * 1000}m route movement, once ${config.activationDistKm * 1000}m from origin`,
        },
        skipConditions: {
            undergroundStations: true,
            description: 'Detection is paused at underground stations (no reliable GPS)',
        },
        userActions: {
            confirmTraffic: 'Resets detector, enters cooldown (won\'t re-trigger immediately)',
            confirmEmergency: 'Transitions to CONFIRMED_DELAY state with service disruption card',
            autoDismiss: `Auto-dismisses as slow traffic after ${AUTO_DISMISS_MS / 1000}s if user doesn't respond`,
        },
        meta: {
            engine: 'v1',
            note: 'Detection runs client-side using GPS. This endpoint provides configuration only.',
        },
    }, {
        headers: noStoreHeaders(getPublicApiHeaders(request)),
    });
}
