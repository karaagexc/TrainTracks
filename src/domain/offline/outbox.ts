import {
    deleteOutboxValue,
    putOutboxValue,
    readAllOutboxValues,
} from '@/domain/offline/indexedDb';

export type OutboxKind = 'crowd_presence' | 'stall_report' | 'incident_vote' | 'trip_history';

export interface OutboxItem {
    id: string;
    kind: OutboxKind;
    endpoint: string;
    method: 'POST' | 'PATCH';
    body: unknown;
    createdAt: number;
    expiresAt: number;
    attempts: number;
    nextAttemptAt: number;
}

const TTL_BY_KIND: Record<OutboxKind, number> = {
    crowd_presence: 2 * 60_000,
    stall_report: 60 * 60_000,
    incident_vote: 60 * 60_000,
    trip_history: 24 * 60 * 60_000,
};

let flushPromise: Promise<{ sent: number; remaining: number }> | null = null;

function makeId(kind: OutboxKind, idempotencyKey: string) {
    return `${kind}:${idempotencyKey.replace(/[^a-zA-Z0-9:_-]/g, '').slice(0, 160)}`;
}

export async function enqueueOutbox(
    kind: OutboxKind,
    endpoint: string,
    body: unknown,
    idempotencyKey: string,
    method: OutboxItem['method'] = 'POST',
): Promise<OutboxItem> {
    const now = Date.now();
    const item: OutboxItem = {
        id: makeId(kind, idempotencyKey),
        kind,
        endpoint,
        method,
        body,
        createdAt: now,
        expiresAt: now + TTL_BY_KIND[kind],
        attempts: 0,
        nextAttemptAt: now,
    };
    await putOutboxValue(item);
    return item;
}

function nextBackoff(attempts: number) {
    return Math.min(5 * 60_000, 2_000 * 2 ** Math.min(attempts, 7));
}

export function flushOutbox(fetchImpl: typeof fetch = fetch) {
    if (flushPromise) return flushPromise;

    flushPromise = (async () => {
        const now = Date.now();
        const items = (await readAllOutboxValues<OutboxItem>())
            .sort((left, right) => left.createdAt - right.createdAt);
        let sent = 0;

        for (const item of items) {
            if (item.expiresAt <= now) {
                await deleteOutboxValue(item.id);
                continue;
            }
            if (item.nextAttemptAt > now) continue;

            try {
                const response = await fetchImpl(item.endpoint, {
                    method: item.method,
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Idempotency-Key': item.id,
                    },
                    cache: 'no-store',
                    body: JSON.stringify(item.body),
                });

                if (response.ok) {
                    await deleteOutboxValue(item.id);
                    sent += 1;
                    continue;
                }

                if (response.status >= 400
                    && response.status < 500
                    && response.status !== 408
                    && response.status !== 429) {
                    await deleteOutboxValue(item.id);
                    continue;
                }
            } catch {
                // Retry below.
            }

            await putOutboxValue({
                ...item,
                attempts: item.attempts + 1,
                nextAttemptAt: now + nextBackoff(item.attempts + 1),
            });
        }

        const remaining = (await readAllOutboxValues<OutboxItem>()).length;
        return { sent, remaining };
    })().finally(() => {
        flushPromise = null;
    });

    return flushPromise;
}
