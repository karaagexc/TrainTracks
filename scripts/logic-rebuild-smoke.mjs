import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Module from 'node:module';
import ts from 'typescript';

const cwd = process.cwd();
const originalResolve = Module._resolveFilename;

Module._resolveFilename = function resolveAlias(request, parent, isMain, options) {
    if (request === 'server-only') {
        return path.join(cwd, 'node_modules', 'next', 'dist', 'compiled', 'server-only', 'empty.js');
    }
    if (request.startsWith('@/')) {
        return originalResolve.call(this, path.join(cwd, 'src', request.slice(2)), parent, isMain, options);
    }
    return originalResolve.call(this, request, parent, isMain, options);
};

function transpileTypeScript(module, filename) {
    const source = fs.readFileSync(filename, 'utf8');
    const output = ts.transpileModule(source, {
        compilerOptions: {
            esModuleInterop: true,
            jsx: ts.JsxEmit.React,
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2019,
        },
    }).outputText;

    module._compile(output, filename);
}

Module._extensions['.ts'] = transpileTypeScript;
Module._extensions['.tsx'] = transpileTypeScript;

const require = Module.createRequire(import.meta.url);
const { LINES, STATIONS } = require('../src/data/stations.ts');
const { getNetworkStations } = require('../src/domain/railway.ts');
const { getStationProximity } = require('../src/domain/location/stationProximity.ts');
const { buildLocationSample, diagnoseLocationStatus, LOCATION_STALE_MS, shouldShowGpsReconnectionBanner } = require('../src/domain/location/status.ts');
const { measureGpsSpeed, smoothGpsSpeed } = require('../src/domain/location/speed.ts');
const { filterGpsPosition } = require('../src/domain/location/gpsFilter.ts');
const { getAdaptiveCrowdReportMs, getAdaptivePredictionPollMs, shouldUsePredictionStream } = require('../src/domain/network/runtime.ts');
const { evaluateWrongDirectionEvidence } = require('../src/domain/alerts/wrongDirection.ts');
const { decideFallbackStart, stepFallbackLocation } = require('../src/domain/journey/fallback.ts');
const { buildSimulationRoute, getSimulationLegProfile, stepSimulationLeg } = require('../src/domain/simulation/engine.ts');
const { moveTowards } = require('../src/utils/geo.ts');
const { getFareQuote } = require('../src/utils/fareNew.ts');
const {
    deleteOutboxValue,
    deleteRuntimeValue,
    putOutboxValue,
    readAllOutboxValues,
    readRuntimeValue,
    writeRuntimeValue,
} = require('../src/domain/offline/indexedDb.ts');const {
    computeTripHistoryFare,
    formatTripHistoryDirection,
    getTripHistoryRepairPatch,
    normalizeTripHistoryDirection,
} = require('../src/domain/tripHistory.ts');
const { getCongestionLevel, getTimeMultiplier, shouldDisplayCongestionOverlay } = require('../src/data/congestion.ts');
const { getManilaDateParts, getManilaDaypart, parseManilaTimestamp } = require('../src/domain/time/manila.ts');
const { getLineColor, getStationBadge } = require('../src/utils/stationUtils.ts');
const {
    buildAuthCallbackUrl,
    buildAuthFailurePath,
    hasAuthCodeVerifierCookie,
    readAuthReturnToCookie,
    resolveAuthCodeExchangeOrigin,
    resolveAuthOrigin,
    sanitizeAuthReturnTo,
} = require('../src/domain/auth/redirect.ts');
const { checkAdminAccess, shouldExitAdminSurfaceOnReload } = require('../src/lib/auth/adminClient.ts');
const { buildCartoBasemapUrl } = require('../src/domain/map/cartoBasemap.ts');

