const DATABASE_NAME = 'traintracks-runtime';
const DATABASE_VERSION = 1;
const KV_STORE = 'key-value';
const OUTBOX_STORE = 'outbox';
const LOCAL_STORAGE_PREFIX = 'traintracks-runtime:';
const LOCAL_OUTBOX_KEY = `${LOCAL_STORAGE_PREFIX}${OUTBOX_STORE}`;
const MAX_LOCAL_OUTBOX_ITEMS = 100;

let databasePromise: Promise<IDBDatabase | null> | null = null;
let warnedAboutIndexedDb = false;

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'));
    });
}

function warnAboutIndexedDb(error: unknown) {
    if (warnedAboutIndexedDb) return;
    warnedAboutIndexedDb = true;
    console.warn('[Offline] IndexedDB unavailable; using localStorage fallback.', error);
}

function readLocalValue<T>(key: string): T | null {
    if (typeof localStorage === 'undefined') return null;
    try {
        const value = localStorage.getItem(`${LOCAL_STORAGE_PREFIX}${key}`);
        return value === null ? null : JSON.parse(value) as T;
    } catch {
        return null;
    }
}

function writeLocalValue<T>(key: string, value: T): boolean {
    if (typeof localStorage === 'undefined') return false;
    try {
        localStorage.setItem(`${LOCAL_STORAGE_PREFIX}${key}`, JSON.stringify(value));
        return true;
    } catch {
        return false;
    }
}

function deleteLocalValue(key: string) {
    if (typeof localStorage === 'undefined') return;
    try {
        localStorage.removeItem(`${LOCAL_STORAGE_PREFIX}${key}`);
    } catch {
        // Storage can be blocked in private browsing.
    }
}

function readLocalOutbox<T extends { id: string }>(): T[] {
    if (typeof localStorage === 'undefined') return [];
    try {
        const value = localStorage.getItem(LOCAL_OUTBOX_KEY);
        if (!value) return [];
        const parsed = JSON.parse(value);
        if (!Array.isArray(parsed)) throw new Error('Outbox fallback is not an array.');
        return parsed.filter((item): item is T => (
            Boolean(item) && typeof item === 'object' && typeof item.id === 'string'
        ));
    } catch {
        try {
            localStorage.removeItem(LOCAL_OUTBOX_KEY);
        } catch {
            // Ignore blocked cleanup.
        }
        return [];
    }
}

function writeLocalOutbox<T extends { id: string }>(values: T[]): boolean {
    if (typeof localStorage === 'undefined') return false;
    try {
        localStorage.setItem(
            LOCAL_OUTBOX_KEY,
            JSON.stringify(values.slice(-MAX_LOCAL_OUTBOX_ITEMS)),
        );
        return true;
    } catch {
        return false;
    }
}

function deleteLocalOutboxValue(id: string) {
    const values = readLocalOutbox<{ id: string }>();
    writeLocalOutbox(values.filter((value) => value.id !== id));
}

export function openRuntimeDatabase(): Promise<IDBDatabase | null> {
    if (databasePromise) return databasePromise;
    if (typeof indexedDB === 'undefined') return Promise.resolve(null);

    try {
        databasePromise = new Promise((resolve) => {
            const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
            request.onupgradeneeded = () => {
                const database = request.result;
                if (!database.objectStoreNames.contains(KV_STORE)) {
                    database.createObjectStore(KV_STORE);
                }
                if (!database.objectStoreNames.contains(OUTBOX_STORE)) {
                    const store = database.createObjectStore(OUTBOX_STORE, { keyPath: 'id' });
                    store.createIndex('nextAttemptAt', 'nextAttemptAt');
                    store.createIndex('expiresAt', 'expiresAt');
                }
            };
            request.onsuccess = () => {
                const database = request.result;
                database.onversionchange = () => {
                    database.close();
                    databasePromise = null;
                };
                resolve(database);
            };
            request.onerror = () => {
                warnAboutIndexedDb(request.error);
                resolve(null);
            };
            request.onblocked = () => {
                warnAboutIndexedDb(new Error('IndexedDB open request was blocked.'));
                resolve(null);
            };
        });
    } catch (error) {
        warnAboutIndexedDb(error);
        databasePromise = Promise.resolve(null);
    }

    return databasePromise;
}

export async function readRuntimeValue<T>(key: string): Promise<T | null> {
    const database = await openRuntimeDatabase();
    if (database) {
        try {
            const transaction = database.transaction(KV_STORE, 'readonly');
            const value = await requestResult(transaction.objectStore(KV_STORE).get(key)) as T | undefined;
            if (value !== undefined) return value;
        } catch (error) {
            warnAboutIndexedDb(error);
        }
    }
    return readLocalValue<T>(key);
}

export async function writeRuntimeValue<T>(key: string, value: T): Promise<void> {
    const database = await openRuntimeDatabase();
    if (database) {
        try {
            const transaction = database.transaction(KV_STORE, 'readwrite');
            await requestResult(transaction.objectStore(KV_STORE).put(value, key));
            deleteLocalValue(key);
            return;
        } catch (error) {
            warnAboutIndexedDb(error);
        }
    }
    writeLocalValue(key, value);
}

export async function deleteRuntimeValue(key: string): Promise<void> {
    const database = await openRuntimeDatabase();
    if (database) {
        try {
            const transaction = database.transaction(KV_STORE, 'readwrite');
            await requestResult(transaction.objectStore(KV_STORE).delete(key));
        } catch (error) {
            warnAboutIndexedDb(error);
        }
    }
    deleteLocalValue(key);
}

export async function putOutboxValue<T extends { id: string }>(value: T): Promise<void> {
    const database = await openRuntimeDatabase();
    if (database) {
        try {
            const transaction = database.transaction(OUTBOX_STORE, 'readwrite');
            await requestResult(transaction.objectStore(OUTBOX_STORE).put(value));
            deleteLocalOutboxValue(value.id);
            return;
        } catch (error) {
            warnAboutIndexedDb(error);
        }
    }

    const values = readLocalOutbox<T>();
    const nextValues = [...values.filter((item) => item.id !== value.id), value];
    if (!writeLocalOutbox(nextValues)) {
        throw new Error('Offline storage is unavailable.');
    }
}

export async function readAllOutboxValues<T extends { id: string }>(): Promise<T[]> {
    const merged = new Map<string, T>();
    const database = await openRuntimeDatabase();
    if (database) {
        try {
            const transaction = database.transaction(OUTBOX_STORE, 'readonly');
            const values = await requestResult(transaction.objectStore(OUTBOX_STORE).getAll()) as T[];
            values.forEach((value) => merged.set(value.id, value));
        } catch (error) {
            warnAboutIndexedDb(error);
        }
    }
    readLocalOutbox<T>().forEach((value) => {
        if (!merged.has(value.id)) merged.set(value.id, value);
    });
    return [...merged.values()];
}

export async function deleteOutboxValue(id: string): Promise<void> {
    const database = await openRuntimeDatabase();
    if (database) {
        try {
            const transaction = database.transaction(OUTBOX_STORE, 'readwrite');
            await requestResult(transaction.objectStore(OUTBOX_STORE).delete(id));
        } catch (error) {
            warnAboutIndexedDb(error);
        }
    }
    deleteLocalOutboxValue(id);
}