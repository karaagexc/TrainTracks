import './journey-smoke.mjs';
import assert from 'node:assert/strict';
import Module from 'node:module';

const require = Module.createRequire(import.meta.url);
const { STATIONS } = require('../src/data/stations.ts');
const destination = STATIONS.find(station => station.id === 'L1-24');
const state = { notificationPreference: 'all', isMuted: false, destination,
    journeySnapshot: { tripId: 'notification-fixture', activeEdgeIndex: 1 } };
const originalLoad = Module._load;
const originalError = console.error;
const descriptors = Object.fromEntries(['window', 'navigator', 'Notification', 'sessionStorage'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
const cells = [];
let cursor = 0;
let effects = [];
const same = (left, right) => left && right && left.length === right.length && left.every((value, index) => Object.is(value, right[index]));
const react = {
    useRef(value) { const index = cursor++; return cells[index] ??= { current: value }; },
    useState(value) { const index = cursor++; cells[index] ??= { value }; return [cells[index].value, next => { cells[index].value = next; }]; },
    useCallback(callback, deps) { const index = cursor++; if (!same(cells[index]?.deps, deps)) cells[index] = { value: callback, deps }; return cells[index].value; },
    useEffect(effect, deps) { const index = cursor++; if (!same(cells[index]?.deps, deps)) { effects.push(() => { cells[index]?.cleanup?.(); cells[index] = { deps, cleanup: effect() }; }); } },
};
Module._load = function(request, parent, isMain) {
    if (/useTripNotifications\.ts$/.test(parent?.filename ?? '')) {
        if (request === 'react') return react;
        if (request === '@/store/useTripStore') return { useTripStore: selector => selector(state) };
    }
    return originalLoad.call(this, request, parent, isMain);
};
const notifications = require('../src/hooks/useTripNotifications.ts');
const stored = new Map();
const failures = [];
let vibrates = 0;
let constructorCalls = 0;
let showCalls = 0;
let releaseReady;
let acknowledge;
const ready = new Promise(resolve => { releaseReady = resolve; });
class MobileNotification {
    static permission = 'granted';
    static async requestPermission() { return MobileNotification.permission; }
    constructor() { constructorCalls++; throw new TypeError('Use ServiceWorkerRegistration.showNotification on mobile.'); }
}
const registration = { showNotification: async (_title, options) => {
    showCalls++;
    assert.match(options.tag, /^notification-fixture:/);
    await new Promise(resolve => { acknowledge = resolve; });
} };
const settle = async () => { for (let i = 0; i < 5; i++) await new Promise(resolve => setImmediate(resolve)); };
let result;
function NotificationFixture() { result = notifications.useTripNotifications('ARRIVED', { ...destination }, { statusCode: 'ARRIVED' }); return null; }
function render() { cursor = 0; effects = []; NotificationFixture(); effects.forEach(effect => effect()); }

try {
    console.error = (...args) => { failures.push(args); };
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { Notification: MobileNotification } });
    Object.defineProperty(globalThis, 'Notification', { configurable: true, value: MobileNotification });
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { serviceWorker: { ready }, vibrate: () => { vibrates++; } } });
    Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: { getItem: key => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, value) } });
    render();
    await settle();
    assert.equal(constructorCalls, 1);
    assert.equal(stored.size, 0, 'failed mobile constructor must not commit notification deduplication');
    render();
    await settle();
    assert.equal(vibrates, 1, 'registration/permission rerenders cannot repeatedly vibrate the same event');
    releaseReady(registration);
    await settle();
    render();
    await settle();
    assert.equal(showCalls, 1, 'worker readiness retries the unacknowledged arrival');
    assert.equal(stored.size, 0, 'pending showNotification is not a successful acknowledgement');
    render();
    await settle();
    assert.equal(showCalls, 1, 'concurrent rerenders cannot duplicate a pending notification');
    acknowledge();
    await settle();
    assert.equal(stored.size, 1);
    render();
    await settle();
    assert.equal(showCalls, 1, 'acknowledged ARRIVED notification is deduplicated');
    assert.equal(vibrates, 1);
    MobileNotification.permission = 'denied';
    assert.equal(await notifications.deliverTripNotification(registration, 'Denied', 'Fixture', 'fixture'), false);
    MobileNotification.permission = 'granted';
    assert.equal(await notifications.deliverTripNotification({ showNotification: async () => { throw new Error('Fixture worker rejection'); } }, 'Failed', 'Fixture', 'fixture'), false);
    state.isMuted = true;
    state.journeySnapshot.tripId = 'muted-fixture';
    render();
    await settle();
    assert.equal(vibrates, 1);
    assert.equal(showCalls, 1);
    assert.ok(result.permission);
    assert.ok(failures.length >= 2, 'delivery errors are reported, not disguised as success');
    console.log('Notification repair passed: mobile constructor failure, worker-ready retry, pending/ACK deduplication, single haptics, denial, worker rejection and mute gating.');
} finally {
    cells.forEach(cell => cell.cleanup?.());
    Module._load = originalLoad;
    console.error = originalError;
    for (const [key, descriptor] of Object.entries(descriptors)) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else delete globalThis[key];
    }
}
