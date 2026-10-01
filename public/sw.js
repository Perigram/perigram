const STATIC_CACHE = 'perigram-static-v5'
const RUNTIME_CACHE = 'perigram-runtime-v1'
// Caching contract lives in the root README (PWA section): static
// decoration is cache-first; navigations, /_nuxt/ chunks, and GET /api/**
// reads are network-first with offline cache fallback. The /api/connections
// SSE stream is never intercepted. Only successful same-origin responses
// are cached.
const STATIC_PREFIXES = ['/icons/', '/fonts/', '/favicon/', '/icon.svg', '/manifest.webmanifest']

self.addEventListener('install', () => {
    self.skipWaiting()
})

self.addEventListener('message', (event) => {
    if (event.data === 'SKIP_WAITING') self.skipWaiting()
})

self.addEventListener('push', (event) => {
    let notification = {}
    try {
        notification = event.data ? event.data.json() : {}
    } catch {
        notification = {}
    }
    event.waitUntil(self.registration.showNotification(notification.title || 'Perigram', {
        body: notification.body || '',
        tag: notification.tag || '',
        requireInteraction: Boolean(notification.requireInteraction),
        data: notification.data || {},
        icon: '/favicon/pwa-192x192.png'
    }))
})

self.addEventListener('notificationclick', (event) => {
    event.notification.close()
    const url = event.notification.data?.url || '/'
    event.waitUntil((async () => {
        const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
        for (const client of clientList) {
            if (client.url.includes(self.location.origin) && 'focus' in client) {
                await client.focus()
                if ('navigate' in client && url !== '/') await client.navigate(url).catch(() => null)
                return
            }
        }
        await self.clients.openWindow(url)
    })())
})

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const keep = [STATIC_CACHE, RUNTIME_CACHE]
        const keys = await caches.keys()
        await Promise.all(keys.filter((key) => !keep.includes(key)).map((key) => caches.delete(key)))
        await self.clients.claim()
    })())
})

function cachePut(cacheName, event, response) {
    if (!response || !response.ok || response.type !== 'basic') return Promise.resolve()
    const copy = response.clone()
    return caches.open(cacheName).then((cache) => cache.put(event.request, copy))
}

// Fresh while online, last-known while offline; a never-cached URL that
// cannot be fetched rejects and the app's own error handling takes over.
function networkFirst(event) {
    event.respondWith(
        fetch(event.request)
            .then((response) => {
                event.waitUntil(cachePut(RUNTIME_CACHE, event, response))
                return response
            })
            .catch(() => caches.match(event.request).then((cached) => cached
                || Promise.reject(new Error('offline and not cached'))))
    )
}

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url)
    if (event.request.method !== 'GET' || url.origin !== self.location.origin) return
    if (url.pathname.startsWith('/api/connections')) return
    if (STATIC_PREFIXES.some((prefix) => url.pathname === prefix || url.pathname.startsWith(prefix))) {
        event.respondWith(
            caches.match(event.request).then((cached) => cached
                || fetch(event.request).then((response) => {
                    event.waitUntil(cachePut(STATIC_CACHE, event, response))
                    return response
                }))
        )
        return
    }
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/_nuxt/')) {
        networkFirst(event)
        return
    }
    if (event.request.mode === 'navigate') {
        event.respondWith(
            fetch(event.request)
                .then((response) => {
                    event.waitUntil(cachePut(RUNTIME_CACHE, event, response))
                    return response
                })
                .catch(() => caches.match(event.request)
                    .then((cached) => cached || caches.match('/')))
        )
    }
})
