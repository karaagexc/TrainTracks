import assert from 'node:assert/strict';
import crypto from 'node:crypto';
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
const { STATIONS } = require('../src/data/stations.ts');
const { getSegmentDistance } = require('../src/data/segmentDistances.ts');
const { verifyPredictionApiAccess } = require('../src/domain/predictions/apiAccess.ts');
const { normalizePublicApiScopes, publicApiTokenHasScope } = require('../src/domain/predictions/apiScopes.ts');
const { buildPredictionRequests, PREDICTION_MAP_LIMIT, PREDICTION_STATION_LIMIT } = require('../src/domain/predictions/clientRequests.ts');
const { getPredictionResponse } = require('../src/domain/predictions/engine.ts');
const { ACTIVE_PREDICTION_TICK_MS } = require('../src/domain/network/runtime.ts');
const { formatPredictionSseEvent } = require('../src/domain/predictions/stream.ts');
const { getPublicApiHeaders, isPublicApiOriginAllowed } = require('../src/domain/predictions/http.ts');
const { getTrackGeometryPosition } = require('../src/domain/predictions/trackGeometry.ts');
const { filterOverriddenPredictions, getStationDwellSummary } = require('../src/domain/trainPresence.ts');
const { getTrainStatusLabel } = require('../src/types/train.ts');

function station(id) {
    const found = STATIONS.find((candidate) => candidate.id === id);
    assert.ok(found, `Missing station ${id}`);
    return found;
}

