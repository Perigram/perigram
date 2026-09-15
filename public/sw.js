import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { NetworkFirst } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'
import { CacheableResponsePlugin } from 'workbox-cacheable-response'

const HTML_CACHE = 'cutkit-html'
const API_CACHE = 'cutkit-api'
const LEGACY_CACHES = ['cutkit-static-v1']

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

self.addEventListener('install', () => {
    self.skipWaiting()
})

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        await Promise.all(LEGACY_CACHES.map((name) => caches.delete(name)))
        await self.clients.claim()
    })())
})

const isDocumentRequest = ({ request }) => request.mode === 'navigate'

const isCacheableApiGet = ({ request, url }) => (
    request.method === 'GET'
    && url.origin === self.location.origin
    && url.pathname.startsWith('/api/')
    && !url.pathname.startsWith('/api/connections/')
)

registerRoute(isDocumentRequest, new NetworkFirst({
    cacheName: HTML_CACHE,
    networkTimeoutSeconds: 8,
    plugins: [
        new CacheableResponsePlugin({ statuses: [200] }),
        new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 7 * 24 * 3600, purgeOnQuotaError: true })
    ]
}))

registerRoute(isCacheableApiGet, new NetworkFirst({
    cacheName: API_CACHE,
    networkTimeoutSeconds: 8,
    plugins: [
        new CacheableResponsePlugin({ statuses: [200] }),
        new ExpirationPlugin({ maxEntries: 300, maxAgeSeconds: 30 * 24 * 3600, purgeOnQuotaError: true })
    ]
}))
