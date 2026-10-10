import { deleteOutboxValue, insertOutboxValue, migrateLegacyOutbox, putOutboxValue, readAllOutboxValues, withOutboxLock } from '@/domain/offline/indexedDb';
import { useTrainStore } from '@/store/useTrainStore';

export type OutboxKind = 'crowd_presence' | 'stall_report' | 'incident_vote' | 'trip_history';
export type OutboxState = 'pending' | 'awaiting_auth' | 'quarantined';
export interface OutboxItem {
    version: 2;
    id: string;
    idempotencyKey: string;
    kind: OutboxKind;
    ownerId: string | null;
    state: OutboxState;
    endpoint: string;
    method: 'POST' | 'PATCH';
    body: unknown;
    createdAt: number;
    expiresAt: number | null;
    attempts: number;
    nextAttemptAt: number;
    diagnostic?: { reason: string; status?: number; at: number; response?: string };
    legacyRecord?: Record<string, unknown>;
}

const TTL_BY_KIND = { crowd_presence: 2 * 60_000, stall_report: 60 * 60_000, incident_vote: 60 * 60_000 };
const ENDPOINTS: Record<OutboxKind, string> = {
    crowd_presence: '/api/crowd/presence', stall_report: '/api/stall-report',
    incident_vote: '/api/incidents/resolve', trip_history: '/api/trips',
};
export interface FlushOptions {
    getOwnerId?: () => Promise<string | null>;
    reauthenticatedOwnerId?: string | null;
    reauthenticatedAt?: number;
}
export interface FlushResult { sent: number; remaining: number; paused: number; quarantined: number; locked: boolean }
let flushPromise: Promise<FlushResult> | null = null;
const CROWD_CONSENT_KEY = 'traintracks_crowd_presence_consent';
let crowdConsentRevision = 0;
const crowdRequests = new Set<AbortController>();
let warnedAboutConsentStorage = false;

function crowdConsentGranted(): boolean {
    if (useTrainStore.getState().crowdConsent !== 'granted') return false;
    // A different tab may have withdrawn consent without updating this store.
    try {
        const stored = typeof localStorage === 'undefined' ? null : localStorage.getItem(CROWD_CONSENT_KEY);
        return stored === 'granted';
    } catch (error) {
        if (!warnedAboutConsentStorage) {
            warnedAboutConsentStorage = true;
            console.warn('[Offline] Crowd consent storage unreadable; GPS replay blocked:', error);
        }
        return false;
    }
}

function invalidateCrowdConsent() {
    crowdConsentRevision += 1;
    crowdRequests.forEach((controller) => controller.abort());
}

function watchCrowdConsent(): () => void {
    const unsubscribe = useTrainStore.subscribe((state, previous) => {
        if (state.crowdConsent !== previous.crowdConsent && state.crowdConsent !== 'granted') invalidateCrowdConsent();
    });
    const onStorage = (event: StorageEvent) => {
        if ((event.key === CROWD_CONSENT_KEY && event.newValue !== 'granted') || event.key === null) invalidateCrowdConsent();
    };
    if (typeof window !== 'undefined') window.addEventListener('storage', onStorage);
    return () => {
        unsubscribe();
        if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage);
    };
}

// Invalidate synchronously, before waiting for a serialized history/auth request.
// Storage cleanup rejects on failure; only crowd observations are removed.
export async function cancelQueuedCrowdPresence(): Promise<number> {
    invalidateCrowdConsent();
    const pending = flushPromise;
    if (pending) await pending.catch(() => {});
    const removed = await withOutboxLock(async () => {
        await migrateLegacyOutbox(legacyItem);
        let count = 0;
        for (const item of await readAllOutboxValues<OutboxItem>()) {
            if (item.kind !== 'crowd_presence') continue;
            await deleteOutboxValue(item.id);
            count += 1;
        }
        return count;
    });
    if (removed === null) throw new Error('Crowd cancellation could not acquire offline storage; cleanup must be retried.');
    return removed;
}

function quarantine(item: OutboxItem, reason: string, status?: number, response?: string): OutboxItem {
    return { ...item, state: 'quarantined', diagnostic: { reason, status, response, at: Date.now() } };
}

