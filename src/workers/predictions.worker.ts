import { deriveOfflineForecasts, type PredictionSnapshot } from '../domain/predictions/snapshot';

const worker = self as unknown as {
    onmessage: ((event: MessageEvent<{ context: number; revision: number; snapshots: PredictionSnapshot[]; now: number }>) => void) | null;
    postMessage: (value: unknown) => void;
};

worker.onmessage = ({ data }) => {
    worker.postMessage({ context: data.context, revision: data.revision, forecasts: deriveOfflineForecasts(data.snapshots, data.now) });
};