function distanceKm(left, right) {
    const earthRadiusKm = 6371;
    const dLat = (right.latitude - left.latitude) * Math.PI / 180;
    const dLng = (right.longitude - left.longitude) * Math.PI / 180;
    const leftLat = left.latitude * Math.PI / 180;
    const rightLat = right.latitude * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2
        + Math.cos(leftLat) * Math.cos(rightLat) * Math.sin(dLng / 2) ** 2;
    return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function predictionAt(isoString, overrides = {}) {
    return getPredictionResponse({
        now: new Date(isoString),
        mode: 'live',
        ...overrides,
    });
}

function apiAccess(headers = {}, url = 'https://traintracks.test/api/public/predictions', env = {}) {
    return verifyPredictionApiAccess({
        headers: new Headers(headers),
        url: new URL(url),
        env,
    });
}

assert.deepEqual(
    normalizePublicApiScopes(['predictions:read', 'predictions:read', 'not-a-scope']),
    ['predictions:read'],
    'API token scopes should be validated and deduplicated',
);
assert.equal(publicApiTokenHasScope(['predictions:read'], 'predictions:read'), true);
assert.equal(publicApiTokenHasScope(['predictions:read'], 'incidents:write'), false);
assert.equal(publicApiTokenHasScope(['*'], 'crowd:write'), true, 'legacy environment tokens retain wildcard access');

assert.equal((await apiAccess()).status, 503, 'public prediction API should fail closed when no token is configured');
assert.equal((await apiAccess({}, undefined, { TRAINTRACKS_PUBLIC_API_TOKENS: 'secret-token' })).status, 401, 'public prediction API should require a token');
assert.equal(
    (await apiAccess({ authorization: 'Bearer secret-token' }, undefined, { TRAINTRACKS_PUBLIC_API_TOKENS: 'secret-token' })).ok,
    true,
    'public prediction API should accept bearer tokens',
);
assert.equal(
    (await apiAccess({ 'x-api-key': 'secret-token' }, undefined, { TRAINTRACKS_PUBLIC_API_TOKENS: 'secret-token' })).ok,
    true,
    'public prediction API should accept x-api-key tokens',
);
assert.equal(
    (await apiAccess({}, 'https://traintracks.test/api/public/predictions?token=secret-token', { TRAINTRACKS_PUBLIC_API_TOKENS: 'secret-token' })).status,
    401,
    'public prediction API should reject query tokens so credentials do not leak through URLs',
);
assert.equal(
    (await apiAccess({ authorization: 'Bearer wrong-token' }, undefined, { TRAINTRACKS_PUBLIC_API_TOKENS: 'secret-token' })).status,
    401,
    'public prediction API should reject invalid raw tokens',
);
assert.equal(
    (await apiAccess(
        { authorization: 'Bearer secret-token' },
        undefined,
        { TRAINTRACKS_PUBLIC_API_TOKEN_HASHES: crypto.createHash('sha256').update('secret-token').digest('hex') },
    )).ok,
    true,
    'public prediction API should accept sha256 token hashes',
);

assert.equal(
    (await apiAccess(
        { authorization: 'Bearer secret-token', origin: 'https://evil.example' },
        undefined,
        { TRAINTRACKS_PUBLIC_API_TOKENS: 'secret-token', NODE_ENV: 'production' },
    )).status,
    403,
    'valid API tokens cannot be used from an untrusted browser origin',
);
assert.equal(
    (await apiAccess(
        { authorization: 'Bearer secret-token', origin: 'https://partner.example' },
        undefined,
        {
            TRAINTRACKS_PUBLIC_API_TOKENS: 'secret-token',
            TRAINTRACKS_PUBLIC_API_ORIGINS: 'https://partner.example',
            NODE_ENV: 'production',
        },
    )).ok,
    true,
    'configured partner origins can use header-authenticated API tokens',
);
assert.equal(
    (await apiAccess(
        { authorization: 'Bearer secret-token', origin: 'https://traintracks.test' },
        undefined,
        { TRAINTRACKS_PUBLIC_API_TOKENS: 'secret-token', NODE_ENV: 'production' },
    )).ok,
    true,
    'same-origin browser requests remain authorized',
);
function corsRequest(origin) {
    return {
        headers: new Headers(origin ? { origin } : {}),
        nextUrl: new URL('https://traintracks.test/api/public/predictions'),
    };
}

const sameOriginCors = getPublicApiHeaders(corsRequest('https://traintracks.test'));
assert.equal(sameOriginCors['Access-Control-Allow-Origin'], 'https://traintracks.test');
assert.equal(sameOriginCors.Vary, 'Origin');
assert.equal(isPublicApiOriginAllowed(corsRequest('https://traintracks.test')), true);
const untrustedCors = getPublicApiHeaders(corsRequest('https://evil.example'));
assert.equal(untrustedCors['Access-Control-Allow-Origin'], undefined, 'untrusted origins are never reflected');
assert.equal(isPublicApiOriginAllowed(corsRequest('https://evil.example')), false);
assert.equal(isPublicApiOriginAllowed(corsRequest(null)), true, 'same-site and non-browser clients may omit Origin');
const guadalupe = station('M3-09');
const buendia = station('M3-10');
const mrt3TrackMidpoint = getTrackGeometryPosition('MRT3', guadalupe, buendia, 0.5);
const mrt3StraightMidpoint = {
    latitude: (guadalupe.latitude + buendia.latitude) / 2,
    longitude: (guadalupe.longitude + buendia.longitude) / 2,
};
assert.ok(mrt3TrackMidpoint, 'prediction track geometry should resolve MRT-3 path points');
assert.ok(
    Math.abs(mrt3TrackMidpoint.latitude - mrt3StraightMidpoint.latitude) > 0.00005 ||
    Math.abs(mrt3TrackMidpoint.longitude - mrt3StraightMidpoint.longitude) > 0.00005,
    'prediction positions should follow GeoJSON track geometry instead of straight Haversine chords',
);

const lrt1Stations = STATIONS
    .filter((candidate) => candidate.lineId === 'LRT1')
    .sort((left, right) => left.order - right.order);
for (let index = 1; index < lrt1Stations.length; index += 1) {
    const from = lrt1Stations[index - 1];
    const to = lrt1Stations[index];
    const midpoint = getTrackGeometryPosition('LRT1', from, to, 0.5);
    if (!midpoint) continue;
    const segmentKm = (getSegmentDistance(from.id, to.id) ?? distanceKm(from, to) * 1000) / 1000;
    const maxMidpointDistanceKm = Math.max(segmentKm * 0.8, 1.2);
    assert.ok(
        distanceKm(from, midpoint) <= maxMidpointDistanceKm && distanceKm(to, midpoint) <= maxMidpointDistanceKm,
        `LRT-1 ${from.id} -> ${to.id} midpoint should not wrap across terminals`,
    );
}

[
    ['L1-19', 'L1-18'],
    ['L1-02', 'L1-01'],
    ['L1-01', 'L1-21'],
].forEach(([fromId, toId]) => {
    const from = station(fromId);
    const to = station(toId);
    const midpoint = getTrackGeometryPosition('LRT1', from, to, 0.5);
    assert.ok(midpoint, `LRT-1 prediction geometry should resolve known wrap-risk segment ${fromId} -> ${toId}`);
    assert.ok(
        distanceKm(from, midpoint) < 2 && distanceKm(to, midpoint) < 2,
        `LRT-1 ${fromId} -> ${toId} should not route ghosts through a terminal loop`,
    );
});

const lrt1Opening = predictionAt('2026-06-01T04:30:00+08:00', {
    scope: 'map',
    lineId: 'LRT1',
    direction: 'SOUTHBOUND',
    limit: 10,
});
const sseEvent = formatPredictionSseEvent(lrt1Opening, 123);
const sseDataLine = sseEvent.split('\n').find((line) => line.startsWith('data: '));
assert.match(sseEvent, /^event: predictions\nid: 123\n/, 'prediction stream should emit named SSE events with ids');
assert.ok(sseDataLine, 'prediction stream should include a JSON data line');
assert.equal(JSON.parse(sseDataLine.slice(6)).sourceVersion, lrt1Opening.sourceVersion, 'prediction stream data should be a prediction response');
assert.equal(lrt1Opening.provenance.category, 'schedule_model');
assert.equal(lrt1Opening.provenance.realtimeVehicleFeed, false, 'predictions do not impersonate an operator live feed');
assert.deepEqual(
    lrt1Opening.provenance.inputs,
    ['service_window', 'headway_profile', 'track_geometry'],
);assert.equal(lrt1Opening.serviceState, 'active');
assert.equal(lrt1Opening.predictions.length, 1, 'LRT-1 opening should expose only the first dispatched ghost train');
assert.equal(lrt1Opening.predictions[0].stationId, 'L1-20', 'first southbound LRT-1 ghost starts at FPJ/Roosevelt');

const lrt1BeforeSecond = predictionAt('2026-06-01T04:33:30+08:00', {
    scope: 'map',
    lineId: 'LRT1',
    direction: 'SOUTHBOUND',
    limit: 10,
});
assert.equal(lrt1BeforeSecond.predictions.length, 1, 'second LRT-1 ghost should not appear before the modeled dispatch time');

const lrt1Leaving = predictionAt('2026-06-01T04:30:10+08:00', {
    scope: 'map',
    lineId: 'LRT1',
    direction: 'SOUTHBOUND',
    limit: 10,
});
assert.ok(lrt1Leaving.predictions[0].speedKph > 0 && lrt1Leaving.predictions[0].speedKph < 60, 'LRT-1 predicted speed should ramp up while leaving');
assert.equal(lrt1Leaving.predictions[0].statusCode, 'LEAVING_STATION', 'early prediction should be in leaving state');

const lrt1Cruise = predictionAt('2026-06-01T04:31:05+08:00', {
    scope: 'map',
    lineId: 'LRT1',
    direction: 'SOUTHBOUND',
    limit: 10,
});
assert.equal(lrt1Cruise.predictions[0].speedKph, 60, 'LRT-1 predicted cruise speed should match NAV/SIM speed');

const lrt1Approach = predictionAt('2026-06-01T04:31:55+08:00', {
    scope: 'map',
    lineId: 'LRT1',
    direction: 'SOUTHBOUND',
    limit: 10,
});
assert.ok(lrt1Approach.predictions[0].speedKph > 0 && lrt1Approach.predictions[0].speedKph < 60, 'LRT-1 predicted speed should ramp down while approaching');
assert.equal(lrt1Approach.predictions[0].statusCode, 'APPROACHING_STATION', 'late segment prediction should be approaching');

const lrt2Cruise = predictionAt('2026-06-01T05:00:55+08:00', {
    scope: 'map',
    lineId: 'LRT2',
    direction: 'WESTBOUND',
    limit: 10,
});
assert.equal(lrt2Cruise.predictions[0].speedKph, 80, 'LRT-2 predicted cruise speed should match NAV/SIM speed');

const lrt1FirstDwell = predictionAt('2026-06-01T04:32:15+08:00', {
    scope: 'map',
    lineId: 'LRT1',
    direction: 'SOUTHBOUND',
    limit: 10,
});
const firstDwellingGhost = lrt1FirstDwell.predictions.find((prediction) => prediction.stationId === 'L1-19');
assert.equal(firstDwellingGhost?.statusCode, 'AT_STATION', 'predicted dwell should latch to the station instead of hovering as a moving marker');
const predictedDwellSummary = getStationDwellSummary(lrt1FirstDwell.predictions, 'L1-19', Date.parse('2026-06-01T04:32:15+08:00'));
assert.equal(predictedDwellSummary.trainCount, 1, 'predicted dwell should feed the station pill pipeline');
assert.equal(predictedDwellSummary.confirmedTrainCount, 0, 'predicted dwell must remain separate from confirmed dock counts');
assert.equal(predictedDwellSummary.expectedTrainCount, 1, 'predicted dwell should count as expected station presence');

const lrt1Second = predictionAt('2026-06-01T04:34:00+08:00', {
    scope: 'map',
    lineId: 'LRT1',
    direction: 'SOUTHBOUND',
    limit: 10,
});
assert.equal(lrt1Second.predictions.length, 2, 'second LRT-1 ghost can appear once its dispatch time arrives');

const mrt3Peak = predictionAt('2026-06-01T08:30:00+08:00', {
    scope: 'map',
    lineId: 'MRT3',
    direction: 'SOUTHBOUND',
    limit: 20,
});
assert.ok(mrt3Peak.predictions.length > 1, 'MRT-3 peak should have multiple active ghosts');
assert.ok(mrt3Peak.predictions.length <= 10, 'MRT-3 peak ghosts should respect the active train cap per direction');

const lrt2Station = predictionAt('2026-06-01T08:00:00+08:00', {
    scope: 'station',
    stationId: 'L2-06',
    direction: 'WESTBOUND',
    limit: 3,
});
assert.ok(lrt2Station.predictions.length > 0, 'LRT-2 station scope should return upcoming predicted ETAs');
assert.ok(lrt2Station.predictions.every((prediction) => prediction.etaWindowSeconds >= 300), 'LRT-2 predictions should use wider uncertainty windows');
assert.ok(lrt2Station.predictions.every((prediction) => prediction.source === 'predicted'), 'station predictions remain forecast-only');

const beforeOpening = predictionAt('2026-06-01T04:00:00+08:00', {
    scope: 'map',
    lineId: 'LRT1',
    direction: 'SOUTHBOUND',
});
assert.equal(beforeOpening.predictions.length, 0, 'no ghost trains should appear before first train');
assert.equal(beforeOpening.serviceState, 'not_yet_started');

const afterClose = predictionAt('2026-06-02T00:30:00+08:00', {
    scope: 'map',
    lineId: 'LRT1',
    direction: 'SOUTHBOUND',
});
assert.equal(afterClose.predictions.length, 0, 'no ghost trains should linger after the last reachable train');

const liveMrt7 = predictionAt('2026-06-01T08:00:00+08:00', {
    scope: 'map',
    lineId: 'MRT7',
    direction: 'SOUTHBOUND',
});
assert.equal(liveMrt7.predictions.length, 0, 'MRT-7 must not leak into live predictions');
assert.equal(liveMrt7.serviceState, 'unavailable');

const predicted = lrt1Opening.predictions[0];
const truth = {
    ...predicted,
    id: 'CROWD-confirmed',
    source: 'crowd',
    confidence: 0.9,
};
const filtered = filterOverriddenPredictions([predicted, truth], Date.parse('2026-06-01T04:30:05+08:00'));
assert.equal(filtered.some((train) => train.id === predicted.id), false, 'fresh crowd truth should suppress the matching ghost prediction');
assert.equal(filtered.some((train) => train.id === truth.id), true, 'fresh crowd truth should remain visible');

const clientPredictionRequests = buildPredictionRequests('L1-20', 'M3-13', 'SOUTHBOUND', 'live');
const mapRequestUrls = clientPredictionRequests.filter((request) => request.key.includes('scope=map'));
assert.equal(mapRequestUrls.length, 1, 'app prediction client should aggregate all live lines into one map request');
assert.equal(mapRequestUrls[0].key.includes('lineId='), false, 'aggregated map request should not constrain the response to one line');
assert.ok(mapRequestUrls[0].key.includes(`limit=${PREDICTION_MAP_LIMIT}`), 'aggregated map request should retain the configured map limit');
const stationRequestUrls = clientPredictionRequests.filter((request) => request.key.includes('scope=station'));
assert.equal(stationRequestUrls.length, 2, 'app prediction client should keep station ETA requests separate from map streams');
assert.ok(stationRequestUrls.every((request) => request.key.includes(`limit=${PREDICTION_STATION_LIMIT}`)), 'station ETA requests should keep the compact station limit');

assert.equal(ACTIVE_PREDICTION_TICK_MS, 1_000, 'spectator and companion predictions should advance once per second on-device');
assert.deepEqual(
    ['AT_STATION', 'LEAVING_STATION', 'IN_TRANSIT', 'APPROACHING_STATION'].map((statusCode) => getTrainStatusLabel({ statusCode })),
    ['CURRENT STATION', 'NOW LEAVING', 'IN TRANSIT', 'NOW APPROACHING'],
    'prediction cards should use the same four movement labels as active trips',
);

const allLineRush = predictionAt('2026-06-01T08:30:00+08:00', {
    scope: 'map',
    mode: 'live',
    limit: PREDICTION_MAP_LIMIT,
});
assert.ok(allLineRush.predictions.length > 40, 'prediction API can emit more than 40 active ghosts when service profile warrants it');
assert.equal(
    filterOverriddenPredictions(allLineRush.predictions, Date.parse('2026-06-01T08:30:00+08:00')).length,
    allLineRush.predictions.length,
    'prediction filtering should not cap raw API ghosts when no real truth signal matches them',
);

console.log('Prediction smoke checks passed');