export async function enqueueOutbox(kind: OutboxKind, endpoint: string, body: unknown,
    idempotencyKey: string, method: OutboxItem['method'] = 'POST', ownerId: string | null = null): Promise<OutboxItem> {
    const now = Date.now();
    const id = `${kind}:${encodeURIComponent(ownerId ?? 'anonymous')}:${encodeURIComponent(idempotencyKey)}`;
    let item: OutboxItem = {
        version: 2, id, idempotencyKey, kind, ownerId, state: 'pending', endpoint, method, body,
        createdAt: now, expiresAt: kind === 'trip_history' ? null : now + TTL_BY_KIND[kind], attempts: 0, nextAttemptAt: now,
    };
    if (kind === 'trip_history' && !ownerId) item = quarantine(item, 'unowned_history');
    if (endpoint !== ENDPOINTS[kind] || method !== 'POST' || !idempotencyKey || !body || typeof body !== 'object') {
        item = quarantine(item, 'invalid_protocol_payload');
    }
    if (kind === 'trip_history' && !validHistoryBody(item)) item = quarantine(item, 'invalid_history_metadata');
    if (kind !== 'crowd_presence') return insertOutboxValue(item);
    const unwatch = watchCrowdConsent();
    const revision = crowdConsentRevision;
    try {
        if (!crowdConsentGranted()) throw new Error('Crowd observation requires current consent.');
        const inserted = await insertOutboxValue(item);
        if (revision !== crowdConsentRevision || !crowdConsentGranted()) {
            await deleteOutboxValue(inserted.id);
            throw new Error('Crowd observation cancelled after consent withdrawal.');
        }
        return inserted;
    } finally { unwatch(); }
}

async function legacyItem(raw: Record<string, unknown>): Promise<OutboxItem> {
    const kind = raw.kind as OutboxKind;
    const createdAt = typeof raw.createdAt === 'number' ? raw.createdAt : Date.now();
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(raw)));
    const fingerprint = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
    const item: OutboxItem = {
        version: 2, id: `legacy:${raw.id}:${fingerprint}`, idempotencyKey: String(raw.id), kind, ownerId: null, state: 'pending',
        endpoint: String(raw.endpoint), method: raw.method as OutboxItem['method'], body: raw.body, createdAt,
        expiresAt: kind === 'trip_history' ? null : Number(raw.expiresAt),
        attempts: Number(raw.attempts) || 0, nextAttemptAt: Number(raw.nextAttemptAt) || createdAt,
        legacyRecord: raw,
    };
    if (kind === 'trip_history') return quarantine(item, 'unowned_legacy_history');
    return validItem(item) ? item : quarantine(item, 'invalid_legacy_payload');
}

function validItem(item: OutboxItem): boolean {
    return item.version === 2 && Object.prototype.hasOwnProperty.call(ENDPOINTS, item.kind)
        && item.endpoint === ENDPOINTS[item.kind] && item.method === 'POST'
        && typeof item.idempotencyKey === 'string' && !!item.idempotencyKey
        && ['pending', 'awaiting_auth', 'quarantined'].includes(item.state)
        && Number.isFinite(item.createdAt) && Number.isFinite(item.attempts) && item.attempts >= 0
        && Number.isFinite(item.nextAttemptAt)
        && (item.kind === 'trip_history' || (typeof item.expiresAt === 'number' && Number.isFinite(item.expiresAt)))
        && !!item.body && typeof item.body === 'object';
}

function validHistoryBody(item: OutboxItem): boolean {
    if (!item.body || typeof item.body !== 'object' || Array.isArray(item.body)) return false;
    const body = item.body as Record<string, unknown>;
    const started = typeof body.started_at === 'string' ? Date.parse(body.started_at) : NaN;
    const completed = typeof body.completed_at === 'string' ? Date.parse(body.completed_at) : NaN;
    return body.client_trip_id === item.idempotencyKey && Number.isFinite(started)
        && Number.isFinite(completed) && completed >= started;
}

export function retryAfterMs(value: string | null, now = Date.now()): number {
    if (!value) return 0;
    if (/^\d+(\.\d+)?$/.test(value.trim())) {
        const milliseconds = Number(value) * 1000;
        return Number.isFinite(milliseconds) ? milliseconds : 0;
    }
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) ? Math.max(0, timestamp - now) : 0;
}

async function summarize(sent = 0, locked = false): Promise<FlushResult> {
    const items = await readAllOutboxValues<OutboxItem>();
    return { sent, remaining: items.length, paused: items.filter((item) => item.state === 'awaiting_auth').length,
        quarantined: items.filter((item) => item.state === 'quarantined').length, locked };
}

