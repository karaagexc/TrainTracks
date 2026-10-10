import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Module from 'node:module';
import ts from 'typescript';
import { performance } from 'node:perf_hooks';

const cwd = process.cwd();
const resolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
    if (request === 'server-only') return path.join(cwd, 'node_modules/next/dist/compiled/server-only/empty.js');
    if (request.startsWith('@/')) return resolve.call(this, path.join(cwd, 'src', request.slice(2)), parent, isMain, options);
    return resolve.call(this, request, parent, isMain, options);
};
Module._extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { esModuleInterop: true, jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, filename);
const require = Module.createRequire(import.meta.url);
const { createForegroundPoller, getAdaptivePredictionPollMs, parseRetryAfter, PollHttpError } = require('../src/domain/network/runtime.ts');
const { deriveOfflineForecasts, isPredictionResponse, OFFLINE_FORECAST_HORIZON_MS } = require('../src/domain/predictions/snapshot.ts');
const { createCrowdSampleReceiver, isReceivedCrowdPresence } = require('../src/domain/crowd/receiver.ts');
const snapshotAdmin = require('../src/lib/supabase/admin.ts');
const { crowdRowToPresence } = require('../src/domain/crowd/snapshot.ts');
const { reconcileIncidentSnapshot } = require('../src/domain/crowd/incidentReceiver.ts');
const { isReliableStallWindow } = require('../src/domain/crowd/stallDetection.ts');
const { useTrainStore } = require('../src/store/useTrainStore.ts');
const { API_CONFIG_DEFAULTS } = require('../src/domain/config/index.ts');
const { sanitizeCrowdPresencePayload } = require('../src/domain/crowd/presence.ts');

for (const dataMode of ['auto', 'standard', 'saver']) for (const effectiveType of [null, '2g', '3g', '4g']) {
    assert.equal(getAdaptivePredictionPollMs({ dataMode, effectiveType, saveData: true }), 1000);
}
assert.equal(parseRetryAfter('7', 1000), 7000);
assert.equal(parseRetryAfter(new Date(15_000).toUTCString(), 1000), 14_000);
assert.equal(parseRetryAfter('invalid', 1000), 0);

let clock = 1000;
let active = true;
let nextId = 0;
const timers = new Map();
const pending = [];
let runCount = 0;
let commits = 0;
let errors = 0;
const settle = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
const poller = createForegroundPoller({
    now: () => clock, isActive: () => active,
    setTimer: (callback, delay) => { const id = ++nextId; timers.set(id, { callback, at: clock + delay }); return id; },
    clearTimer: (id) => timers.delete(id),
    run: (signal, isCurrent) => {
        runCount++;
        return new Promise((resolveRun, rejectRun) => pending.push({
            signal, resolve: () => { if (isCurrent()) commits++; resolveRun(); }, reject: rejectRun,
        }));
    }, onError: () => errors++,
});
const advance = async (to) => {
    clock = to;
    for (const [id, timer] of [...timers]) if (timer.at <= clock) { timers.delete(id); timer.callback(); }
    await settle();
};
poller.wake(); poller.wake(); poller.wake();
assert.equal(runCount, 1, 'requests never overlap');
pending.shift().resolve(); await settle();
await advance(1999); assert.equal(runCount, 1);
await advance(2000); assert.equal(runCount, 2, 'healthy foreground cadence is one second');
active = false; poller.pause();
assert.equal(pending[0].signal.aborted, true, 'hidden/offline pauses abort immediately');
pending.shift().resolve(); await settle();
assert.equal(commits, 1, 'an obsolete response cannot commit even if fetch ignores abort');
await advance(10_000); assert.equal(runCount, 2);
active = true; poller.wake(true);
pending.shift().reject(new PollHttpError(429, 15_000)); await settle();
poller.wake(true); assert.equal(runCount, 3, 'reconnect cannot bypass Retry-After');
await advance(24_999); assert.equal(runCount, 3);
await advance(25_000); assert.equal(runCount, 4);
assert.equal(errors, 1);
poller.stop(); pending.shift().resolve(); await settle();
assert.equal(timers.size, 0, 'stopped poller retains no timers');

