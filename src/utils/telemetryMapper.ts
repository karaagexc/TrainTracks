import { TrainPresence } from '@/types/train';

export function extractTelemetryStationId(train: Pick<TrainPresence, 'stationId'>): string | null {
    return train.stationId ?? null;
}

export function enhanceLiveTrainTelemetry(train: TrainPresence): TrainPresence {
    return train;
}
