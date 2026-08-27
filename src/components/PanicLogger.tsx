'use client';

import { useEffect } from 'react';

export function PanicLogger() {
    useEffect(() => {
        const appendEntry = (label: string, value: unknown, location = '') => {
            const logger = document.getElementById('panic-logger');
            if (!logger) return;

            logger.style.display = 'block';
            const entry = document.createElement('div');
            entry.style.padding = '4px';
            entry.style.borderBottom = '1px solid rgba(255,255,255,0.1)';
            entry.textContent = `[${label}] ${String(value || 'Unknown error')}${location}`;
            logger.appendChild(entry);

            while (logger.childElementCount > 8) {
                logger.firstElementChild?.remove();
            }
        };

        const handleWindowError = (event: ErrorEvent) => {
            let location = '';
            if (event.filename) {
                try {
                    location = ` (${new URL(event.filename, window.location.href).pathname}:${event.lineno})`;
                } catch {
                    location = ` (line ${event.lineno})`;
                }
            }
            appendEntry('CRASH', event.message, location);
        };
        const handleRejection = (event: PromiseRejectionEvent) => appendEntry('PROMISE', event.reason);

        window.addEventListener('error', handleWindowError);
        window.addEventListener('unhandledrejection', handleRejection);

        return () => {
            window.removeEventListener('error', handleWindowError);
            window.removeEventListener('unhandledrejection', handleRejection);
        };
    }, []);

    return (
        <div
            id="panic-logger"
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                width: '100%',
                zIndex: 99999,
                backgroundColor: 'rgba(50, 0, 0, 0.95)',
                color: 'white',
                padding: '10px',
                fontFamily: 'monospace',
                fontSize: '12px',
                pointerEvents: 'none',
                display: 'none',
                maxHeight: '200px',
                overflowY: 'auto',
            }}
        />
    );
}
