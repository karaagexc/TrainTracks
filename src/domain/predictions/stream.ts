import type { PredictionResponse } from '@/domain/predictions/engine';
import { parsePredictionRequestFromUrl } from '@/domain/predictions/request';
import { getConfiguredPredictionResponse, getServerApiConfiguration, publicApiConfigurationAccess } from './serverConfig';

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

export function createPredictionStream(url: URL, signal?: AbortSignal, options: { publicApi?: boolean } = {}): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();
    let interval: ReturnType<typeof setTimeout> | null = null;
    let closed = false;
    let abortListener: (() => void) | null = null;

    const cleanup = () => {
        if (interval) {
            clearTimeout(interval);
            interval = null;
        }
        closed = true;
        if (abortListener) signal?.removeEventListener('abort', abortListener);
    };

    return new ReadableStream<Uint8Array>({
        start(controller) {
            const emit = async () => {
                if (closed) return;
                try {
                    if (options.publicApi && !publicApiConfigurationAccess(await getServerApiConfiguration()).ok) {
                        close(); return;
                    }
                    const response = await getConfiguredPredictionResponse(parsePredictionRequestFromUrl(url));
                    if (closed) return;
                    controller.enqueue(encoder.encode(formatPredictionSseEvent(response)));
                } catch {
                    cleanup();
                    try { controller.error(new Error('Prediction stream unavailable.')); } catch { /* Already closed. */ }
                } finally {
                    if (!closed) interval = setTimeout(() => void emit(), STREAM_INTERVAL_MS);
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

            void emit();

            if (signal) {
                if (signal.aborted) {
                    close();
                } else {
                    abortListener = close;
                    signal.addEventListener('abort', close, { once: true });
                }
            }
        },
        cancel() {
            cleanup();
        },
    });
}
