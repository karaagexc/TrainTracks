import 'server-only';

import { createHmac } from 'node:crypto';

export function createCrowdPseudonym(
    deviceId: string,
    secret: string,
    now = Date.now(),
): string {
    const rotation = new Date(now).toISOString().slice(0, 10);
    return createHmac('sha256', secret)
        .update(`${rotation}:${deviceId}`)
        .digest('hex')
        .slice(0, 20);
}