const now = 1_800_000_000_000;
assert.equal(
    buildCartoBasemapUrl('dark', false),
    '/api/map-tiles/dark/{z}/{x}/{y}{r}.png',
    'dark mode keeps retina tiles behind the same-origin CARTO proxy',
);
assert.equal(
    buildCartoBasemapUrl('voyager', true),
    '/api/map-tiles/voyager/{z}/{x}/{y}.png',
    'low-data mode keeps CARTO Voyager and omits retina tiles behind the proxy',
);
const cartoProxySource = fs.readFileSync(path.join(cwd, 'src/app/api/map-tiles/[...path]/route.ts'), 'utf8');
assert.match(cartoProxySource, /process\.env\.CARTO_BASEMAP_KEY/);
assert.equal(cartoProxySource.includes('NEXT_PUBLIC_CARTO'), false, 'the CARTO key must never enter client code');
const mainAppSource = fs.readFileSync(path.join(cwd, 'src/components/MainApp.tsx'), 'utf8');
assert.match(mainAppSource, /isDarkMode \? 'Dark Mode' : 'Light Mode'/, 'theme control labels the active mode');
const globalCssSource = fs.readFileSync(path.join(cwd, 'src/app/globals.css'), 'utf8');
assert.match(globalCssSource, /\.leaflet-control-attribution\s*\{[\s\S]*?background: transparent !important;/, 'map attribution blends into the basemap');
assert.equal(LINES.MRT7.color, '#800000', 'MRT-7 uses the Maroon Line color');
assert.equal(getStationBadge('MRT7', 1), 'ML01', 'MRT-7 uses the Maroon Line station prefix');
assert.equal(getLineColor('MRT7'), 'bg-mrt7', 'MRT-7 uses the semantic maroon UI token');
assert.equal(
    resolveAuthOrigin('http://localhost:3000', null),
    'http://localhost:3000',
    'local OAuth callbacks stay on the local development server',
);
assert.equal(
    resolveAuthOrigin('https://traintracks-preview.vercel.app', 'https://traintracks.vercel.app'),
    'https://traintracks-preview.vercel.app',
    'Vercel preview OAuth callbacks stay on the deployment that initiated login',
);
assert.equal(
    buildAuthCallbackUrl('https://traintracks.vercel.app'),
    'https://traintracks.vercel.app/auth/callback',
    'OAuth uses one stable callback URL without destination query variants',
);
assert.equal(hasAuthCodeVerifierCookie(['sb-project-auth-token-code-verifier']), true);
assert.equal(hasAuthCodeVerifierCookie(['traintracks_auth_return_to']), false);
assert.equal(
    resolveAuthCodeExchangeOrigin(
        'https://traintracks-aaron-martinezs-projects-ea1c41f7.vercel.app',
        'https://traintracks.vercel.app',
        false,
    ),
    'https://traintracks.vercel.app',
    'a fallback callback without a verifier returns to the canonical OAuth origin',
);
assert.equal(
    resolveAuthCodeExchangeOrigin(
        'https://traintracks-preview.vercel.app',
        'https://traintracks.vercel.app',
        true,
    ),
    'https://traintracks-preview.vercel.app',
    'a callback with its verifier stays on the initiating deployment',
);
assert.equal(
    resolveAuthCodeExchangeOrigin(
        'http://localhost:3000',
        'https://traintracks.vercel.app',
        false,
    ),
    'http://localhost:3000',
    'local OAuth callbacks never jump to production',
);
assert.equal(sanitizeAuthReturnTo('/admin'), '/admin');
assert.equal(sanitizeAuthReturnTo('https://evil.example/admin'), '/');
assert.equal(sanitizeAuthReturnTo('//evil.example/admin'), '/');
assert.equal(readAuthReturnToCookie('%2Fapi-console'), '/api-console');
assert.equal(
    buildAuthFailurePath('/admin'),
    '/login?error=auth_callback_failed&reason=exchange_failed&next=%2Fadmin',
);
assert.equal(
    buildAuthFailurePath('https://evil.example/admin', 'pkce_verifier_missing'),
    '/login?error=auth_callback_failed&reason=pkce_verifier_missing',
);
assert.equal(shouldExitAdminSurfaceOnReload('reload', 'https://traintracks.vercel.app/admin'), true);
assert.equal(shouldExitAdminSurfaceOnReload('reload', 'https://traintracks.vercel.app/api-console'), true);
assert.equal(shouldExitAdminSurfaceOnReload('reload', 'https://traintracks.vercel.app/'), false);
assert.equal(shouldExitAdminSurfaceOnReload('navigate', 'https://traintracks.vercel.app/admin'), false);
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => new Response(
    JSON.stringify({ ok: false, authenticated: false, isAdmin: false }),
    { status: 401, headers: { 'Content-Type': 'application/json' } },
);
assert.equal((await checkAdminAccess()).status, 'not_logged_in');
globalThis.fetch = async () => new Response(
    JSON.stringify({ ok: false, authenticated: true, isAdmin: false, email: 'commuter@example.com' }),
    { status: 403, headers: { 'Content-Type': 'application/json' } },
);
assert.equal((await checkAdminAccess()).status, 'denied');
globalThis.fetch = async () => new Response(
    JSON.stringify({ ok: true, authenticated: true, isAdmin: true, email: 'admin@example.com' }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
);
assert.equal((await checkAdminAccess()).status, 'granted');
globalThis.fetch = originalFetch;

function station(id) {
    const found = STATIONS.find((candidate) => candidate.id === id);
    assert.ok(found, `Missing station ${id}`);
    return found;
}

const liveStations = getNetworkStations('live', 'WITH_NA');
assert.equal(liveStations.some((candidate) => candidate.lineId === 'MRT7'), false, 'live network excludes MRT-7');
assert.equal(liveStations.some((candidate) => candidate.name === 'Common Station'), false, 'live network excludes Common Station');

const sandboxStations = getNetworkStations('sandbox', 'WITH_NA');
assert.equal(sandboxStations.some((candidate) => candidate.id === 'M7-01'), true, 'sandbox can include Common Station');

const liveProximity = getStationProximity({
    location: station('M7-01'),
    mode: 'live',
    line7Mode: 'WITH_NA',
    radiusKm: 0.5,
});
assert.notEqual(liveProximity.closest?.station.id, 'M7-01', 'live proximity must not snap to Common Station');

const sandboxProximity = getStationProximity({
    location: station('M7-01'),
    mode: 'sandbox',
    line7Mode: 'WITH_NA',
    radiusKm: 0.5,
});
assert.equal(sandboxProximity.nearest?.station.id, 'M7-01', 'sandbox proximity can snap to Common Station');

function rawLocation(overrides = {}) {
    return {
        location: null,
        rawHeading: null,
        speedKph: null,
        accuracyMeters: null,
        timestamp: null,
        permissionState: 'unknown',
        isSecureContext: true,
        isRequestingLocation: false,
        errorMessage: null,
        errorCode: null,
        ...overrides,
    };
}

assert.equal(diagnoseLocationStatus(rawLocation({ isSecureContext: false })).code, 'insecure_context');
assert.equal(diagnoseLocationStatus(rawLocation({ permissionState: 'denied', errorCode: 'permission_denied', errorMessage: 'denied' })).code, 'denied');
assert.equal(diagnoseLocationStatus(rawLocation({ permissionState: 'granted', errorCode: 'timeout', errorMessage: 'timeout' })).code, 'timeout');
assert.equal(diagnoseLocationStatus(rawLocation({ permissionState: 'granted', location: { latitude: 14.5, longitude: 121 }, accuracyMeters: 180, speedKph: 0, timestamp: Date.now() })).code, 'low_accuracy');
assert.equal(diagnoseLocationStatus(rawLocation({ permissionState: 'granted', location: { latitude: 14.5, longitude: 121 }, accuracyMeters: 12, speedKph: 0, timestamp: Date.now() - LOCATION_STALE_MS - 1 })).code, 'stale');
assert.equal(diagnoseLocationStatus(rawLocation({ permissionState: 'granted', location: { latitude: 14.5, longitude: 121 }, accuracyMeters: 12, speedKph: 0, timestamp: Date.now() })).code, 'ready');
assert.equal(shouldShowGpsReconnectionBanner(true, false), true);
assert.equal(shouldShowGpsReconnectionBanner(true, true), false);
assert.equal(shouldShowGpsReconnectionBanner(false, true), false);

const nativeStopMeasurement = measureGpsSpeed({
    nativeSpeedMetersPerSecond: 0,
    displacementMeters: 2,
    deltaSeconds: 3,
    accuracyMeters: 18,
    previousAccuracyMeters: 16,
    nearStation: true,
});
const nativeStopSpeed = smoothGpsSpeed({
    previousSpeedKph: 58,
    measurement: nativeStopMeasurement,
    nearStation: true,
    lowMotionSampleCount: 1,
});
assert.equal(nativeStopSpeed, 0, 'native zero speed must reach the speedometer immediately');

const stationCreepMeasurement = measureGpsSpeed({
    nativeSpeedMetersPerSecond: 0.8,
    displacementMeters: 20,
    deltaSeconds: 3,
    accuracyMeters: 18,
    previousAccuracyMeters: 18,
    nearStation: true,
});
const firstStationDeceleration = smoothGpsSpeed({
    previousSpeedKph: 55,
    measurement: stationCreepMeasurement,
    nearStation: true,
    lowMotionSampleCount: 0,
});
const secondStationDeceleration = smoothGpsSpeed({
    previousSpeedKph: firstStationDeceleration,
    measurement: stationCreepMeasurement,
    nearStation: true,
    lowMotionSampleCount: 0,
});
assert.ok(firstStationDeceleration < 15, 'station deceleration should react strongly on the first slow sample');
assert.ok(secondStationDeceleration < 5, 'two slow station samples should cross the journey dwell threshold');

const staleNativeMeasurement = measureGpsSpeed({
    nativeSpeedMetersPerSecond: 12,
    displacementMeters: 2,
    deltaSeconds: 3,
    accuracyMeters: 20,
    previousAccuracyMeters: 20,
    nearStation: true,
});
assert.equal(staleNativeMeasurement.isLowMotion, true, 'stationary coordinates should challenge a stale native speed');
const staleNativeStop = smoothGpsSpeed({
    previousSpeedKph: 45,
    measurement: staleNativeMeasurement,
    nearStation: true,
    lowMotionSampleCount: 2,
});
assert.equal(staleNativeStop, 0, 'two accurate low-motion samples should clear stale Android speed');

const movingNearStationMeasurement = measureGpsSpeed({
    nativeSpeedMetersPerSecond: 10,
    displacementMeters: 35,
    deltaSeconds: 3,
    accuracyMeters: 20,
    previousAccuracyMeters: 20,
    nearStation: true,
});
assert.equal(movingNearStationMeasurement.isLowMotion, false, 'real movement near a station must not be mistaken for a stop');
assert.ok(smoothGpsSpeed({
    previousSpeedKph: 40,
    measurement: movingNearStationMeasurement,
    nearStation: true,
    lowMotionSampleCount: 0,
}) > 5, 'moving trains must remain above the dwell threshold');
const previousFix = {
    location: { latitude: 14.6, longitude: 121 },
    timestamp: now,
    accuracyMeters: 10,
};
assert.equal(filterGpsPosition(previousFix, {
    location: { latitude: 14.61, longitude: 121.01 },
    timestamp: now,
    accuracyMeters: 10,
}).rejection, 'stale', 'duplicate or older GPS timestamps must be rejected');

const jumpDecision = filterGpsPosition(previousFix, {
    location: { latitude: 14.7, longitude: 121.1 },
    timestamp: now + 1000,
    accuracyMeters: 30,
});
assert.equal(jumpDecision.rejection, 'outlier', 'an implausible one-second GPS jump must be rejected');

const jitterDecision = filterGpsPosition(previousFix, {
    location: { latitude: 14.60002, longitude: 121.00001 },
    timestamp: now + 1000,
    accuracyMeters: 20,
});
assert.equal(jitterDecision.accepted, true);
assert.deepEqual(jitterDecision.fix.location, previousFix.location, 'worse stationary jitter keeps the better coordinates');
assert.equal(jitterDecision.fix.accuracyMeters, previousFix.accuracyMeters, 'held coordinates keep their matching accuracy');

const movementDecision = filterGpsPosition(previousFix, {
    location: { latitude: 14.6002, longitude: 121 },
    timestamp: now + 1000,
    accuracyMeters: 8,
});
assert.equal(movementDecision.accepted, true);
assert.equal(typeof movementDecision.inferredHeading, 'number', 'meaningful movement infers a heading when native heading is absent');

const oneSecondEstimate = measureGpsSpeed({
    nativeSpeedMetersPerSecond: null,
    displacementMeters: 10,
    deltaSeconds: 1,
    accuracyMeters: 5,
    previousAccuracyMeters: 5,
    nearStation: false,
});
assert.equal(oneSecondEstimate.source, 'displacement', 'one-second Android fixes can estimate speed');
assert.equal(oneSecondEstimate.speedKph, 36);

const unavailableNearStation = smoothGpsSpeed({
    previousSpeedKph: 40,
    measurement: { speedKph: null, source: 'unavailable', isLowMotion: false },
    nearStation: true,
    lowMotionSampleCount: 0,
});
assert.equal(unavailableNearStation, 18, 'missing station speed samples decay instead of freezing');

const fastNetwork = { saveData: false, effectiveType: '4g' };
const dataSaverNetwork = { saveData: true, effectiveType: '4g' };
const slowNetwork = { saveData: false, effectiveType: '2g' };
assert.equal(shouldUsePredictionStream(fastNetwork), false, 'commuter client uses bounded polling even on fast networks');
assert.equal(shouldUsePredictionStream(dataSaverNetwork), false, 'data saver uses bounded prediction polling');
assert.equal(shouldUsePredictionStream(slowNetwork), false, '2G avoids a continuous prediction stream');
assert.equal(getAdaptivePredictionPollMs(dataSaverNetwork), 30_000);
assert.equal(getAdaptiveCrowdReportMs(slowNetwork), 15_000, '2G crowd reports use the mobile-data-friendly interval');

const fallbackSample = buildLocationSample({
    location: null,
    rawHeading: null,
    speedKph: null,
    accuracyMeters: null,
    timestamp: null,
    permissionState: 'granted',
    isSecureContext: true,
    isRequestingLocation: true,
    errorMessage: null,
    errorCode: null,
}, {
    active: true,
    source: 'fallback',
    location: { latitude: 14.5, longitude: 121 },
    speedKph: 28,
    rawHeading: 180,
    timestamp: now,
    accuracyMeters: 80,
}, now);
assert.equal(fallbackSample?.source, 'fallback', 'fallback sample keeps fallback source');

const wrongDirection = evaluateWrongDirectionEvidence(
    { latitude: 14.53, longitude: 121.0 },
    0,
    { latitude: 14.55, longitude: 121.0 },
    { latitude: 14.50, longitude: 121.0 },
);
assert.equal(wrongDirection.isOpposite, true, 'opposite heading should produce wrong-direction evidence');

const correctDirection = evaluateWrongDirectionEvidence(
    { latitude: 14.53, longitude: 121.0 },
    180,
    { latitude: 14.55, longitude: 121.0 },
    { latitude: 14.50, longitude: 121.0 },
);
assert.equal(correctDirection.isOpposite, false, 'matching heading should not produce wrong-direction evidence');

const fallbackStart = decideFallbackStart({
    now: now,
    gpsTimestamp: now - 45_000,
    gpsAccuracy: 90,
    lastKnownSpeedKph: 33,
    lastGoodAccuracyMeters: 18,
    lastGpsLocation: station('L1-03'),
    currentStation: station('L1-03'),
    fallbackCandidateSince: now - 50_000,
});
assert.equal(fallbackStart.shouldStart, true, 'fallback should start with a known next station and weak GPS');
assert.equal(fallbackStart.reason, 'start', 'fallback should pass through strict dwell evidence');

const fallbackStep = stepFallbackLocation({
    currentLocation: station('L1-03'),
    currentSpeedKph: 33,
    targetStation: station('L1-04'),
    deltaSec: 1,
});
assert.equal(fallbackStep.arrivedAtTarget, false, 'one fallback tick should not instantly arrive');
assert.equal(fallbackStep.location.source, undefined, 'fallback step returns coordinates only, source is added by LocationEngine');

const stoppedFallbackStep = stepFallbackLocation({
    currentLocation: station('L1-03'),
    currentSpeedKph: 0,
    targetStation: station('L1-04'),
    deltaSec: 5,
});
assert.equal(stoppedFallbackStep.location.latitude, station('L1-03').latitude, 'fallback must not auto-depart a station from zero speed without recovered GPS');
assert.equal(stoppedFallbackStep.location.longitude, station('L1-03').longitude, 'fallback must not auto-depart a station from zero speed without recovered GPS');
assert.equal(stoppedFallbackStep.speedKph, 0, 'stopped fallback should stay stopped');

const originalIndexedDbDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');
const originalLocalStorageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
const fallbackStorage = new Map();
Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: undefined });
Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
        getItem: (key) => fallbackStorage.get(key) ?? null,
        setItem: (key, value) => fallbackStorage.set(key, String(value)),
        removeItem: (key) => fallbackStorage.delete(key),
    },
});

