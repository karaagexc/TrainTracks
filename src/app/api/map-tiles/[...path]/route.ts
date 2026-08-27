import 'server-only';

const CARTO_STYLE_PATHS = {
    dark: 'dark_all',
    voyager: 'rastertiles/voyager',
} as const;

const TILE_CACHE_SECONDS = 7 * 24 * 60 * 60;
const TILE_STALE_SECONDS = 30 * 24 * 60 * 60;

type CartoStyle = keyof typeof CARTO_STYLE_PATHS;
type RouteContext = { params: Promise<{ path: string[] }> };

function errorResponse(status: number, message: string): Response {
    return new Response(message, {
        status,
        headers: {
            'Cache-Control': 'no-store',
            'Content-Type': 'text/plain; charset=utf-8',
            'X-Content-Type-Options': 'nosniff',
        },
    });
}

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
    const { path } = await context.params;
    if (!Array.isArray(path) || path.length !== 4) {
        return errorResponse(404, 'Map tile not found');
    }

    const [styleValue, zoomValue, xValue, tileValue] = path;
    if (!(styleValue in CARTO_STYLE_PATHS)) {
        return errorResponse(404, 'Map tile not found');
    }

    const tileMatch = /^(\d+)(@2x)?\.png$/.exec(tileValue);
    const zoom = Number(zoomValue);
    const x = Number(xValue);
    const y = tileMatch ? Number(tileMatch[1]) : Number.NaN;
    const maxCoordinate = Number.isInteger(zoom) && zoom >= 0 && zoom <= 20
        ? 2 ** zoom
        : 0;

    if (
        !Number.isInteger(x)
        || !Number.isInteger(y)
        || x < 0
        || y < 0
        || x >= maxCoordinate
        || y >= maxCoordinate
    ) {
        return errorResponse(404, 'Map tile not found');
    }

    const apiKey = process.env.CARTO_BASEMAP_KEY?.trim();
    if (!apiKey) {
        return errorResponse(503, 'Map tiles are temporarily unavailable');
    }

    const style = styleValue as CartoStyle;
    const shard = 'abcd'[(zoom + x + y) % 4];
    const upstreamUrl = new URL(
        `https://${shard}.basemaps.cartocdn.com/${CARTO_STYLE_PATHS[style]}/${zoom}/${x}/${tileValue}`,
    );
    upstreamUrl.searchParams.set('key', apiKey);

    try {
        const upstreamResponse = await fetch(upstreamUrl, {
            headers: { Accept: 'image/png,image/*;q=0.8,*/*;q=0.5' },
        });

        if (!upstreamResponse.ok || !upstreamResponse.body) {
            return errorResponse(upstreamResponse.status === 404 ? 404 : 502, 'Map tile unavailable');
        }

        const headers = new Headers({
            'Cache-Control': `public, max-age=86400, s-maxage=${TILE_CACHE_SECONDS}, stale-while-revalidate=${TILE_STALE_SECONDS}`,
            'Content-Type': upstreamResponse.headers.get('content-type') || 'image/png',
            'Vercel-CDN-Cache-Control': `public, s-maxage=${TILE_CACHE_SECONDS}, stale-while-revalidate=${TILE_STALE_SECONDS}`,
            'X-Content-Type-Options': 'nosniff',
        });
        const contentLength = upstreamResponse.headers.get('content-length');
        if (contentLength) headers.set('Content-Length', contentLength);

        return new Response(upstreamResponse.body, { status: 200, headers });
    } catch {
        return errorResponse(502, 'Map tile unavailable');
    }
}
