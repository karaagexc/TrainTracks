import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
    dest: "public",
    register: true,
    cacheStartUrl: false,
    dynamicStartUrl: false,
    cacheOnFrontEndNav: false,
    reloadOnOnline: false,
    disable: process.env.NODE_ENV === "development",
    extendDefaultRuntimeCaching: false,
    publicExcludes: ["!station-images/**/*"],
    workboxOptions: {
        skipWaiting: false,
        clientsClaim: false,
        cleanupOutdatedCaches: true,
        // Never precache server HTML, RSC, or API responses, including auth routes.
        manifestTransforms: [async (entries) => ({
            manifest: entries.filter(({ url }) => !/\.(?:html|json|rsc|txt)(?:\?|$)/i.test(url)
                && !/^\/(?:api|auth|profile|admin|login|api-console)(?:\/|$)/.test(url)),
            warnings: [],
        })],
        runtimeCaching: [
            {
                urlPattern: ({ url }) => url.origin === self.location.origin
                    && url.pathname.startsWith('/api/map-tiles/'),
                handler: "CacheFirst",
                options: {
                    cacheName: "traintracks-map-tiles-v4",
                    expiration: {
                        maxEntries: 180,
                        maxAgeSeconds: 7 * 24 * 60 * 60,
                    },
                    cacheableResponse: { statuses: [200] },
                },
            },
            {
                urlPattern: ({ url }) => url.origin === self.location.origin
                    && url.pathname.startsWith('/_next/static/'),
                handler: "CacheFirst",
                options: {
                    cacheName: "traintracks-static-v2",
                    expiration: {
                        maxEntries: 90,
                        maxAgeSeconds: 30 * 24 * 60 * 60,
                    },
                    cacheableResponse: { statuses: [200] },
                },
            },
            {
                urlPattern: ({ url }) => url.origin === self.location.origin
                    && url.pathname.startsWith('/station-images/'),
                handler: "CacheFirst",
                options: {
                    cacheName: "traintracks-station-images-v2",
                    expiration: {
                        maxEntries: 60,
                        maxAgeSeconds: 30 * 24 * 60 * 60,
                    },
                    cacheableResponse: { statuses: [200] },
                },
            },
            {
                urlPattern: ({ request, url }) => request.mode === 'navigate'
                    && url.origin === self.location.origin
                    && ['/', '/explorer', '/docs'].includes(url.pathname)
                    && !url.search,
                handler: "NetworkFirst",
                options: {
                    cacheName: "traintracks-public-pages-v3",
                    networkTimeoutSeconds: 4,
                    expiration: {
                        maxEntries: 12,
                        maxAgeSeconds: 24 * 60 * 60,
                    },
                    cacheableResponse: { statuses: [200] },
                    plugins: [{
                        cacheWillUpdate: async ({ request, response }) => {
                            if (!response || response.status !== 200 || response.redirected) return null;
                            const url = new URL(response.url || request.url);
                            if (!['/', '/explorer', '/docs'].includes(url.pathname) || url.search) return null;
                            if (/private|no-store/i.test(response.headers.get('Cache-Control') || '')) return null;
                            return response;
                        },
                    }],
                },
            },
        ],
    },
});

/** @type {import('next').NextConfig} */
const nextConfig = {};

export default withPWA(nextConfig);