const realNow = Date.now;
const fixedNow = Date.parse('2026-05-28T01:15:00Z');
const stallConfig = { sampleIntervalMs: 15000, windowSamples: 17, thresholdKm: 0.12, activationDistKm: 0.2 };
const stallSamples = Array.from({length: 17}, (_, index) => ({ timestamp: fixedNow + index * 15000, speedKph: 0, routeDistanceMeters: 500 }));
assert.equal(isReliableStallWindow(stallSamples, stallConfig), true);
assert.equal(isReliableStallWindow([stallSamples[0], stallSamples[16]], stallConfig), false, 'signal gaps cannot prove a continuous stall');
assert.equal(isReliableStallWindow(stallSamples.map(sample => ({...sample, routeDistanceMeters: 10})), stallConfig), false);
assert.equal(isReliableStallWindow(stallSamples.map((sample, index) => ({...sample, timestamp: sample.timestamp + (index > 8 ? 60000 : 0)})), stallConfig), false);
Date.now = () => fixedNow;
const OriginalFormatter = Intl.DateTimeFormat;
let formatterCount = 0;
Intl.DateTimeFormat = class extends OriginalFormatter { constructor(...args) { super(...args); formatterCount++; } };
const { getPredictionResponse, getTrainServiceAvailability } = require('../src/domain/predictions/engine.ts');
assert.equal(getTrainServiceAvailability({ now: new Date('2026-05-28T04:45:00+08:00'), lineId: 'LRT1' }), true);
assert.equal(getTrainServiceAvailability({ now: new Date('2026-05-28T04:45:00+08:00'), lineId: 'LRT2' }), false);
assert.equal(getTrainServiceAvailability({ now: new Date('2026-05-28T04:45:00+08:00') }), true);
assert.equal(getTrainServiceAvailability({ now: new Date('2026-05-28T03:00:00+08:00') }), false);
assert.equal(getTrainServiceAvailability({ now: new Date('2026-04-03T09:00:00+08:00') }), false);
assert.equal(getTrainServiceAvailability({ now: new Date('2026-05-28T09:00:00+08:00'), lineId: 'MRT7' }), false);
const stationResponse = getPredictionResponse({ now: new Date(fixedNow), stationId: 'M3-13', lineId: 'MRT3', direction: 'SOUTHBOUND', scope: 'station' });
const mapResponse = getPredictionResponse({ now: new Date(fixedNow), scope: 'map', limit: 20 });
assert.ok(stationResponse.predictions.length > 0);
assert.ok(isPredictionResponse(stationResponse));
assert.equal(isPredictionResponse({ predictions: [] }), false);
assert.equal(isPredictionResponse({ ...stationResponse, predictions: [null] }), false);
assert.equal(isPredictionResponse({ ...stationResponse, serviceState: 'unknown' }), false);
assert.equal(isPredictionResponse({ ...stationResponse, timezone: 'UTC' }), false);
for (const patch of [{ speedKph: -1 }, { confidence: 2 }, { lat: 100 }, { direction: 'EASTBOUND' }]) {
    assert.equal(isPredictionResponse({ ...stationResponse, predictions: [{ ...stationResponse.predictions[0], ...patch }] }), false);
}
const context = useTrainStore.getState().beginPredictionContext();
const snapshots = [{ key: 'station', response: stationResponse, receivedAt: fixedNow }, { key: 'map', response: mapResponse, receivedAt: fixedNow }];
useTrainStore.getState().setPredictionSnapshots(context, snapshots);
assert.deepEqual(useTrainStore.getState().predictionSnapshots[0].response.provenance, stationResponse.provenance);
assert.equal(useTrainStore.getState().predictionSnapshots[0].response.generatedAt, stationResponse.generatedAt);
assert.equal(useTrainStore.getState().predictionSnapshots[0].response.serviceState, stationResponse.serviceState);
assert.equal(useTrainStore.getState().stationForecasts.length, stationResponse.predictions.length);
assert.equal(useTrainStore.getState().trains.some(train => train.predictionScope === 'station'), false);
const older = { ...stationResponse, generatedAt: new Date(fixedNow - 1000).toISOString(), predictions: [] };
useTrainStore.getState().setPredictionSnapshots(context, [{ key: 'station', response: older, receivedAt: fixedNow + 5000 }]);
assert.equal(useTrainStore.getState().stationForecasts.length, stationResponse.predictions.length, 'older server generation is rejected');
const receipt = useTrainStore.getState().predictionLastReceivedAt;
const revision = useTrainStore.getState().predictionRevision;
const offline = deriveOfflineForecasts(snapshots, fixedNow + 30_000);
assert.ok(offline.length > 0);
assert.ok(offline.every(train => train.updatedAt === fixedNow && train.freshness === 'stale'));
assert.deepEqual(deriveOfflineForecasts(snapshots, fixedNow + OFFLINE_FORECAST_HORIZON_MS + 1), []);
useTrainStore.getState().setPredictionState('offline');
useTrainStore.getState().setOfflineForecasts(context, offline, revision);
assert.equal(useTrainStore.getState().predictionLastReceivedAt, receipt, 'local rendering cannot refresh network receipt time');
assert.equal(useTrainStore.getState().predictionSnapshots[0].response.validUntil, stationResponse.validUntil);
useTrainStore.getState().setPredictionSnapshots(context, snapshots);
useTrainStore.getState().setPredictionState('offline');
useTrainStore.getState().setOfflineForecasts(context, offline, revision);
assert.deepEqual(useTrainStore.getState().offlineForecasts, [], 'an older worker revision cannot replace a newer snapshot');
const nextContext = useTrainStore.getState().beginPredictionContext();
useTrainStore.getState().setPredictionSnapshots(context, snapshots);
assert.equal(useTrainStore.getState().predictionSnapshots.length, 0, 'obsolete station/context responses are rejected');
assert.notEqual(nextContext, context);
const start = performance.now();
for (let i = 0; i < 100; i++) getPredictionResponse({ now: new Date(fixedNow + i * 1000), scope: 'map', limit: 20 });
assert.ok(formatterCount <= 2, `formatter constructed ${formatterCount} times`);
console.log(`100 warm prediction responses: ${(performance.now() - start).toFixed(1)} ms; Intl formatters: ${formatterCount}`);
Intl.DateTimeFormat = OriginalFormatter;

