import { describe, it, expect, beforeEach } from 'vitest'

// The service worker contract spec. `public/` is served verbatim, so the
// spec cannot ship beside `public/sw.js`; it lives next to the other
// offline-behavior spec (`outbox.spec.js`). The worker is imported against
// a stubbed worker environment: plain request objects (Request's
// constructor forbids `mode: 'navigate'`) and Responses forced to
// `type: 'basic'`, which is what real same-origin browser fetches produce
// (Node-constructed Responses carry `type: 'default'`).

const ORIGIN = 'https://app.test'
const STATIC_CACHE = 'perigram-static-v5'
const RUNTIME_CACHE = 'perigram-runtime-v1'

const listeners = new Map()
let cacheStores

class FakeCache {
    constructor() {
        this.entries = new Map()
    }

    async match(request) {
        const key = new URL(typeof request === 'string' ? request : request.url, ORIGIN).href
        return this.entries.get(key)
    }

    async put(request, response) {
        // The real Cache API rejects partial responses.
        if (response.status === 206) {
            throw new TypeError("Failed to execute 'put' on 'Cache': Partial response (status code 206) is unsupported")
        }
        const key = new URL(typeof request === 'string' ? request : request.url, ORIGIN).href
        this.entries.set(key, response)
    }
}

globalThis.caches = {
    async open(name) {
        if (!cacheStores.has(name)) cacheStores.set(name, new FakeCache())
        return cacheStores.get(name)
    },
    async match(request) {
        for (const cache of cacheStores.values()) {
            const hit = await cache.match(request)
            if (hit) return hit
        }
        return undefined
    },
    async keys() {
        return [...cacheStores.keys()]
    },
    async delete(name) {
        return cacheStores.delete(name)
    }
}

globalThis.self = {
    skipWaiting: () => {},
    addEventListener: (type, handler) => listeners.set(type, handler),
    location: { origin: ORIGIN },
    registration: { showNotification: () => {} },
    clients: { matchAll: async () => [], claim: () => {}, openWindow: async () => {} }
}

await import('../public/sw.js')

function browserResponse(body, init = {}) {
    const response = new Response(body, init)
    Object.defineProperty(response, 'type', { value: 'basic' })
    return response
}

async function seed(cacheName, url, body) {
    const cache = await caches.open(cacheName)
    await cache.put({ url }, browserResponse(body))
}

function dispatchFetch(request, networkFetch) {
    let networkUsed = false
    globalThis.fetch = async (...args) => {
        networkUsed = true
        return networkFetch(...args)
    }
    let responded = null
    let waited = Promise.resolve()
    const event = {
        request,
        waitUntil: (promise) => { waited = promise },
        respondWith: (promise) => { responded = promise }
    }
    listeners.get('fetch')(event)
    return {
        responded: () => responded,
        waited: () => waited,
        networkUsed: () => networkUsed
    }
}

const get = (url, mode = 'no-cors') => ({ url, method: 'GET', mode })
const offline = () => Promise.reject(new TypeError('Failed to fetch'))

beforeEach(() => {
    cacheStores = new Map()
})

