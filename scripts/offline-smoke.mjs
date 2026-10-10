import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';
import Module from 'node:module';
import ts from 'typescript';
import { IDBFactory } from 'fake-indexeddb';
import { generateSW } from 'workbox-build';

const cwd = process.cwd();
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
    if (request.startsWith('@/')) request = path.join(cwd, 'src', request.slice(2));
    return originalResolve.call(this, request, parent, isMain, options);
};
Module._extensions['.ts'] = function (module, filename) {
    const source = fs.readFileSync(filename, 'utf8');
    module._compile(ts.transpileModule(source, { compilerOptions: {
        esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
    } }).outputText, filename);
};
const require = Module.createRequire(import.meta.url);
const storage = new Map();
let failWrites = false;
let failDeletes = false;
let failConsentReads = false;
const local = {
    get length() { return storage.size; },
    key: (index) => [...storage.keys()][index] ?? null,
    getItem: (key) => {
        if (failConsentReads && key === 'traintracks_crowd_presence_consent') throw new DOMException('Consent storage blocked', 'SecurityError');
        return storage.get(key) ?? null;
    },
    setItem: (key, value) => {
        if (failWrites) throw new DOMException('Quota exceeded', 'QuotaExceededError');
        storage.set(key, String(value));
    },
    removeItem: (key) => {
        if (failDeletes) throw new Error('Offline deletion denied');
        storage.delete(key);
    },
};
let owner = 'account-A';
let locked = false;
const locks = {
    async request(_name, options, callback) {
        if (options.ifAvailable && locked) return callback(null);
        locked = true;
        try { return await callback({}); } finally { locked = false; }
    },
};
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { locks, onLine: true } });
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: local });
Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: undefined, writable: true });

function reloadStorage() {
    for (const file of ['indexedDb', 'outbox']) delete require.cache[require.resolve(`../src/domain/offline/${file}.ts`)];
    return { ...require('../src/domain/offline/indexedDb.ts'), ...require('../src/domain/offline/outbox.ts') };
}
let api = reloadStorage();
const { useTrainStore } = require('../src/store/useTrainStore.ts');
const consent = value => {
    local.setItem('traintracks_crowd_presence_consent', value);
    useTrainStore.getState().setCrowdConsent(value);
};
consent('granted');
const options = () => ({ getOwnerId: async () => owner });
const body = (id) => ({ client_trip_id: id, started_at: '2026-10-08T10:00:00Z', completed_at: '2026-10-08T10:10:00Z', fare: 0 });
const queue = (id, account = 'account-A') => api.enqueueOutbox('trip_history', '/api/trips', body(id), id, 'POST', account);
const response = (status, headers = {}) => new Response(JSON.stringify({ error: `fixture-${status}` }), { status, headers });
const clear = async () => {
    for (const item of await api.readAllOutboxValues()) await api.deleteOutboxValue(item.id);
    storage.clear();
};

await queue('auth-paused');
let sends = 0;
const rejected = await api.flushOutbox(async () => { sends += 1; return response(401); }, options());
assert.equal(rejected.remaining, 1);
assert.equal(rejected.paused, 1);
await api.flushOutbox(async () => { sends += 1; return response(200); }, options());
assert.equal(sends, 1, '401 cannot poll/replay until a later same-owner auth event');
owner = 'account-B';
await api.flushOutbox(async () => { sends += 1; return response(200); }, {
    ...options(), reauthenticatedOwnerId: owner, reauthenticatedAt: Date.now() + 1,
});
assert.equal(sends, 1, 'another account cannot resume the paused item');
owner = 'account-A';
const resumed = await api.flushOutbox(async (_url, init) => {
    const payload = JSON.parse(init.body);
    assert.equal(payload.user_id, 'account-A');
    assert.equal(init.headers['X-Trip-Owner-Id'], 'account-A');
    assert.equal(payload.completed_at, body('auth-paused').completed_at);
    return response(200);
}, { ...options(), reauthenticatedOwnerId: owner, reauthenticatedAt: Date.now() + 1 });
assert.equal(resumed.sent, 1);
console.log('Offline: auth and owner replay checks passed');

