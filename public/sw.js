const STATIC_CACHE = 'perigram-static-v5'
const RUNTIME_CACHE = 'perigram-runtime-v1'
// Offline launch fallback chain key: holds the URL of the last
// navigation document that entered the runtime cache. Authenticated
// visits to `/` are SSR redirects (opaque-redirect responses are
// uncacheable), so an installed-PWA launch offline finds neither the
// requested route nor `/` — the marker is the shell it falls back to.
const SHELL_MARKER = '/__perigram-shell'
// Caching contract lives in the root README (PWA section): static
// decoration is cache-first; navigations, /_nuxt/ chunks, and GET /api/**
// reads are network-first with offline cache fallback. The /api/connections
// SSE stream is never intercepted. Only successful same-origin responses
// are cached; partial (206) range responses pass through uncached.
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
    // Cache.put rejects partial (206) responses, and a partial body keyed to
    // the full request would corrupt the offline fallback regardless.
    if (!response || !response.ok || response.status === 206 || response.type !== 'basic') return Promise.resolve()
    const copy = response.clone()
    return caches.open(cacheName).then((cache) => cache.put(event.request, copy).then(() => true))
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

async function cacheShell(event, response) {
    if (!(await cachePut(RUNTIME_CACHE, event, response))) return
    const cache = await caches.open(RUNTIME_CACHE)
    await cache.put(SHELL_MARKER, new Response(event.request.url))
}

async function offlineNavigation(event) {
    const cache = await caches.open(RUNTIME_CACHE)
    return (await cache.match(event.request))
        || (await cache.match('/'))
        || (await shellFromMarker(cache))
}

async function shellFromMarker(cache) {
    const marker = await cache.match(SHELL_MARKER)
    return marker ? cache.match(await marker.text()) : undefined
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
                    event.waitUntil(cacheShell(event, response))
                    return response
                })
                .catch(() => offlineNavigation(event))
        )
    }
})
