"use client";


export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    return (
        <html>
            <body style={{ backgroundColor: 'black', color: 'white', padding: 20, fontFamily: 'sans-serif' }}>
                <h2>Something went wrong!</h2>
                <pre style={{ color: 'red' }}>{error.message}</pre>
                <button onClick={() => reset()} style={{ padding: 10, marginTop: 20 }}>Try again</button>
            </body>
        </html>
    );
}