const row = { pseudonym: 'daily-public-pseudonym', sample_id: 'sample-1', line_id: 'LRT1', direction: 'SOUTHBOUND', status_code: 'IN_TRANSIT',
    station_id: 'L1-02', station_name: 'EDSA', lat: 14.5388, lng: 121.0006, speed_kph: 18, confidence: 0.72,
    updated_at: new Date(fixedNow - 2000).toISOString(), expires_at: new Date(fixedNow + 43_000).toISOString(),
    raw_device_id: 'secret-device', user_id: 'private-account', claim_token: 'private-claim' };
const train = crowdRowToPresence(row, 'isolated-fixture-secret');
assert.equal(train.updatedAt, fixedNow - 2000);
assert.equal(train.validUntil, fixedNow + 43_000);
assert.ok(!JSON.stringify(train).includes('private'));
assert.ok(!JSON.stringify(train).includes('secret-device'));
const rawIdentity = 'secret-device-identifier:1234';
const redacted = crowdRowToPresence({ ...row, sample_id: rawIdentity }, 'isolated-fixture-secret');
assert.ok(!JSON.stringify(redacted).includes(rawIdentity));
assert.match(redacted.sampleId, /^cs-[0-9a-f]{32}$/);
assert.equal(crowdRowToPresence({ ...row, sample_id: redacted.sampleId }, 'isolated-fixture-secret').sampleId, redacted.sampleId);
assert.equal(isReceivedCrowdPresence(train, fixedNow), true);
const receive = createCrowdSampleReceiver();
assert.equal(receive(train, fixedNow), true);
assert.equal(receive(train, fixedNow), false);
assert.equal(isReceivedCrowdPresence({ ...train, source: 'simulated' }, fixedNow), false);
for (const patch of [{ speedKph: -1 }, { speedKph: 999 }, { confidence: 2 }, { sampleId: '' }, { stationId: 'M3-13' }]) {
    assert.equal(isReceivedCrowdPresence({ ...train, ...patch }, fixedNow), false);
}
useTrainStore.getState().upsertTrain(train);
const before = useTrainStore.getState();
useTrainStore.getState().upsertTrain({ ...train, updatedAt: fixedNow });
assert.equal(useTrainStore.getState(), before, 'same-sample echoes do not refresh a store sample');
useTrainStore.getState().setRealtimeStatus('live');
useTrainStore.getState().setPolling(false);
assert.equal(useTrainStore.getState().realtimeStatus, 'live', 'HTTP completion never changes websocket status');
assert.equal(sanitizeCrowdPresencePayload({ ...train, deviceId: 'fixture-device', locationSource: 'fallback' }, fixedNow).ok, false);
assert.equal(sanitizeCrowdPresencePayload({ ...train, deviceId: 'fixture-device', updatedAt: fixedNow - 60_000 }, fixedNow).ok, false);
assert.equal(sanitizeCrowdPresencePayload({ ...train, deviceId: 'fixture-device', updatedAt: null }, fixedNow).ok, false);
const missingSample = { ...train, deviceId: 'fixture-device', sampleId: undefined };
assert.equal(sanitizeCrowdPresencePayload(missingSample, fixedNow).sampleId,
    sanitizeCrowdPresencePayload(missingSample, fixedNow + 1000).sampleId, 'retries use observation time, never a new receipt identity');

