interface Lease { key: string; owner: string; expiresAt: number }
let databasePromise: Promise<IDBDatabase> | null = null;

function openLeaseDatabase(): Promise<IDBDatabase> {
    if (!databasePromise) databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('traintracks-crowd-leases', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('leases', { keyPath: 'key' });
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error('Crowd lease database blocked.'));
    }).catch((error) => { databasePromise = null; throw error; });
    return databasePromise!;
}

async function mutateLease(key: string, owner: string, leaseMs: number, release = false): Promise<boolean> {
    const database = await openLeaseDatabase();
    return new Promise((resolve, reject) => {
        const transaction = database.transaction('leases', 'readwrite');
        const store = transaction.objectStore('leases');
        const request = store.get(key);
        let acquired = false;
        request.onsuccess = () => {
            const current = request.result as Lease | undefined;
            const now = Date.now();
            if (release) {
                if (current?.owner === owner) store.delete(key);
            } else if (!current || current.owner === owner || current.expiresAt <= now) {
                store.put({ key, owner, expiresAt: now + leaseMs } satisfies Lease);
                acquired = true;
            }
        };
        transaction.oncomplete = () => resolve(acquired);
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
    });
}

export async function getAnonymousCrowdDeviceId(): Promise<string | null> {
    try {
        const database = await openLeaseDatabase();
        const id = await new Promise<string>((resolve, reject) => {
            const transaction = database.transaction('leases', 'readwrite');
            const store = transaction.objectStore('leases');
            const request = store.get('anonymous-device');
            let deviceId = '';
            request.onsuccess = () => {
                const existing = request.result as Lease | undefined;
                if (existing?.owner) deviceId = existing.owner;
                else {
                    try { deviceId = localStorage.getItem('traintracks_anonymous_device_id') ?? ''; } catch { /* IDB remains durable. */ }
                    if (!deviceId) deviceId = crypto.randomUUID();
                    store.put({ key: 'anonymous-device', owner: deviceId, expiresAt: Number.MAX_SAFE_INTEGER } satisfies Lease);
                }
            };
            transaction.oncomplete = () => resolve(deviceId);
            transaction.onerror = () => reject(transaction.error);
            transaction.onabort = () => reject(transaction.error);
        });
        try { localStorage.setItem('traintracks_anonymous_device_id', id); } catch { /* IDB remains durable. */ }
        return id;
    } catch { return null; }
}

/** Fail closed when neither atomic primitive is available. No localStorage check/write race. */
export async function claimCrowdLease(deviceId: string, owner: string, leaseMs: number): Promise<boolean> {
    try {
        const key = `crowd:${deviceId}`;
        if (navigator.locks) return await navigator.locks.request(key, () => mutateLease(key, owner, leaseMs));
        return await mutateLease(key, owner, leaseMs);
    } catch { return false; }
}

export async function releaseCrowdLease(deviceId: string, owner: string): Promise<void> {
    try {
        const key = `crowd:${deviceId}`;
        if (navigator.locks) await navigator.locks.request(key, () => mutateLease(key, owner, 0, true));
        else await mutateLease(key, owner, 0, true);
    } catch { /* Lease expiry remains the recovery path. */ }
}
