'use client'

import { useEffect } from 'react'

export default function Error({
    error,
    reset,
}: {
    error: Error & { digest?: string }
    reset: () => void
}) {
    useEffect(() => {
        console.error(error)
    }, [error])

    return (
        <div style={{
            minHeight: '100vh',
            backgroundColor: 'black',
            color: 'white',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'sans-serif',
            padding: '20px',
            textAlign: 'center'
        }}>
            <h2 style={{ fontSize: '2rem', marginBottom: '1rem', fontWeight: 'bold', color: '#ef4444' }}>Something went wrong!</h2>
            <pre style={{
                backgroundColor: '#18181b',
                padding: '15px',
                borderRadius: '8px',
                marginBottom: '20px',
                textAlign: 'left',
                maxWidth: '100%',
                overflow: 'auto',
                fontSize: '12px',
                border: '1px solid #3f3f46'
            }}>
                {error.message}
            </pre>
            <button
                onClick={() => reset()}
                style={{
                    color: 'black',
                    backgroundColor: 'white',
                    padding: '10px 20px',
                    borderRadius: '8px',
                    border: 'none',
                    fontWeight: 'bold',
                    cursor: 'pointer'
                }}
            >
                Try again
            </button>
        </div>
    )
}
