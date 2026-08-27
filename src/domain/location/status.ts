import type { LocationOverrideState, RawLocationState } from './types';
import type { LocationSample, LocationStatus, LocationStatusCode } from '@/types';

export const LOCATION_READY_ACCURACY_METERS = 150;
export const LOCATION_STALE_MS = 30_000;

export function shouldShowGpsReconnectionBanner(gpsFallbackActive: boolean, isDevMode: boolean): boolean {
    return gpsFallbackActive && !isDevMode;
}

export const SECURE_CONTEXT_MESSAGE =
    'GPS is blocked because this page is opened over plain HTTP on a LAN address such as 192.168.x.x. Use the deployed HTTPS app, an HTTPS tunnel, or trusted local HTTPS. localhost only works on the same device.';

function makeStatus(
    raw: RawLocationState,
    code: LocationStatusCode,
    title: string,
    message: string,
    options?: Partial<Pick<LocationStatus, 'isBlocking' | 'isUsable' | 'canRequest'>>,
): LocationStatus {
    const now = Date.now();
    const ageMs = raw.timestamp ? now - raw.timestamp : null;
    const accuracyMeters = raw.accuracyMeters !== null && Number.isFinite(raw.accuracyMeters)
        ? raw.accuracyMeters
        : null;

    return {
        code,
        title,
        message,
        permissionState: raw.permissionState,
        isSecureContext: raw.isSecureContext,
        isBlocking: options?.isBlocking ?? code !== 'ready',
        isUsable: options?.isUsable ?? code === 'ready',
        canRequest: options?.canRequest ?? (raw.isSecureContext && raw.permissionState !== 'unsupported'),
        accuracyMeters,
        ageMs,
    };
}

export function diagnoseLocationStatus(raw: RawLocationState, override?: LocationOverrideState | null): LocationStatus {
    if (override?.active && override.location) {
        const label = override.source === 'fallback' ? 'Dead-zone Fallback Active' : 'Simulation Active';
        const message = override.source === 'fallback'
            ? 'TrainTracks is conservatively projecting movement while GPS reconnects.'
            : 'DevOpts is supplying a simulated GPS fix.';

        return makeStatus(raw, 'ready', label, message, {
            isBlocking: false,
            isUsable: true,
            canRequest: false,
        });
    }

    if (!raw.isSecureContext) {
        return makeStatus(raw, 'insecure_context', 'Secure Location Required', SECURE_CONTEXT_MESSAGE, {
            canRequest: false,
        });
    }

    if (raw.permissionState === 'unsupported' || raw.errorCode === 'unsupported') {
        return makeStatus(raw, 'unavailable', 'Location Unsupported', 'This browser does not expose GPS location to TrainTracks.', {
            canRequest: false,
        });
    }

    if (raw.permissionState === 'denied' || raw.errorCode === 'permission_denied') {
        return makeStatus(raw, 'denied', 'Location Blocked', 'Location permission is blocked for this site. Allow location access in browser settings, then retry.');
    }

    if (raw.errorCode === 'timeout') {
        return makeStatus(raw, 'timeout', 'Still Looking For GPS', raw.errorMessage ?? 'The GPS request timed out before the phone produced a fix. Keep the page open and retry.');
    }

    if (raw.errorCode === 'position_unavailable') {
        return makeStatus(raw, 'unavailable', 'GPS Unavailable', raw.errorMessage ?? 'Your device could not provide a GPS fix yet. Move near a window or turn location accuracy on.');
    }

    if (raw.errorCode === 'stale') {
        return makeStatus(raw, 'stale', 'GPS Signal Stale', raw.errorMessage ?? 'The last GPS fix is too old to trust. Keep this screen open while TrainTracks reconnects.');
    }

    const ageMs = raw.timestamp ? Date.now() - raw.timestamp : null;
    if (raw.location && ageMs !== null && ageMs > LOCATION_STALE_MS) {
        return makeStatus(raw, 'stale', 'GPS Signal Stale', 'The last GPS fix is too old to trust. Keep this screen open while TrainTracks reconnects.');
    }

    if (raw.location && raw.accuracyMeters !== null && raw.accuracyMeters > LOCATION_READY_ACCURACY_METERS) {
        return makeStatus(raw, 'low_accuracy', 'GPS Accuracy Too Low', `Current accuracy is about ${Math.round(raw.accuracyMeters)}m. Move to a clearer spot before starting a trip.`);
    }

    if (raw.location) {
        return makeStatus(raw, 'ready', 'Location Ready', 'GPS signal is ready.', {
            isBlocking: false,
            isUsable: true,
        });
    }

    if (raw.permissionState === 'prompt') {
        return makeStatus(raw, 'needs_permission', 'Allow Location Access', 'Tap the button below and allow location access so TrainTracks can detect your station.');
    }

    return makeStatus(
        raw,
        'checking',
        'Locating...',
        raw.isRequestingLocation ? 'Acquiring GPS signal.' : 'Checking GPS permission and waiting for a fix.',
    );
}

export function buildLocationSample(raw: RawLocationState, override?: LocationOverrideState | null): LocationSample {
    if (override?.active && override.location) {
        return {
            location: override.location,
            rawHeading: override.rawHeading,
            speedKph: override.speedKph,
            accuracyMeters: override.accuracyMeters ?? 5,
            timestamp: override.timestamp ?? Date.now(),
            source: override.source,
        };
    }

    return {
        location: raw.location,
        rawHeading: raw.rawHeading,
        speedKph: raw.speedKph,
        accuracyMeters: raw.accuracyMeters,
        timestamp: raw.timestamp,
        source: 'gps',
    };
}
