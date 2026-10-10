const DATABASE_NAME = 'traintracks-runtime';
const KV_STORE = 'key-value';
const OUTBOX_STORE = 'outbox';
const LOCAL_STORAGE_PREFIX = 'traintracks-runtime:';
// A separate database prevents a rolled-back v1 worker from uploading v2 records.
const OUTBOX_DATABASE_NAME = 'traintracks-outbox-v2';
const LOCAL_OUTBOX_PREFIX = 'traintracks-outbox-v2:item:';
const knownLocalKeys = new Set<string>();

let databasePromise: Promise<IDBDatabase | null> | null = null;
let outboxDatabasePromise: Promise<IDBDatabase | null> | null = null;
let warnedAboutIndexedDb = false;

function warnAboutIndexedDb(error: unknown) {
    if (warnedAboutIndexedDb) return;
    warnedAboutIndexedDb = true;
    console.warn('[Offline] IndexedDB unavailable; using localStorage fallback.', error);
}

function openDatabase(name: string, outboxOnly: boolean): Promise<IDBDatabase | null> {
    if (typeof indexedDB === 'undefined') return Promise.resolve(null);
    return new Promise((resolve) => {
        let settled = false;
        try {
            const request = indexedDB.open(name, 1);
            request.onupgradeneeded = () => {
                const database = request.result;
                if (!outboxOnly && !database.objectStoreNames.contains(KV_STORE)) database.createObjectStore(KV_STORE);
                if (!database.objectStoreNames.contains(OUTBOX_STORE)) database.createObjectStore(OUTBOX_STORE, { keyPath: 'id' });
                if (outboxOnly && !database.objectStoreNames.contains('locks')) database.createObjectStore('locks');
            };
            request.onsuccess = () => {
                const database = request.result;
                if (settled) { database.close(); return; }
                settled = true;
                database.onversionchange = () => {
                    database.close();
                    if (outboxOnly) outboxDatabasePromise = null;
                    else databasePromise = null;
                };
                resolve(database);
            };
            const fail = () => {
                if (settled) return;
                settled = true;
                warnAboutIndexedDb(request.error ?? new Error('IndexedDB open blocked.'));
                resolve(null);
            };
            request.onerror = fail;
            request.onblocked = fail;
        } catch (error) { warnAboutIndexedDb(error); resolve(null); }
    });
}

export function openRuntimeDatabase(): Promise<IDBDatabase | null> {
    return databasePromise ??= openDatabase(DATABASE_NAME, false);
}

function openOutboxDatabase(): Promise<IDBDatabase | null> {
    return outboxDatabasePromise ??= openDatabase(OUTBOX_DATABASE_NAME, true);
}

// Request success does not mean the write committed (quota/abort can follow it).
function committedRequest<T>(database: IDBDatabase, store: string, mode: IDBTransactionMode,
    operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
        const transaction = database.transaction(store, mode);
        let request: IDBRequest<T>;
        transaction.oncomplete = () => resolve(request.result);
        transaction.onabort = () => reject(transaction.error ?? new Error('Offline transaction aborted.'));
        transaction.onerror = () => reject(transaction.error ?? new Error('Offline transaction failed.'));
        try { request = operation(transaction.objectStore(store)); }
        catch (error) { transaction.abort(); reject(error); }
    });
}

function localStorageOrThrow(): Storage {
    if (typeof localStorage === 'undefined') throw new Error('Offline storage is unavailable.');
    return localStorage;
}

function readLocal<T>(key: string): T | null {
    if (typeof localStorage === 'undefined') return null;
    const value = localStorage.getItem(key);
    // Corrupt data stays in storage for recovery; it must not become an empty queue.
    return value === null ? null : JSON.parse(value) as T;
}

function writeLocal(key: string, value: unknown) { localStorageOrThrow().setItem(key, JSON.stringify(value)); }
function deleteLocal(key: string) { if (typeof localStorage !== 'undefined') localStorage.removeItem(key); }

export async function readRuntimeValue<T>(key: string): Promise<T | null> {
    const fallback = readLocal<T>(`${LOCAL_STORAGE_PREFIX}${key}`);
    if (fallback !== null) return fallback;
    const database = await openRuntimeDatabase();
    if (!database) return null;
    return (await committedRequest(database, KV_STORE, 'readonly', (store) => store.get(key))) ?? null;
}