await writeRuntimeValue('smoke-preferences', { dataMode: 'saver' });
assert.deepEqual(
    await readRuntimeValue('smoke-preferences'),
    { dataMode: 'saver' },
    'runtime values fall back to localStorage when IndexedDB is unavailable',
);
await deleteRuntimeValue('smoke-preferences');
assert.equal(await readRuntimeValue('smoke-preferences'), null);

const localOutboxItem = { id: 'smoke-outbox', endpoint: '/api/smoke' };
await putOutboxValue(localOutboxItem);
assert.deepEqual(await readAllOutboxValues(), [localOutboxItem], 'outbox survives IndexedDB failure');
await deleteOutboxValue(localOutboxItem.id);
assert.deepEqual(await readAllOutboxValues(), []);

if (originalIndexedDbDescriptor) {
    Object.defineProperty(globalThis, 'indexedDB', originalIndexedDbDescriptor);
} else {
    delete globalThis.indexedDB;
}
if (originalLocalStorageDescriptor) {
    Object.defineProperty(globalThis, 'localStorage', originalLocalStorageDescriptor);
} else {
    delete globalThis.localStorage;
}
const transferRoute = buildSimulationRoute(station('L1-03'), station('M3-12'), 'live', 'OFF');
assert.ok(transferRoute.length >= 3, 'sim transfer route should include transfer stations');
const transferLegIndex = transferRoute.findIndex((candidate, index) => {
    const next = transferRoute[index + 1];
    return !!next && candidate.lineId !== next.lineId;
});
assert.notEqual(transferLegIndex, -1, 'sim route should expose a transfer leg');

