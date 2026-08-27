import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
    dest: "public",
    register: true,
    skipWaiting: true,
    disable: process.env.NODE_ENV === "development",
    extendDefaultRuntimeCaching: false,
    publicExcludes: ["!station-images/**/*"],
    workboxOptions: {
        cleanupOutdatedCaches: true,
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
                    && url.origin === self.location.origin,
                handler: "NetworkFirst",
                options: {
                    cacheName: "traintracks-pages-v2",
                    networkTimeoutSeconds: 4,
                    expiration: {
                        maxEntries: 12,
                        maxAgeSeconds: 24 * 60 * 60,
                    },
                    cacheableResponse: { statuses: [200] },
                },
            },
        ],
    },
});

/** @type {import('next').NextConfig} */
const nextConfig = {};

export default withPWA(nextConfig);