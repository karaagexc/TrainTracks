import { getPredictionResponse, type PredictionResponse } from '@/domain/predictions/engine';
import { parsePredictionRequestFromUrl } from '@/domain/predictions/request';

const STREAM_INTERVAL_MS = 3_000;

export function predictionStreamHeaders(): HeadersInit {
    return {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-store, max-age=0',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
    };
}

export function formatPredictionSseEvent(response: PredictionResponse, id = Date.now()): string {
    return [
        'event: predictions',
        `id: ${id}`,
        `data: ${JSON.stringify(response)}`,
        '',
        '',
    ].join('\n');
}

export function createPredictionStream(url: URL, signal?: AbortSignal): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();
    let interval: ReturnType<typeof setInterval> | null = null;
    let closed = false;

    const cleanup = () => {
        if (interval) {
            clearInterval(interval);
            interval = null;
        }
        closed = true;
    };

    return new ReadableStream<Uint8Array>({
        start(controller) {
            const emit = () => {
                if (closed) return;
                const response = getPredictionResponse(parsePredictionRequestFromUrl(url));
                try {
                    controller.enqueue(encoder.encode(formatPredictionSseEvent(response)));
                } catch {
                    cleanup();
                }
            };

            const close = () => {
                cleanup();
                try {
                    controller.close();
                } catch {
                    // Already closed by the runtime.
                }
            };

            emit();
            interval = setInterval(emit, STREAM_INTERVAL_MS);

            if (signal) {
                if (signal.aborted) {
                    close();
                } else {
                    signal.addEventListener('abort', close, { once: true });
                }
            }
        },
        cancel() {
            cleanup();
        },
    });
}