const transferLeg = getSimulationLegProfile(transferRoute[transferLegIndex], transferRoute[transferLegIndex + 1]);
assert.equal(transferLeg.status, 'WALKING', 'transfer sim leg must report WALKING');
const transferStep = stepSimulationLeg({
    latitude: transferLeg.from.latitude,
    longitude: transferLeg.from.longitude,
}, transferLeg, 1000, 1);
assert.equal(transferStep.speedKph, 4.5, 'transfer sim walking speed is deterministic');
assert.ok(transferStep.progress > 0, 'transfer sim should advance progress');

const lrt1Leg = getSimulationLegProfile(station('L1-03'), station('L1-04'));
const lrt2Leg = getSimulationLegProfile(station('L2-05'), station('L2-06'));
const mrt3Leg = getSimulationLegProfile(station('M3-10'), station('M3-11'));
assert.equal(lrt1Leg.speedKph, 60, 'LRT-1 SIM cruise speed should be 60 km/h');
assert.equal(mrt3Leg.speedKph, 60, 'MRT-3 SIM cruise speed should be 60 km/h');
assert.equal(lrt2Leg.speedKph, 80, 'LRT-2 SIM cruise speed should be 80 km/h');

const acceleratingLrt1 = stepSimulationLeg({
    latitude: lrt1Leg.from.latitude,
    longitude: lrt1Leg.from.longitude,
}, lrt1Leg, 1000, 1, 0);
assert.ok(acceleratingLrt1.speedKph > 0 && acceleratingLrt1.speedKph < 60, 'rail SIM should accelerate into cruise speed instead of jumping instantly');

