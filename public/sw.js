const CACHE = 'cutkit-static-v1'
const CACHED_PREFIXES = ['/_nuxt/', '/icons/', '/fonts/', '/favicon/', '/icon.svg', '/manifest.webmanifest']

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
    event.waitUntil(self.registration.showNotification(notification.title || 'CutKit', {
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