describe('service worker fetch contract', () => {
    it('serves static prefixes cache-first without touching the network', async () => {
        await seed(STATIC_CACHE, `${ORIGIN}/fonts/main.woff2`, 'font-bytes')
        const event = dispatchFetch(get(`${ORIGIN}/fonts/main.woff2`), offline)
        expect(await (await event.responded()).text()).toBe('font-bytes')
        expect(event.networkUsed()).toBe(false)
    })

    it('caches a successful static network response and passes failures through', async () => {
        const failing = dispatchFetch(get(`${ORIGIN}/icon.svg`), () => Promise.resolve(browserResponse('', { status: 500 })))
        expect((await failing.responded()).status).toBe(500)
        await failing.waited()
        expect((await caches.open(STATIC_CACHE)).entries.size).toBe(0)

        const ok = dispatchFetch(get(`${ORIGIN}/icon.svg`), () => Promise.resolve(browserResponse('<svg/>')))
        expect(await (await ok.responded()).text()).toBe('<svg/>')
        await ok.waited()
        expect((await caches.open(STATIC_CACHE)).entries.has(`${ORIGIN}/icon.svg`)).toBe(true)
    })

    it('serves /_nuxt/ chunks network-first and falls back to the cache offline', async () => {
        const online = dispatchFetch(get(`${ORIGIN}/_nuxt/entry.abc123.js`), () => Promise.resolve(browserResponse('fresh')))
        expect(await (await online.responded()).text()).toBe('fresh')
        await online.waited()

        const offlineEvent = dispatchFetch(get(`${ORIGIN}/_nuxt/entry.abc123.js`), offline)
        expect(await (await offlineEvent.responded()).text()).toBe('fresh')
    })

    it('passes partial (206) range responses through without caching them', async () => {
        const event = dispatchFetch(get(`${ORIGIN}/api/files/abc/voice.webm`), () => Promise.resolve(browserResponse('bytes 0-1/2048', { status: 206 })))
        const response = await event.responded()
        expect(response.status).toBe(206)
        expect(await response.text()).toBe('bytes 0-1/2048')
        await expect(event.waited()).resolves.toBeUndefined()
        expect((await caches.open(RUNTIME_CACHE)).entries.size).toBe(0)
    })

    it('serves cached GET /api/** reads offline and rejects never-cached ones', async () => {
        await seed(RUNTIME_CACHE, `${ORIGIN}/api/orders`, '{"orders":[]}')
        const cached = dispatchFetch(get(`${ORIGIN}/api/orders`), offline)
        expect(await (await cached.responded()).text()).toBe('{"orders":[]}')

        const missing = dispatchFetch(get(`${ORIGIN}/api/never-seen`), offline)
        await expect(missing.responded()).rejects.toThrow('offline and not cached')
    })

    it('never intercepts the SSE stream, mutations, or cross-origin requests', async () => {
        for (const request of [
            get(`${ORIGIN}/api/connections`),
            { url: `${ORIGIN}/api/orders`, method: 'POST', mode: 'same-origin' },
            get('https://cdn.test/library.js')
        ]) {
            const event = dispatchFetch(request, offline)
            expect(event.responded()).toBe(null)
            expect(event.networkUsed()).toBe(false)
        }
    })

    it('serves offline navigations from the cached page, then the root shell', async () => {
        await seed(RUNTIME_CACHE, `${ORIGIN}/`, '<html>shell</html>')
        const toRoot = dispatchFetch(get(`${ORIGIN}/`, 'navigate'), offline)
        expect(await (await toRoot.responded()).text()).toBe('<html>shell</html>')

        await seed(RUNTIME_CACHE, `${ORIGIN}/orders`, '<html>orders</html>')
        const toPage = dispatchFetch(get(`${ORIGIN}/orders`, 'navigate'), offline)
        expect(await (await toPage.responded()).text()).toBe('<html>orders</html>')
    })

    it('keeps online navigations fresh and caches them for later offline use', async () => {
        const event = dispatchFetch(get(`${ORIGIN}/orders`, 'navigate'), () => Promise.resolve(browserResponse('<html>live</html>')))
        expect(await (await event.responded()).text()).toBe('<html>live</html>')
        await event.waited()

        const offlineReload = dispatchFetch(get(`${ORIGIN}/orders`, 'navigate'), offline)
        expect(await (await offlineReload.responded()).text()).toBe('<html>live</html>')
    })

    it('remembers the last cached navigation document as the offline shell', async () => {
        const event = dispatchFetch(get(`${ORIGIN}/orders`, 'navigate'), () => Promise.resolve(browserResponse('<html>live</html>')))
        await event.responded()
        await event.waited()
        const marker = await (await caches.open(RUNTIME_CACHE)).match('/__perigram-shell')
        expect(await marker.text()).toBe(`${ORIGIN}/orders`)
    })

    it('never caches opaque-redirect navigations or disturbs the shell marker', async () => {
        await seed(RUNTIME_CACHE, '/__perigram-shell', `${ORIGIN}/orders`)
        // Navigation requests carry redirect mode 'manual': the fetch
        // resolves to an opaque-redirect response (authenticated `/` is an
        // SSR redirect), which must stay out of the cache.
        const redirect = { ok: false, status: 0, type: 'opaqueredirect', clone() { return this } }
        const event = dispatchFetch(get(`${ORIGIN}/`, 'navigate'), () => Promise.resolve(redirect))
        expect(await event.responded()).toBe(redirect)
        await event.waited()
        const runtime = await caches.open(RUNTIME_CACHE)
        expect(runtime.entries.has(`${ORIGIN}/`)).toBe(false)
        const marker = await runtime.match('/__perigram-shell')
        expect(await marker.text()).toBe(`${ORIGIN}/orders`)
    })

    it('serves the remembered shell to an offline launch when `/` was never cached', async () => {
        await seed(RUNTIME_CACHE, `${ORIGIN}/orders`, '<html>orders</html>')
        await seed(RUNTIME_CACHE, '/__perigram-shell', `${ORIGIN}/orders`)
        const launch = dispatchFetch(get(`${ORIGIN}/`, 'navigate'), offline)
        expect(await (await launch.responded()).text()).toBe('<html>orders</html>')
    })

    it('prefers the exact cached document over the shell marker', async () => {
        await seed(RUNTIME_CACHE, `${ORIGIN}/orders`, '<html>orders</html>')
        await seed(RUNTIME_CACHE, `${ORIGIN}/other`, '<html>other</html>')
        await seed(RUNTIME_CACHE, '/__perigram-shell', `${ORIGIN}/orders`)
        const event = dispatchFetch(get(`${ORIGIN}/other`, 'navigate'), offline)
        expect(await (await event.responded()).text()).toBe('<html>other</html>')
    })

    it('purges caches outside the current version set on activate', async () => {
        await seed('perigram-static-v4', `${ORIGIN}/fonts/old.woff2`, 'old')
        await seed(STATIC_CACHE, `${ORIGIN}/icon.svg`, 'current')
        let activated = null
        listeners.get('activate')({ waitUntil: (promise) => { activated = promise } })
        await activated
        expect(await caches.keys()).toEqual([STATIC_CACHE])
    })
})