const cruisingLrt2 = stepSimulationLeg({
    latitude: lrt2Leg.from.latitude,
    longitude: lrt2Leg.from.longitude,
}, lrt2Leg, 1000, 1, 79);
assert.ok(cruisingLrt2.speedKph <= 80, 'LRT-2 SIM should cap at 80 km/h');

const nearLrt1Platform = moveTowards({
    latitude: lrt1Leg.to.latitude,
    longitude: lrt1Leg.to.longitude,
}, {
    latitude: lrt1Leg.from.latitude,
    longitude: lrt1Leg.from.longitude,
}, 0.02);
const stoppingLrt1 = stepSimulationLeg(nearLrt1Platform, lrt1Leg, 1000, 1, 3);
assert.equal(stoppingLrt1.arrived, true, 'near-stopped rail SIM should snap to dwell instead of blinking 0-3 km/h while MOVING');
assert.equal(stoppingLrt1.speedKph, 0, 'arrival snap should commit to stationary dwell speed');

assert.equal(normalizeTripHistoryDirection('NORTHBOUNDBOUND'), 'NORTHBOUND', 'history direction should not double-bound');
assert.equal(formatTripHistoryDirection('eastbound'), 'EASTBOUND', 'history direction display should normalize case');
const missingFareTrip = {
    origin_id: 'L2-08',
    destination_id: 'M3-03',
    ticket_type: 'CONCESSION',
    fare: 0,
    direction: 'NORTHBOUNDBOUND',
};
const repairedFare = computeTripHistoryFare(missingFareTrip);
assert.ok(repairedFare > 0, 'history fare fallback should recover zero fare entries');
assert.deepEqual(getTripHistoryRepairPatch(missingFareTrip), {
    fare: repairedFare,
    direction: 'NORTHBOUND',
});