const incident = { id: 'incident-1', status: 'CONFIRMED', expiresAt: new Date(fixedNow + 60_000).toISOString() };
assert.deepEqual(reconcileIncidentSnapshot([], [incident], fixedNow, new Map([['incident-1', fixedNow + 1]]), fixedNow), [],
    'a snapshot cannot resurrect an incident resolved while it was in flight');
const updatedIncident = { ...incident, reportCount: 9 };
assert.equal(reconcileIncidentSnapshot([updatedIncident], [incident], fixedNow, new Map([['incident-1', fixedNow + 1]]), fixedNow)[0].reportCount, 9);
Date.now = realNow;

// Local adapters only: no production reads, reports, or database writes.
const adminPath = require.resolve('../src/lib/supabase/admin.ts');
const configLoaderPath = require.resolve('../src/domain/config/server.ts');
let configReads = 0;
let configClock = realNow();
let publicEnabled = true;
Date.now = () => configClock;
require.cache[configLoaderPath] = { id: configLoaderPath, filename: configLoaderPath, loaded: true, exports: {
    loadServerConfig: async () => { configReads++; return { status: 'ready', error: null, config: {
        api_config: structuredClone(API_CONFIG_DEFAULTS), public_api_enabled: publicEnabled,
        updated_at: new Date(configClock).toISOString(),
    } }; },
} };
const broadcastPath = require.resolve('../src/domain/crowd/broadcast.ts');
let stored = false;
let claimed = false;
let delivered = false;
let broadcasts = 0;
let marks = 0;
let storedPublicTrain;
const calls = [];
require.cache[adminPath] = { id: adminPath, filename: adminPath, loaded: true, exports: {
    hasAdminSupabaseConfig: () => true,
    createAdminClient: () => ({ rpc: async (name, args) => {
        calls.push({ name, args });
        if (name === 'record_crowd_presence') {
            storedPublicTrain = { ...train, id: `CROWD-${args.p_pseudonym}`, deviceId: args.p_pseudonym, sampleId: args.p_sample_id };
            const duplicate = stored; stored = true;
            return { data: { ok: true, duplicate, broadcast_state_supported: true, broadcasted: delivered }, error: null };
        }
        if (name === 'claim_crowd_presence_broadcast') {
            if (claimed) return { data: { ok: true, status: 'claimed_elsewhere' }, error: null };
            claimed = true;
            return { data: { ok: true, status: 'acquired', claim_token: 'owner-token', train: storedPublicTrain }, error: null };
        }
        if (name === 'mark_crowd_presence_broadcasted') { marks++; delivered = true; assert.equal(args.p_claim_token, 'owner-token'); }
        return { data: { ok: true }, error: null };
    } }),
} };
require.cache[broadcastPath] = { id: broadcastPath, filename: broadcastPath, loaded: true, exports: {
    broadcastCrowdPresence: async () => { broadcasts++; await Promise.resolve(); return { ok: true, status: 200, code: 'ok', message: 'fixture' }; },
} };
const secret = process.env.TRAINTRACKS_CROWD_ID_SECRET;
process.env.TRAINTRACKS_CROWD_ID_SECRET = 'isolated-fixture-secret';
const { processCrowdPresence } = require('../src/domain/crowd/service.ts');
const payload = { ...train, deviceId: 'fixture-device', locationSource: 'gps' };
const results = await Promise.all([processCrowdPresence(payload, fixedNow), processCrowdPresence(payload, fixedNow)]);
assert.ok(results.every(result => result.ok));
assert.ok(results.every(result => !JSON.stringify(result.train).includes('fixture-device')));
assert.match(calls.find(call => call.name === 'record_crowd_presence').args.p_sample_id, /^cs-[0-9a-f]{32}$/);
assert.equal(broadcasts, 1, 'concurrent same-sample callers acquire one durable broadcast claim');
assert.equal(marks, 1);
assert.equal(calls.find(call => call.name === 'record_crowd_presence').args.p_reported_at, row.updated_at);
assert.equal((await processCrowdPresence(payload, fixedNow)).duplicate, true);
assert.equal(broadcasts, 1, 'delivery retry cannot broadcast a completed sample again');
if (secret === undefined) delete process.env.TRAINTRACKS_CROWD_ID_SECRET;
else process.env.TRAINTRACKS_CROWD_ID_SECRET = secret;
const migration = fs.readFileSync(path.join(cwd, 'supabase/20261009_crowd_repair.sql'), 'utf8');
assert.match(migration, /pg_advisory_xact_lock/);
assert.match(migration, /claim_token = p_claim_token/);
assert.match(migration, /'code', 'claim_token_required'/);
assert.match(migration, /revoke all on public.crowd_presence_deliveries from public, anon, authenticated/);

