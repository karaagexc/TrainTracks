import Link from 'next/link'

export default function NotFound() {
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
            <h2 style={{ fontSize: '2rem', marginBottom: '1rem', fontWeight: 'bold' }}>Not Found</h2>
            <p style={{ marginBottom: '2rem', color: '#888' }}>Could not find requested resource</p>
            <Link href="/" style={{
                color: 'black',
                backgroundColor: 'white',
                padding: '10px 20px',
                borderRadius: '8px',
                textDecoration: 'none',
                fontWeight: 'bold'
            }}>
                Return Home
            </Link>
        </div>
    )
}