const farePolicyNow = Date.parse('2026-08-09T12:00:00+08:00');
const lrt2SjtFare = getFareQuote(station('L2-01'), station('L2-02'), 'SJT', farePolicyNow);
assert.equal(lrt2SjtFare.total, 8, 'LRT-2 SJT applies the active 50% policy with whole-peso rounding');
assert.equal(lrt2SjtFare.baseTotal, 15);
assert.equal(lrt2SjtFare.policies[0]?.status, 'active_until_further_notice');
assert.equal(lrt2SjtFare.policies[0]?.lastVerifiedAt, '2026-08-10');

const lrt2SvcFare = getFareQuote(station('L2-01'), station('L2-02'), 'SVC', farePolicyNow);
assert.equal(lrt2SvcFare.total, 7.5, 'LRT-2 stored value applies half-peso rounding');
assert.equal(getFareQuote(station('L2-01'), station('L2-02'), 'CONCESSION', farePolicyNow).total, 7.5, 'white-card discounts do not stack with the all-passenger relief');

const mrt3Fare = getFareQuote(station('M3-01'), station('M3-02'), 'SJT', farePolicyNow);
assert.equal(mrt3Fare.total, 7, 'MRT-3 SJT applies the current all-passenger relief');

const lrt1Fare = getFareQuote(station('L1-25'), station('L1-24'), 'SJT', farePolicyNow);
assert.equal(lrt1Fare.total, 20, 'LRT-1 remains on its April 2025 matrix');
assert.equal(lrt1Fare.policies.length, 0, 'LRT-1 does not inherit the LRT-2/MRT-3 relief');