let usageWrites = 0;
let constructedUpdates = 0;
require.cache[adminPath].exports.createAdminClient = () => ({ from: () => ({
    select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: {
        id: 'isolated-token-id', allowed_origins: ['https://fixture.test'], scopes: ['predictions:read'], expires_at: null,
    }, error: null }) }) }) }),
    update: () => { constructedUpdates++; return { eq: () => ({ then: (resolveUpdate) => {
        usageWrites++; resolveUpdate({ error: null });
    } }) }; },
}) });
const { verifyPredictionApiAccess } = require('../src/domain/predictions/apiAccess.ts');
const authorized = { headers: new Headers({ authorization: 'Bearer fixture-token', origin: 'https://fixture.test' }),
    url: new URL('https://fixture.test/api/public/predictions'), requiredScope: 'predictions:read', env: {} };
assert.ok((await verifyPredictionApiAccess(authorized)).ok);
assert.ok((await verifyPredictionApiAccess(authorized)).ok);
assert.equal(usageWrites, 1, 'last_used_at query must be consumed and throttled');
assert.equal(constructedUpdates, 1);
assert.equal((await verifyPredictionApiAccess({ ...authorized, requiredScope: 'crowd:write' })).status, 403);
assert.equal((await verifyPredictionApiAccess({ ...authorized,
    headers: new Headers({ authorization: 'Bearer fixture-token', origin: 'https://hostile.test' }) })).status, 403);
assert.equal(usageWrites, 1, 'failed scopes/origins must not write token usage');
assert.equal(configReads, 1, 'concurrent predictions/crowd/auth share a bounded config read');
const { getServerApiConfiguration, getConfiguredPredictionResponse, publicApiConfigurationAccess, SERVER_CONFIG_TTL_MS } = require('../src/domain/predictions/serverConfig.ts');
await getServerApiConfiguration(); await getServerApiConfiguration();
assert.equal(configReads, 1);
publicEnabled = false;
configClock += SERVER_CONFIG_TTL_MS + 1;
assert.equal((await verifyPredictionApiAccess(authorized)).code, 'public_api_disabled');
assert.equal(configReads, 2, 'config is refreshed only at bounded TTL expiry');
const internal = await getConfiguredPredictionResponse({ now: new Date(fixedNow), scope: 'map', limit: 20 });
assert.ok(internal.predictions.length > 0, 'public disable must not disable first-party predictions');
assert.match(internal.sourceVersion, /config-v1:/);
assert.equal(publicApiConfigurationAccess({status:'degraded',config:null,error:'schema mismatch'}).ok, false);
assert.equal(publicApiConfigurationAccess({status:'error',config:null,error:'offline'}).ok, false);
const custom = getPredictionResponse({ now: new Date(fixedNow), scope:'station',stationId:'M3-13',lineId:'MRT3',direction:'SOUTHBOUND',
    config: { defaultLimit:1,validWindowS:60,stationLookaheadMin:5 } });
