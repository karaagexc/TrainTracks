import './journey-smoke.mjs';
import assert from 'node:assert/strict';
import Module from 'node:module';

const require = Module.createRequire(import.meta.url);
const React = require('react');
const storage = require('../src/domain/offline/indexedDb.ts');
const { useTripStore } = require('../src/store/useTripStore.ts');
const { TRIP_CHECKPOINT_KEY, LEGACY_TRIP_CHECKPOINT_KEY, TRIP_PREFERENCES_KEY } = require('../src/domain/offline/tripCheckpoint.ts');
const { useTripPersistence } = require('../src/hooks/useTripPersistence.ts');
const initial = useTripStore.getState();
const originalEffect = React.useEffect;
const originalStorage = { read: storage.readRuntimeValue, write: storage.writeRuntimeValue, remove: storage.deleteRuntimeValue };
let cleanup;
const settle = async () => { for (let i = 0; i < 10; i++) await new Promise(resolve => setImmediate(resolve)); };
function PersistenceFixture() {
    useTripPersistence();
    return null;
}

try {
    React.useEffect = effect => { cleanup = effect(); };
    for (const failingKey of [TRIP_CHECKPOINT_KEY, LEGACY_TRIP_CHECKPOINT_KEY, TRIP_PREFERENCES_KEY]) {
        useTripStore.setState(initial, true);
        const preserved = { recovery: 'unreadable data must remain byte-for-byte intact' };
        const values = new Map([[failingKey, preserved]]);
        const mutations = [];
        storage.readRuntimeValue = async key => {
            if (key === failingKey) throw new Error('Fixture read failed');
            return values.get(key) ?? null;
        };
        storage.writeRuntimeValue = async (key, value) => { mutations.push(['write', key]); values.set(key, value); };
        storage.deleteRuntimeValue = async key => { mutations.push(['delete', key]); values.delete(key); };
        globalThis.window = Object.assign(new EventTarget(), { setTimeout, clearTimeout });
        globalThis.document = Object.assign(new EventTarget(), { visibilityState: 'visible' });
        PersistenceFixture();
        await settle();
        assert.equal(useTripStore.getState().persistenceHydrated, true, 'a storage error cannot freeze initialization');
        assert.match(useTripStore.getState().persistenceError, /Fixture read failed/);
        window.dispatchEvent(new Event('pagehide'));
        await settle();
        cleanup();
        await settle();
        assert.equal(values.get(failingKey), preserved, 'pagehide and cleanup preserve data that failed to read');
        assert.ok(!mutations.some(([, key]) => key === failingKey), 'unreadable data cannot be replaced or deleted');
        if (failingKey !== TRIP_PREFERENCES_KEY) {
            assert.ok(!mutations.some(([, key]) => key === TRIP_CHECKPOINT_KEY || key === LEGACY_TRIP_CHECKPOINT_KEY));
        }
    }

    useTripStore.setState(initial, true);
    let releaseReads;
    const pendingReads = new Promise(resolve => { releaseReads = resolve; });
    const mutations = [];
    storage.readRuntimeValue = async () => { await pendingReads; return null; };
    storage.writeRuntimeValue = async key => { mutations.push(['write', key]); };
    storage.deleteRuntimeValue = async key => { mutations.push(['delete', key]); };
    PersistenceFixture();
    window.dispatchEvent(new Event('pagehide'));
    cleanup();
    releaseReads();
    await settle();
    assert.equal(mutations.length, 0, 'pending hydration is never treated as an empty persisted trip');
    console.log('Persistence repair smoke passed: failed reads and pre-hydration lifecycle cannot erase recovery/preferences.');
} finally {
    React.useEffect = originalEffect;
    storage.readRuntimeValue = originalStorage.read;
    storage.writeRuntimeValue = originalStorage.write;
    storage.deleteRuntimeValue = originalStorage.remove;
    useTripStore.setState(initial, true);
    delete globalThis.window;
    delete globalThis.document;
}