for (const status of [403, 400, 422]) {
    await clear();
    await queue(`reject-${status}`);
    const result = await api.flushOutbox(async () => response(status), options());
    assert.equal(result.quarantined, 1);
    const [item] = await api.readAllOutboxValues();
    assert.equal(item.diagnostic.status, status);
    assert.ok(item.diagnostic.response.includes(`fixture-${status}`));
    let retried = false;
    await api.flushOutbox(async () => { retried = true; return response(200); }, options());
    assert.equal(retried, false);
}
for (const status of [408, 425, 429, 500, 503]) {
    await clear();
    await queue(`retry-${status}`);
    const before = Date.now();
    await api.flushOutbox(async () => response(status, { 'Retry-After': '120' }), options());
    const [item] = await api.readAllOutboxValues();
    assert.equal(item.state, 'pending');
    assert.equal(item.attempts, 1);
    assert.ok(item.nextAttemptAt >= before + 120000);
}
assert.equal(api.retryAfterMs('Thu, 08 Oct 2026 10:02:00 GMT', Date.parse('2026-10-08T10:00:00Z')), 120000);
await clear();
const first = await queue('network');
await api.flushOutbox(async () => { throw new Error('offline'); }, options());
const duplicate = await api.enqueueOutbox('trip_history', '/api/trips', { ...body('network'), fare: 123 }, 'network', 'POST', 'account-A');
assert.equal(duplicate.body.fare, 0, 'duplicate saves do not reprice immutable completion');
assert.equal(duplicate.attempts, 1);
assert.equal(duplicate.createdAt, first.createdAt);

await clear();
const mismatched = await queue('mismatch');
owner = 'account-B';
await api.flushOutbox(async () => { throw new Error('must not upload A under B'); }, options());
assert.equal((await api.readAllOutboxValues())[0].attempts, 0);
owner = 'account-A';
await api.putOutboxValue({ ...mismatched, createdAt: Date.now() - 90 * 86400000, expiresAt: 0 });
const durable = await api.flushOutbox(async () => response(503), options());
assert.equal(durable.remaining, 1, 'completed history has no TTL even if a stale record has expiresAt=0');

await clear();
for (let index = 0; index < 130; index += 1) await queue(`durable-${index}`);
api = reloadStorage();
assert.equal((await api.readAllOutboxValues()).length, 130, 'fallback survives reload without 100-item eviction');
console.log('Offline: durable fallback, rejection and retry checks passed');
await clear();
consent('granted');
for (const [kind, endpoint] of [['crowd_presence', '/api/crowd/presence'], ['stall_report', '/api/stall-report'], ['incident_vote', '/api/incidents/resolve']]) {
    const item = await api.enqueueOutbox(kind, endpoint, {}, `expired-${kind}`);
    await api.putOutboxValue({ ...item, expiresAt: Date.now() - 1 });
}
const expired = await api.flushOutbox(async () => { throw new Error('expired signals must not upload'); }, options());
assert.equal(expired.remaining, 0);

const legacy = { id: 'trip_history:old', kind: 'trip_history', endpoint: '/api/trips', method: 'POST',
    body: body('old'), createdAt: Date.now() - 2 * 86400000, expiresAt: 0, attempts: 0, nextAttemptAt: 0 };