export async function writeRuntimeValue<T>(key: string, value: T): Promise<void> {
    const database = await openRuntimeDatabase();
    if (database) {
        try {
            await committedRequest(database, KV_STORE, 'readwrite', (store) => store.put(value, key));
            deleteLocal(`${LOCAL_STORAGE_PREFIX}${key}`);
            return;
        } catch (error) { warnAboutIndexedDb(error); }
    }
    writeLocal(`${LOCAL_STORAGE_PREFIX}${key}`, value);
}

export async function deleteRuntimeValue(key: string): Promise<void> {
    const database = await openRuntimeDatabase();
    if (database) await committedRequest(database, KV_STORE, 'readwrite', (store) => store.delete(key));
    deleteLocal(`${LOCAL_STORAGE_PREFIX}${key}`);
}

function localOutboxKey(id: string) { return `${LOCAL_OUTBOX_PREFIX}${encodeURIComponent(id)}`; }

function readLocalOutbox<T extends { id: string }>(): T[] {
    if (typeof localStorage === 'undefined') return [];
    const keys = new Set(knownLocalKeys);
    for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index);
        if (key?.startsWith(LOCAL_OUTBOX_PREFIX)) keys.add(key);
    }
    return [...keys].flatMap((key) => {
        const item = readLocal<T>(key);
        if (item === null) return [];
        if (typeof item !== 'object' || typeof item.id !== 'string') throw new Error('Invalid offline record; retained for recovery.');
        return [item];
    });
}

export async function putOutboxValue<T extends { id: string }>(value: T): Promise<void> {
    const database = await openOutboxDatabase();
    if (database) {
        try {
            await committedRequest(database, OUTBOX_STORE, 'readwrite', (store) => store.put(value));
            deleteLocal(localOutboxKey(value.id));
            knownLocalKeys.delete(localOutboxKey(value.id));
            return;
        } catch (error) { warnAboutIndexedDb(error); }
    }
    const key = localOutboxKey(value.id);
    writeLocal(key, value);
    knownLocalKeys.add(key);
}

export async function insertOutboxValue<T extends { id: string }>(value: T): Promise<T> {
    const key = localOutboxKey(value.id);
    const fallback = readLocal<T>(key);
    if (fallback) return fallback;
    const database = await openOutboxDatabase();
    if (database) {
        try {
            return await new Promise<T>((resolve, reject) => {
                const transaction = database.transaction(OUTBOX_STORE, 'readwrite');
                const store = transaction.objectStore(OUTBOX_STORE);
                let result = value;
                const request = store.get(value.id);
                request.onsuccess = () => {
                    if (request.result !== undefined) result = request.result as T;
                    else store.add(value);
                };
                transaction.oncomplete = () => resolve(result);
                transaction.onabort = () => reject(transaction.error ?? new Error('Offline insert aborted.'));
                transaction.onerror = () => reject(transaction.error ?? new Error('Offline insert failed.'));
            });
        } catch (error) { warnAboutIndexedDb(error); }
    }
    const existing = readLocal<T>(key);
    if (existing) return existing;
    writeLocal(key, value);
    knownLocalKeys.add(key);
    return value;
}

export async function readAllOutboxValues<T extends { id: string }>(): Promise<T[]> {
    const merged = new Map<string, T>();
    const database = await openOutboxDatabase();
    if (database) {
        const values = await committedRequest(database, OUTBOX_STORE, 'readonly', (store) => store.getAll()) as T[];
        values.forEach((value) => merged.set(value.id, value));
    }
    // A failed IDB write may leave a newer fallback alongside an older IDB record.
    readLocalOutbox<T>().forEach((value) => merged.set(value.id, value));
    return [...merged.values()];
}

export async function deleteOutboxValue(id: string): Promise<void> {
    const database = await openOutboxDatabase();
    if (database) await committedRequest(database, OUTBOX_STORE, 'readwrite', (store) => store.delete(id));
    deleteLocal(localOutboxKey(id));
    knownLocalKeys.delete(localOutboxKey(id));
}