assert.ok(custom.predictions.length <= 1);
assert.equal(Date.parse(custom.validUntil) - fixedNow, 60_000);
assert.ok(custom.predictions.every(train => train.etaSeconds <= 300));

const { NextRequest } = require('next/server');
const previousTokens = process.env.TRAINTRACKS_PUBLIC_API_TOKENS;
process.env.TRAINTRACKS_PUBLIC_API_TOKENS = 'isolated-route-token';
try {
    const endpoints = [
        ['congestion', 'GET'], ['crowd/presence', 'POST'], ['incidents', 'GET'],
        ['incidents/resolve', 'POST'], ['predictions', 'GET'], ['predictions/stream', 'GET'],
        ['rush-hour', 'GET'], ['stall-config', 'GET'], ['stall-report', 'POST'],
    ];
    for (const [endpoint, method] of endpoints) {
        const handler = require(`../src/app/api/public/${endpoint}/route.ts`);
        const request = new NextRequest(`https://fixture.test/api/public/${endpoint}`, {
            method, headers: { authorization: 'Bearer isolated-route-token', origin: 'https://fixture.test' },
        });
        const response = await handler[method](request);
        assert.equal(response.status, 503, `${endpoint} must enforce public disable before work`);
        assert.equal((await response.json()).error, 'public_api_disabled');
        assert.match(response.headers.get('cache-control'), /no-store/);
    }
    const internalHandler = require('../src/app/api/predictions/route.ts');
    const firstParty = await internalHandler.GET(new NextRequest('https://fixture.test/api/predictions'));
    assert.equal(firstParty.status, 200, 'the internal route remains available when public API is disabled');
    assert.ok(isPredictionResponse(await firstParty.json()));
    assert.equal(configReads, 2, 'all endpoint handlers reuse the same short-lived config snapshot');
} finally {
    if (previousTokens === undefined) delete process.env.TRAINTRACKS_PUBLIC_API_TOKENS;
    else process.env.TRAINTRACKS_PUBLIC_API_TOKENS = previousTokens;
}

let selectedFields;
require.cache[adminPath].exports.createAdminClient = () => ({ from: table => {
    assert.equal(table, 'crowd_presence');
    return { select: fields => {
        selectedFields = fields;
        return { gt: () => ({ lte: () => ({ order: () => ({ limit: async () => ({ data: [row], error: null }) }) }) }) };
    } };
} });
Object.assign(snapshotAdmin, require.cache[adminPath].exports);
const snapshotRoute = require('../src/app/api/crowd/presence/route.ts');
process.env.TRAINTRACKS_CROWD_ID_SECRET = 'isolated-fixture-secret';
const snapshotResponse = await snapshotRoute.GET();
if (secret === undefined) delete process.env.TRAINTRACKS_CROWD_ID_SECRET;
else process.env.TRAINTRACKS_CROWD_ID_SECRET = secret;
assert.equal(snapshotResponse.status, 200);
const retainedSnapshot = await snapshotResponse.json();
assert.equal(retainedSnapshot.trains[0].updatedAt, fixedNow - 2000);
assert.equal(retainedSnapshot.trains[0].validUntil, fixedNow + 43_000);
assert.ok(Number.isFinite(Date.parse(retainedSnapshot.generatedAt)));
assert.ok(!JSON.stringify(retainedSnapshot).includes('private'));
assert.ok(!JSON.stringify(retainedSnapshot).includes('secret-device'));
assert.ok(!/raw_device_id|user_id|claim_token/.test(selectedFields));
Date.now = realNow;
console.log('Prediction/crowd repair smoke checks passed (isolated fixtures; PostgreSQL concurrency not certified).');
