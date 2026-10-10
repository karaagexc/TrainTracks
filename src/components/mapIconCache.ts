import type { TrainPresence } from '@/types/train';

type StationIconOptions = { className: string; html: string; iconSize: [number, number]; iconAnchor: [number, number] };
type IconFactory = { divIcon: (options: StationIconOptions) => object };
const caches = new WeakMap<IconFactory, Map<string, { signature: string; icon: object }>>();

export function getCachedStationIcon<T extends IconFactory>(leaflet: T, stationId: string, options: StationIconOptions): ReturnType<T['divIcon']> {
    let cache = caches.get(leaflet);
    if (!cache) { cache = new Map(); caches.set(leaflet, cache); }
    const signature = JSON.stringify(options);
    const previous = cache.get(stationId);
    if (previous?.signature === signature) return previous.icon as ReturnType<T['divIcon']>;
    const icon = leaflet.divIcon(options);
    cache.set(stationId, { signature, icon });
    return icon as ReturnType<T['divIcon']>;
}

export function isMapTrainVisuallyMoving(train: Pick<TrainPresence, 'speedKph' | 'statusCode' | 'freshness'>): boolean {
    return train.statusCode !== 'AT_STATION' && train.freshness !== 'stale'
        && Number.isFinite(train.speedKph) && train.speedKph > 0;
}