local.setItem('traintracks-runtime:outbox', JSON.stringify([legacy]));
await api.flushOutbox(async () => { throw new Error('legacy history is unowned'); }, options());
const [quarantinedLegacy] = await api.readAllOutboxValues();
assert.equal(quarantinedLegacy.state, 'quarantined');
assert.equal(quarantinedLegacy.diagnostic.reason, 'unowned_legacy_history');
assert.deepEqual(quarantinedLegacy.body, legacy.body);
assert.equal(quarantinedLegacy.expiresAt, null);
assert.equal(JSON.parse(local.getItem('traintracks-runtime:outbox')).length, 0, 'v1 cannot replay migrated v2 records');
await clear();
local.setItem('traintracks-runtime:outbox', '{corrupt');
await assert.rejects(api.flushOutbox(async () => response(200), options()));
assert.equal(local.getItem('traintracks-runtime:outbox'), '{corrupt');
await clear();
failWrites = true;
await assert.rejects(queue('quota'), /Quota exceeded/);
await assert.rejects(api.writeRuntimeValue('checkpoint', { tripId: 'quota' }), /Quota exceeded/);
failWrites = false;
await clear();
local.setItem('traintracks-runtime:outbox', JSON.stringify([legacy]));
failWrites = true;
await assert.rejects(api.flushOutbox(async () => response(200), options()), /Quota exceeded/);
assert.equal(JSON.parse(local.getItem('traintracks-runtime:outbox')).length, 1, 'failed migration retains source');
failWrites = false;
await clear();
const crowd = (id) => api.enqueueOutbox('crowd_presence', '/api/crowd/presence', { sampleId: id, lat: 14.603, lng: 120.983 }, id);
const waitFor = async (ready) => {
    const deadline = Date.now() + 3000;
    while (!ready() && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 5));
    assert.ok(ready(), 'Async consent regression did not reach its pending operation.');
};
consent('granted');
await crowd('withdraw-before-flush');
const retainedOwnerHistory = await queue('consent-owner-history');
consent('denied');
owner = 'account-B';
let gpsSends = 0;
await api.flushOutbox(async () => { gpsSends += 1; return response(200); }, options());
assert.equal(gpsSends, 0, 'revoked queued observations must not upload GPS');
assert.deepEqual(await api.readAllOutboxValues(), [retainedOwnerHistory], 'crowd cancellation must not change completed owner history');
await api.cancelQueuedCrowdPresence();
assert.deepEqual(await api.readAllOutboxValues(), [retainedOwnerHistory]);
owner = 'account-A';
await clear();

consent('granted');
const pendingEnqueue = crowd('withdraw-during-enqueue');
consent('denied');
await assert.rejects(pendingEnqueue, /cancelled after consent withdrawal/);
assert.equal((await api.readAllOutboxValues()).length, 0);
await assert.rejects(crowd('enqueue-denied'), /requires current consent/);

consent('granted');
const waitingHistory = await queue('history-awaiting-auth');
await api.putOutboxValue({ ...waitingHistory, createdAt: Date.now() - 1000 });
await crowd('withdraw-while-history-waits');
let resolveOwner;
const endpoints = [];
const waitingFlush = api.flushOutbox(async (endpoint) => { endpoints.push(endpoint); return response(503); }, {
    getOwnerId: () => new Promise(resolve => { resolveOwner = resolve; }),
});
await waitFor(() => Boolean(resolveOwner));
consent('denied');
const cancellation = api.cancelQueuedCrowdPresence();
assert.equal(api.flushOutbox(async () => { throw new Error('serialized flush must not restart'); }), waitingFlush);
consent('granted');
resolveOwner('account-A');
await waitingFlush;
await cancellation;
assert.deepEqual(endpoints, ['/api/trips'], 'a later regrant must not resurrect the revoked flush snapshot');
const [waitingHistoryAfter] = await api.readAllOutboxValues();
assert.equal(waitingHistoryAfter.id, waitingHistory.id);
assert.deepEqual(waitingHistoryAfter.body, waitingHistory.body);
await clear();

consent('granted');
await crowd('abort-crowd-first');
await crowd('abort-crowd-next');
await queue('abort-preserve-history', 'account-B');
let activeCrowdSignal;
const startedCrowdRequests = [];
const activeFlush = api.flushOutbox(async (endpoint, init) => {
    startedCrowdRequests.push(endpoint);
    activeCrowdSignal = init.signal;
    return new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(new DOMException('Cancelled', 'AbortError')), { once: true }));
}, options());
await waitFor(() => Boolean(activeCrowdSignal));
consent('denied');
const activeCancellation = api.cancelQueuedCrowdPresence();
await activeFlush;
await activeCancellation;
assert.equal(activeCrowdSignal.aborted, true);
assert.deepEqual(startedCrowdRequests, ['/api/crowd/presence'], 'withdrawal aborts the active request and prevents subsequent GPS uploads');
assert.equal((await api.readAllOutboxValues())[0].idempotencyKey, 'abort-preserve-history');
await clear();

consent('granted');
await crowd('cross-tab-withdrawal');
local.setItem('traintracks_crowd_presence_consent', 'denied');
await api.flushOutbox(async () => { throw new Error('persisted cross-tab denial must block GPS'); }, options());
assert.equal((await api.readAllOutboxValues()).length, 0);
await clear();