async function deleteLegacyIfUnchanged(database: IDBDatabase, raw: Record<string, unknown>): Promise<void> {
    await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(OUTBOX_STORE, 'readwrite');
        const store = transaction.objectStore(OUTBOX_STORE);
        const request = store.get(raw.id as string);
        request.onsuccess = () => {
            if (JSON.stringify(request.result) === JSON.stringify(raw)) store.delete(raw.id as string);
        };
        transaction.oncomplete = () => resolve();
        transaction.onabort = () => reject(transaction.error ?? new Error('Legacy migration aborted.'));
        transaction.onerror = () => reject(transaction.error ?? new Error('Legacy migration failed.'));
    });
}

export async function migrateLegacyOutbox<T extends { id: string }>(convert: (value: Record<string, unknown>) => T | Promise<T>): Promise<void> {
    const database = await openRuntimeDatabase();
    const idbValues = database
        ? await committedRequest(database, OUTBOX_STORE, 'readonly', (store) => store.getAll()) as Record<string, unknown>[] : [];
    const localKey = `${LOCAL_STORAGE_PREFIX}${OUTBOX_STORE}`;
    const localValues = readLocal<unknown>(localKey) ?? [];
    if (!Array.isArray(localValues)) throw new Error('Invalid legacy outbox; retained for recovery.');
    const existing = new Set((await readAllOutboxValues<T>()).map((value) => value.id));
    for (const raw of [...idbValues, ...localValues]) {
        if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string') throw new Error('Invalid legacy outbox item; retained for recovery.');
        const converted = await convert(raw);
        if (!existing.has(converted.id)) { await putOutboxValue(converted); existing.add(converted.id); }
        // Copy commits first. An interruption leaves a recoverable duplicate, not loss.
        if (database) await deleteLegacyIfUnchanged(database, raw);
        const current = readLocal<Record<string, unknown>[]>(localKey);
        if (current) writeLocal(localKey, current.filter((value) => value.id !== raw.id || JSON.stringify(value) !== JSON.stringify(raw)));
    }
}

const LEASE_MS = 60_000;

async function changeLease(database: IDBDatabase, token: string, action: 'claim' | 'renew' | 'release'): Promise<boolean> {
    return new Promise((resolve, reject) => {
        const transaction = database.transaction('locks', 'readwrite');
        const store = transaction.objectStore('locks');
        let changed = false;
        const request = store.get('flush');
        request.onsuccess = () => {
            const lease = request.result as { token: string; expiresAt: number } | undefined;
            if (action === 'claim' ? !lease || lease.expiresAt <= Date.now() : lease?.token === token) {
                changed = true;
                if (action === 'release') store.delete('flush');
                else store.put({ token, expiresAt: Date.now() + LEASE_MS }, 'flush');
            }
        };
        transaction.oncomplete = () => resolve(changed);
        transaction.onabort = () => reject(transaction.error ?? new Error('Offline lease aborted.'));
        transaction.onerror = () => reject(transaction.error ?? new Error('Offline lease failed.'));
    });
}

export async function withOutboxLock<T>(operation: (leaseValid: () => boolean) => Promise<T>): Promise<T | null> {
    if (typeof navigator !== 'undefined' && navigator.locks) {
        return navigator.locks.request('traintracks-outbox-v2', { ifAvailable: true },
            (lock) => lock ? operation(() => true) : Promise.resolve(null));
    }
    const database = await openOutboxDatabase();
    // localStorage cannot atomically claim a cross-tab lease. Leave data queued.
    if (!database) return null;
    const token = crypto.randomUUID();
    if (!await changeLease(database, token, 'claim')) return null;
    let valid = true;
    let deadline = Date.now() + LEASE_MS;
    const interval = setInterval(() => {
        void changeLease(database, token, 'renew').then((renewed) => {
            valid = renewed;
            if (renewed) deadline = Date.now() + LEASE_MS;
        }).catch(() => { valid = false; });
    }, LEASE_MS / 3);
    try { return await operation(() => valid && Date.now() < deadline); }
    finally { valid = false; clearInterval(interval); await changeLease(database, token, 'release'); }
}
