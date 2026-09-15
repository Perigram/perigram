const CACHE = 'cutkit-static-v1'
const CACHED_PREFIXES = ['/_nuxt/', '/icons/', '/fonts/', '/favicon/', '/icon.svg', '/manifest.webmanifest']

self.addEventListener('install', () => {
    self.skipWaiting()
})

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const keys = await caches.keys()
        await Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))
        await self.clients.claim()
    })())
})

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url)
    if (event.request.method !== 'GET' || url.origin !== self.location.origin) return
    if (!CACHED_PREFIXES.some((prefix) => url.pathname === prefix || url.pathname.startsWith(prefix))) return
    event.respondWith(
        caches.match(event.request).then((cached) => {
            if (cached) return cached
            return fetch(event.request).then((response) => {
                const copy = response.clone()
                caches.open(CACHE).then((cache) => cache.put(event.request, copy))
                return response
            })
        })
    )
})