consent('granted');
await crowd('cancellation-storage-failure');
const storageFailureHistory = await queue('storage-failure-history');
consent('denied');
failDeletes = true;
await assert.rejects(api.cancelQueuedCrowdPresence(), /Offline deletion denied/);
await assert.rejects(api.flushOutbox(async () => { throw new Error('failed cleanup must not permit GPS'); }, options()), /Offline deletion denied/);
assert.deepEqual((await api.readAllOutboxValues()).find(item => item.kind === 'trip_history'), storageFailureHistory);
failDeletes = false;
await api.cancelQueuedCrowdPresence();
assert.deepEqual(await api.readAllOutboxValues(), [storageFailureHistory]);
await clear();
consent('granted');
for (const storedConsent of ['unknown', 'invalid', '']) {
    consent('granted');
    await crowd(`stored-consent-${storedConsent || 'empty'}`);
    const kept = await queue(`stored-consent-history-${storedConsent || 'empty'}`, 'account-B');
    local.setItem('traintracks_crowd_presence_consent', storedConsent);
    await api.flushOutbox(async () => { throw new Error('unknown/invalid stored consent must block GPS'); }, options());
    assert.deepEqual(await api.readAllOutboxValues(), [kept]);
    await clear();
}
consent('granted');
await crowd('blocked-consent-getter');
const consentReadHistory = await queue('blocked-consent-history');
failConsentReads = true;
const consentReadEndpoints = [];
await api.flushOutbox(async endpoint => { consentReadEndpoints.push(endpoint); return response(503); }, options());
assert.deepEqual(consentReadEndpoints, ['/api/trips'], 'blocked consent storage must not interrupt unrelated history upload');
const [consentReadHistoryAfter] = await api.readAllOutboxValues();
assert.equal(consentReadHistoryAfter.id, consentReadHistory.id);
assert.deepEqual(consentReadHistoryAfter.body, consentReadHistory.body);
assert.equal(consentReadHistoryAfter.attempts, 1);
failConsentReads = false;
await clear();
console.log('Offline: consent withdrawal, serialized flush/enqueue races, active abort, history preservation and cancellation storage failures passed');
consent('granted');
await crowd('missing-consent-key');
const missingConsentHistory = await queue('missing-consent-history', 'account-B');
local.removeItem('traintracks_crowd_presence_consent');
await api.flushOutbox(async () => { throw new Error('missing saved grant must not replay GPS'); }, options());
await assert.rejects(crowd('new-after-consent-key-removal'), /requires current consent/);
assert.deepEqual(await api.readAllOutboxValues(), [missingConsentHistory]);
await clear();

globalThis.navigator.locks = undefined;
await queue('no-atomic-lock');
assert.equal((await api.flushOutbox(async () => { throw new Error('unsafe concurrent flush'); }, options())).locked, true);
await clear();