const beforeRelief = getFareQuote(
    station('L2-01'),
    station('L2-02'),
    'SJT',
    Date.parse('2026-03-22T12:00:00+08:00'),
);
assert.equal(beforeRelief.total, 15, 'fare policy is not backdated before March 23, 2026 PHT');

const holidayRush = getCongestionLevel('M3-11', new Date('2026-05-27T18:00:00+08:00'), 'SOUTHBOUND', 'MRT3');
assert.equal(holidayRush.timeWindow, 'HOLIDAY', '2026-05-27 should use holiday mode, not PM rush');
assert.ok(holidayRush.score < 3.5, 'holiday mode should suppress normal weekday rush pressure');
assert.equal(shouldDisplayCongestionOverlay(holidayRush), false, 'holiday moderate forecasts should not keep Rush Hour overlay active');

const weekdayAm = new Date('2026-05-26T08:00:00+08:00');
const lrt2Westbound = getCongestionLevel('L2-06', weekdayAm, 'WESTBOUND', 'LRT2');
const lrt2Eastbound = getCongestionLevel('L2-06', weekdayAm, 'EASTBOUND', 'LRT2');
assert.ok(lrt2Westbound.score > lrt2Eastbound.score, 'LRT-2 AM westbound flow should outrank eastbound counter-flow');
assert.equal(lrt2Westbound.daypart, 'am_peak', 'weekday morning should be classified as AM peak');

const weekdayPm = new Date('2026-05-26T18:00:00+08:00');
const lrt1Northbound = getCongestionLevel('L1-05', weekdayPm, 'NORTHBOUND', 'LRT1');
const lrt1Southbound = getCongestionLevel('L1-05', weekdayPm, 'SOUTHBOUND', 'LRT1');
assert.ok(lrt1Northbound.score > lrt1Southbound.score, 'LRT-1 PM northbound flow should outrank southbound counter-flow');

const mondaySchool = getCongestionLevel('L2-03', new Date('2026-06-01T08:00:00+08:00'), 'WESTBOUND', 'LRT2');
const tuesdaySchool = getCongestionLevel('L2-03', new Date('2026-06-02T08:00:00+08:00'), 'WESTBOUND', 'LRT2');
assert.ok(mondaySchool.score > tuesdaySchool.score, 'Monday morning school profile should be heavier than ordinary weekday school AM');

const fridayAyala = getCongestionLevel('M3-11', new Date('2026-05-29T18:00:00+08:00'), 'NORTHBOUND', 'MRT3');
const thursdayAyala = getCongestionLevel('M3-11', new Date('2026-05-28T18:00:00+08:00'), 'NORTHBOUND', 'MRT3');
assert.ok(fridayAyala.score > thursdayAyala.score, 'Friday CBD evening should be heavier than ordinary weekday PM');
assert.equal(shouldDisplayCongestionOverlay(fridayAyala), true, 'active Friday rush should display the overlay');

const fridayEnded = getCongestionLevel('M3-11', new Date('2026-05-29T22:01:00+08:00'), 'NORTHBOUND', 'MRT3');
assert.equal(fridayEnded.timeWindow, 'OFF-PEAK', 'Friday rush should end after 22:00');
assert.equal(shouldDisplayCongestionOverlay(fridayEnded), false, 'off-peak moderate forecasts should not keep Rush Hour overlay active');

const saturdayMall = getCongestionLevel('M3-06', new Date('2026-05-30T15:00:00+08:00'), 'NORTHBOUND', 'MRT3');
const saturdayQuiet = getCongestionLevel('L1-16', new Date('2026-05-30T15:00:00+08:00'), 'NORTHBOUND', 'LRT1');
assert.ok(saturdayMall.score > saturdayQuiet.score, 'Saturday mall profile should outrank quiet residential station');

const sundayChurch = getCongestionLevel('L1-10', new Date('2026-05-31T11:00:00+08:00'), 'SOUTHBOUND', 'LRT1');
const sundayQuiet = getCongestionLevel('L2-07', new Date('2026-05-31T11:00:00+08:00'), 'WESTBOUND', 'LRT2');
assert.ok(sundayChurch.score > sundayQuiet.score, 'Sunday church/market profile should outrank quiet station');