export function flushOutbox(fetchImpl: typeof fetch = fetch, options: FlushOptions = {}): Promise<FlushResult> {
    if (flushPromise) return flushPromise;
    const unwatch = watchCrowdConsent();
    const revision = crowdConsentRevision;
    const canSendCrowd = () => revision === crowdConsentRevision && crowdConsentGranted();
    flushPromise = (async () => {
        const result = await withOutboxLock(async (leaseValid) => {
            await migrateLegacyOutbox(legacyItem);
            const items = (await readAllOutboxValues<OutboxItem>()).sort((a, b) => a.createdAt - b.createdAt);
            let sent = 0;
            const pausedOwners = new Set<string>();
            for (let item of items) {
                if (!leaseValid()) break;
                if (item.kind === 'crowd_presence' && !canSendCrowd()) {
                    await deleteOutboxValue(item.id); continue;
                }
                if (!validItem(item)) { await putOutboxValue(quarantine(item, 'invalid_protocol_payload')); continue; }
                if (item.kind !== 'trip_history' && item.expiresAt !== null && item.expiresAt <= Date.now()) {
                    await deleteOutboxValue(item.id); continue;
                }
                if (item.state === 'quarantined') continue;
                if (item.kind === 'trip_history') {
                    if (!item.ownerId) { await putOutboxValue(quarantine(item, 'unowned_history')); continue; }
                    if (!validHistoryBody(item)) { await putOutboxValue(quarantine(item, 'invalid_history_metadata')); continue; }
                    if (pausedOwners.has(item.ownerId)) continue;
                    const currentOwner = await options.getOwnerId?.();
                    if (currentOwner !== item.ownerId) continue;
                    if (item.state === 'awaiting_auth' && (options.reauthenticatedOwnerId !== item.ownerId
                        || (options.reauthenticatedAt ?? 0) <= (item.diagnostic?.at ?? 0))) {
                        pausedOwners.add(item.ownerId);
                        continue;
                    }
                    item = { ...item, state: 'pending' };
                }
                if (item.nextAttemptAt > Date.now() || !leaseValid()) continue;
                let response: Response | undefined;
                let diagnostic: OutboxItem['diagnostic'];
                let detail = '';
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 15_000);
                if (item.kind === 'crowd_presence') crowdRequests.add(controller);
                try {
                    response = await fetchImpl(item.endpoint, {
                        method: item.method, cache: 'no-store', credentials: 'same-origin', signal: controller.signal,
                        headers: { 'Content-Type': 'application/json', 'X-Idempotency-Key': item.idempotencyKey,
                            ...(item.ownerId ? { 'X-Trip-Owner-Id': item.ownerId } : {}) },
                        body: JSON.stringify(item.kind === 'trip_history'
                            ? { ...item.body as object, owner_id: item.ownerId, user_id: item.ownerId } : item.body),
                    });
                    if (!response.ok) detail = (await response.text()).slice(0, 2000);
                } catch (error) {
                    diagnostic = { reason: error instanceof Error ? error.message : 'network_failure', at: Date.now() };
                } finally { clearTimeout(timeout); crowdRequests.delete(controller); }
                if (!leaseValid()) break;
                // Revocation may happen while fetch or response body reading is pending.
                // Never resurrect that GPS payload as a retry or quarantine record.
                if (item.kind === 'crowd_presence' && !canSendCrowd()) {
                    await deleteOutboxValue(item.id); continue;
                }
                if (response) {
                    if (response.ok) { await deleteOutboxValue(item.id); sent += 1; continue; }
                    if (response.status === 401) {
                        await putOutboxValue({ ...item, state: 'awaiting_auth', attempts: item.attempts + 1,
                            diagnostic: { reason: 'authentication_required', status: 401, response: detail, at: Date.now() } });
                        if (item.ownerId) pausedOwners.add(item.ownerId);
                        continue;
                    }
                    if (response.status >= 400 && response.status < 500 && ![408, 425, 429].includes(response.status)) {
                        await putOutboxValue(quarantine(item, response.status === 403 ? 'forbidden' : 'payload_rejected', response.status, detail));
                        continue;
                    }
                    diagnostic = { reason: 'transient_http', status: response.status, response: detail, at: Date.now() };
                }
                const now = Date.now();
                await putOutboxValue({ ...item, attempts: item.attempts + 1, diagnostic,
                    nextAttemptAt: now + Math.max(Math.min(5 * 60_000, 2000 * 2 ** Math.min(item.attempts + 1, 7)),
                        retryAfterMs(response?.headers.get('Retry-After') ?? null, now)) });
            }
            return summarize(sent);
        });
        return result ?? summarize(0, true);
    })().finally(() => { unwatch(); flushPromise = null; });
    return flushPromise;
}