globalThis.indexedDB = new IDBFactory();
console.log('Offline: legacy migration and quota checks passed');
api = reloadStorage();
await api.writeRuntimeValue('checkpoint', { tripId: 'committed' });
assert.deepEqual(await api.readRuntimeValue('checkpoint'), { tripId: 'committed' });
const database = await api.openRuntimeDatabase();
const originalTransaction = database.transaction.bind(database);
database.transaction = function (...args) {
    const transaction = originalTransaction(...args);
    if (args[1] === 'readwrite') {
        const originalStore = transaction.objectStore.bind(transaction);
        transaction.objectStore = function (name) {
            const store = originalStore(name);
            const originalPut = store.put.bind(store);
            store.put = function (...values) {
                const request = originalPut(...values);
                request.addEventListener('success', () => transaction.abort());
                return request;
            };
            return store;
        };
    }
    return transaction;
};
failWrites = true;
await assert.rejects(api.writeRuntimeValue('checkpoint', { tripId: 'aborted' }), /Quota exceeded/);
failWrites = false;
assert.deepEqual(await api.readRuntimeValue('checkpoint'), { tripId: 'committed' }, 'request success followed by abort is not acknowledged');
database.transaction = originalTransaction;
await new Promise((resolve, reject) => {
    const transaction = database.transaction('outbox', 'readwrite');
    transaction.objectStore('outbox').put({ ...legacy, body: { ...legacy.body, fare: 1 } });
    transaction.oncomplete = resolve;
    transaction.onabort = () => reject(transaction.error);
});
local.setItem('traintracks-runtime:outbox', JSON.stringify([{ ...legacy, body: { ...legacy.body, fare: 2 } }]));
await api.flushOutbox(async () => { throw new Error('conflicting unowned legacy history cannot upload'); }, options());
const variants = await api.readAllOutboxValues();
assert.equal(variants.length, 2, 'conflicting IDB/fallback versions both survive migration');
assert.deepEqual(variants.map((item) => item.legacyRecord.body.fare).sort(), [1, 2]);
await clear();
const concurrent = await Promise.all([
    queue('atomic'), api.enqueueOutbox('trip_history', '/api/trips', { ...body('atomic'), fare: 500 }, 'atomic', 'POST', 'account-A'),
]);
assert.equal(concurrent[0].body.fare, concurrent[1].body.fare);
const otherTab = reloadStorage();
let releaseFetch;
const held = api.flushOutbox(async () => new Promise((resolve) => { releaseFetch = () => resolve(response(200)); }), options());
const deadline = Date.now() + 3000;
while (!releaseFetch && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 5));
if (!releaseFetch) { await held; assert.fail('First flush did not reach the network.'); }
const otherResult = await otherTab.flushOutbox(async () => { throw new Error('second tab must not send'); }, options());
assert.equal(otherResult.locked, true, 'atomic IDB lease prevents a second tab from flushing');
releaseFetch();
await held;
api = otherTab;
await clear();
console.log('Offline: transaction commit and cross-tab lease checks passed');

const originalLoad = Module._load;
const hookStates = [];
const effects = [];
const fakeReact = { useCallback: (fn) => fn, useRef: (value) => ({ current: value }),
    useState: (value) => { const index = hookStates.push(value) - 1; return [value, (next) => {
        hookStates[index] = typeof next === 'function' ? next(hookStates[index]) : next;
    }]; }, useEffect: (fn) => effects.push(fn) };
const tripState = { tripOwnerId: 'account-A', journeySnapshot: { tripId: 'stable-trip',
    startedAt: Date.parse(body('stable-trip').started_at), completedAt: Date.parse(body('stable-trip').completed_at) } };
Module._load = function (request, parent, isMain) {
    if (/use(?:TripHistory|OfflineRuntime)\.ts$/.test(parent?.filename ?? '')) {
        if (request === 'react') return fakeReact;
        if (request === './useAuth') return { useAuth: () => ({ user: { id: owner }, loading: false }) };
        if (request === '@/lib/supabase/client') return { createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: owner } } }) } }) };
        if (request === '@/store/useTripStore') return { useTripStore: { getState: () => tripState } };
    }
    return originalLoad.call(this, request, parent, isMain);
};
const history = require('../src/hooks/useTripHistory.ts');
const runtime = require('../src/hooks/useOfflineRuntime.ts');
consent('granted');
assert.equal(runtime.reconcileCrowdConsentStorage({ key: 'traintracks_crowd_presence_consent', newValue: null }), true);
assert.equal(useTrainStore.getState().crowdConsent, 'unknown', 'cross-tab key removal revokes the live in-memory grant too');
await assert.rejects(crowd('new-after-storage-event'), /requires current consent/);
consent('granted');
assert.equal(runtime.reconcileCrowdConsentStorage({ key: null, newValue: null }), true);
assert.equal(useTrainStore.getState().crowdConsent, 'unknown', 'cross-tab storage clear revokes the live grant');
assert.equal(runtime.reconcileCrowdConsentStorage({ key: 'unrelated-setting', newValue: null }), false);
console.log('Offline: missing saved consent and cross-tab key removal/clear cannot resume GPS uploads.');
const requests = [];
globalThis.fetch = async (url, init) => { requests.push([url, init]); return response(500); };
await assert.rejects(history.loadTripHistoryPage(3), /500/);
globalThis.fetch = async (url, init) => {
    requests.push([url, init]);
    assert.ok(url.includes('includeTotals=true'));
    return new Response(JSON.stringify({ trips: [{ id: 'read', fare: 0, direction: 'northbound' }],
        totals: { totalTrips: 1000, totalFare: 5000, totalDistance: 10000 }, pagination: { hasMore: true, nextOffset: 100 } }));
};
const page = await history.loadTripHistoryPage(100);
assert.equal(page.trips[0].fare, 0, 'read never reprices the recorded zero fare');
assert.equal(page.trips[0].direction, 'NORTHBOUND');
assert.equal(page.totals.totalTrips, 1000);
assert.equal(page.pagination.nextOffset, 100);
assert.ok(requests.every(([, init]) => !init.method), 'reading history never PATCHes');
console.log('Offline: read-only history and pagination checks passed');
globalThis.navigator.onLine = false;
const mounted = history.useTripHistory();
const oldUiWrite = { ...body('unstable-old-id') };
delete oldUiWrite.completed_at;
await mounted.saveTrip({ ...oldUiWrite, ownerId: 'account-A' });
const [saved] = await api.readAllOutboxValues();
assert.equal(saved.idempotencyKey, 'stable-trip');
assert.equal(saved.ownerId, 'account-A');
assert.equal(Date.parse(saved.body.completed_at), Date.parse(body('stable-trip').completed_at));
assert.equal(Date.parse(saved.body.started_at), Date.parse(body('stable-trip').started_at));
await clear();
await mounted.saveTrip({ ...body('earlier-trip'), ownerId: 'account-A' });
const [earlierTrip] = await api.readAllOutboxValues();
assert.equal(earlierTrip.idempotencyKey, 'earlier-trip', 'a save for a previous trip is not replaced by the active snapshot');
assert.equal(earlierTrip.body.completed_at, body('earlier-trip').completed_at);
await clear();
await mounted.fetchAllTrips();
assert.equal(hookStates[2].totalTrips, 1000);
globalThis.fetch = async () => response(500);
await mounted.fetchAllTrips();
assert.ok(hookStates[4].includes('500'), 'errors are exposed separately from empty history');
assert.equal(hookStates[1].length, 1, 'a read error does not erase previously loaded records');