const holidayPITX = getCongestionLevel('L1-23', new Date('2026-05-27T15:00:00+08:00'), 'SOUTHBOUND', 'LRT1');
const holidayAyala = getCongestionLevel('M3-11', new Date('2026-05-27T15:00:00+08:00'), 'NORTHBOUND', 'MRT3');
assert.ok(holidayPITX.score > holidayAyala.score, 'holiday bus terminal travel should remain higher than CBD commute demand');

const closedStation = getCongestionLevel('M3-11', new Date('2026-05-26T23:30:00+08:00'), 'NORTHBOUND', 'MRT3');
assert.equal(closedStation.timeWindow, 'CLOSED', 'late night should use closed window');
assert.equal(closedStation.score, 0, 'closed window should not report crowd pressure');
assert.equal(shouldDisplayCongestionOverlay(closedStation), false, 'closed window should never display Rush Hour overlay');

const boostedConfig = {
    stationWindows: [{
        id: 'gilmore-event',
        stationIds: ['L2-06'],
        startAt: '2026-05-26T07:00:00+08:00',
        endAt: '2026-05-26T09:00:00+08:00',
        boost: 1.8,
        label: 'Campus event advisory',
        source: 'supabase',
    }],
};
const boostedGilmore = getCongestionLevel('L2-06', weekdayAm, 'WESTBOUND', 'LRT2', boostedConfig);
assert.ok(boostedGilmore.score > lrt2Westbound.score, 'Supabase station boost should apply inside its active window');
assert.equal(boostedGilmore.activeEvent, 'Campus event advisory');

const staleSignal = {
    id: 'crowd-stale',
    lineId: 'LRT2',
    direction: 'WESTBOUND',
    lat: station('L2-06').latitude,
    lng: station('L2-06').longitude,
    speedKph: 0,
    statusCode: 'AT_STATION',
    stationId: 'L2-06',
    stationName: 'Gilmore',
    source: 'crowd',
    updatedAt: weekdayAm.getTime() - 10 * 60_000,
    confidence: 0.4,
    sourceCount: 1,
    freshness: 'stale',
};
const staleGilmore = getCongestionLevel('L2-06', weekdayAm, 'WESTBOUND', 'LRT2', null, [staleSignal]);
assert.equal(staleGilmore.score, lrt2Westbound.score, 'stale crowd signals should not inflate score');
assert.equal(staleGilmore.confidence, 'low', 'stale-only crowd data should lower confidence');

const simulatedTrain = {
    ...staleSignal,
    id: 'sim-train',
    source: 'simulated',
    updatedAt: weekdayAm.getTime(),
    sourceCount: 10,
    freshness: 'fresh',
};
const liveWithSim = getCongestionLevel('L2-06', weekdayAm, 'WESTBOUND', 'LRT2', null, [simulatedTrain], 'live');
assert.equal(liveWithSim.score, lrt2Westbound.score, 'simulated trains must not affect live public congestion');

const crowdTrain = {
    ...staleSignal,
    id: 'crowd-fresh',
    updatedAt: weekdayAm.getTime(),
    sourceCount: 4,
    freshness: 'fresh',
};
const crowdConfirmed = getCongestionLevel('L2-06', weekdayAm, 'WESTBOUND', 'LRT2', null, [crowdTrain], 'live');
assert.equal(crowdConfirmed.confidence, 'high', 'fresh crowd clusters should raise congestion confidence');
assert.ok(crowdConfirmed.score > lrt2Westbound.score, 'fresh crowd clusters can moderately raise score');

const manila337 = new Date('2026-05-30T19:37:00Z');
const manila337Parts = getManilaDateParts(manila337);
assert.equal(manila337Parts.dateKey, '2026-05-31', 'UTC instants should resolve to the Manila service date');
assert.equal(manila337Parts.hour, 3, '19:37Z should be 03:37 in Manila');
assert.equal(manila337Parts.weekdayIndex, 0, '2026-05-31 03:37 Manila should be Sunday');
assert.equal(getManilaDaypart(manila337Parts), 'closed', '03:37 Manila must be classified as closed');
assert.equal(getTimeMultiplier(manila337).name, 'CLOSED', 'rush-hour time profile must use Manila time, not the Vercel UTC hour');
assert.equal(
    parseManilaTimestamp('2026-05-31T03:37:00')?.toISOString(),
    '2026-05-30T19:37:00.000Z',
    'bare API at= timestamps should be interpreted as Manila local time',
);

console.log('Logic rebuild smoke checks passed');