const cacheContents = new Map([
    ['start-url', ['/login']], ['traintracks-pages-v2', ['/profile/setup']], ['pages-rsc', ['/admin']],
    ['traintracks-map-tiles-v4', ['/api/map-tiles/dark/1/1/1']], ['traintracks-static-v2', ['/_next/static/app.js']],
    ['workbox-precache-test', ['/login?__WB_REVISION__=x', '/profile/setup', '/admin', '/api/trips', '/logo.svg', '/_next/static/app.js']],
]);
globalThis.caches = {
    keys: async () => [...cacheContents.keys()], delete: async (name) => cacheContents.delete(name),
    open: async (name) => ({ keys: async () => cacheContents.get(name).map((url) => ({ url: `https://traintracks.test${url}` })),
        delete: async (request) => { cacheContents.set(name, cacheContents.get(name).filter((url) => `https://traintracks.test${url}` !== request.url)); } }),
};
await runtime.clearPrivatePwaCaches();
assert.equal(cacheContents.has('start-url'), false);
assert.equal(cacheContents.has('traintracks-pages-v2'), false);
assert.equal(cacheContents.has('pages-rsc'), false);
assert.ok(cacheContents.has('traintracks-map-tiles-v4'));
assert.deepEqual(cacheContents.get('workbox-precache-test'), ['/logo.svg', '/_next/static/app.js']);
const activationMessages = [];
const registration = { waiting: { postMessage: (message) => activationMessages.push(message) } };
globalThis.navigator.locks = locks;
assert.equal(await runtime.activatePwaUpdate(registration, () => false), false, 'active trip/receipt prevents activation');
locked = true;
assert.equal(await runtime.activatePwaUpdate(registration, () => true), false, 'another active tab prevents activation');
locked = false;
assert.equal(await runtime.activatePwaUpdate(registration, () => true), true, 'idle acknowledged trip can activate');
assert.deepEqual(activationMessages, [{ type: 'SKIP_WAITING' }]);

Object.assign(tripState, { persistenceHydrated: true, status: 'IDLE', origin: null,
    pendingTripRecovery: null, pendingCompletedTrip: null });
const pwaRefs = [];
const originalUseRef = fakeReact.useRef;
fakeReact.useRef = value => { const ref = { current: value }; pwaRefs.push(ref); return ref; };
function PwaFixture() { return runtime.usePwaUpdateRuntime({ canActivate: true }); }
const pwaRuntime = PwaFixture();
pwaRefs[1].current = registration;
tripState.status = 'TRANSIT';
assert.equal(await pwaRuntime.activateUpdate(), false, 'fresh store blocks activation before React passive effects update a stale safe ref');
assert.equal(activationMessages.length, 1);
tripState.status = 'IDLE';
let releaseCacheRead;
const originalCacheKeys = caches.keys;
caches.keys = () => new Promise(resolve => { releaseCacheRead = () => resolve([]); });
const pendingActivation = pwaRuntime.activateUpdate();
while (!releaseCacheRead) await new Promise(resolve => setImmediate(resolve));
tripState.status = 'TRANSIT';
releaseCacheRead();
assert.equal(await pendingActivation, false, 'a trip beginning during awaited cache cleanup prevents SKIP_WAITING');
assert.equal(activationMessages.length, 1);
caches.keys = originalCacheKeys;
fakeReact.useRef = originalUseRef;
console.log('Offline: PWA activation rechecks fresh trip state before and after async cleanup.');

let pwa;
const config = fs.readFileSync(path.join(cwd, 'next.config.mjs'), 'utf8')
    .replace('import withPWAInit from "@ducanh2912/next-pwa";', '')
    .replace('export default withPWA(nextConfig);', 'withPWA(nextConfig);');
vm.runInNewContext(config, { withPWAInit: (options) => { pwa = options; return (next) => next; },
    process: { env: { NODE_ENV: 'production' } }, URL, self: { location: { origin: 'https://traintracks.test' } }, Response });
assert.equal(pwa.reloadOnOnline, false);
assert.equal(pwa.dynamicStartUrl, false);
assert.equal(pwa.workboxOptions.skipWaiting, false);
assert.equal(pwa.workboxOptions.clientsClaim, false);
const navigation = pwa.workboxOptions.runtimeCaching.find((rule) => rule.handler === 'NetworkFirst');
for (const route of ['/', '/explorer', '/docs']) assert.equal(navigation.urlPattern({ request: { mode: 'navigate' }, url: new URL(route, 'https://traintracks.test') }), true);
for (const route of ['/login', '/auth/verified', '/profile/setup', '/admin', '/api/trips', '/api-console', '/?token=secret']) {
    assert.equal(navigation.urlPattern({ request: { mode: 'navigate' }, url: new URL(route, 'https://traintracks.test') }), false);
}
assert.equal(await navigation.options.plugins[0].cacheWillUpdate({ request: { url: 'https://traintracks.test/' }, response: new Response('private', { headers: { 'Cache-Control': 'private, no-store' } }) }), null);
const transformed = await pwa.workboxOptions.manifestTransforms[0]([
    { url: '/admin', revision: 'x' }, { url: '/auth/verified', revision: 'x' }, { url: '/profile/setup', revision: 'x' },
    { url: '/api/trips', revision: 'x' }, { url: '/login.html', revision: 'x' }, { url: '/_next/static/app.js', revision: 'x' },
]);
assert.deepEqual(Array.from(transformed.manifest, (entry) => entry.url), ['/_next/static/app.js']);
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'traintracks-offline-'));
console.log('Offline: cache policy checks passed; generating the worker');
try {
    const generated = await generateSW({ ...pwa.workboxOptions, globDirectory: temp, globPatterns: [],
        swDest: path.join(temp, 'sw.js'), additionalManifestEntries: [{ url: '/_next/static/app.js', revision: 'test' }], mode: 'production' });
    assert.ok(generated.count > 0);
    const worker = fs.readFileSync(path.join(temp, 'sw.js'), 'utf8');
    assert.ok(worker.includes('SKIP_WAITING'));
    assert.ok(worker.includes('traintracks-public-pages-v3'));
    assert.equal(worker.includes('clientsClaim'), false);
} finally {
    // Only remove the exact directory created by this test, never workspace output.
    fs.rmSync(temp, { recursive: true, force: true });
}
console.log('Offline regressions passed: ownership, auth pause, quarantine, retries, durable history, migration, quota/commit, cross-tab locks, read purity, totals, private caches and generated PWA.');
