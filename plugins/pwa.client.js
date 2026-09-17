export default defineNuxtPlugin(() => {
    if (!('serviceWorker' in navigator)) return
    window.addEventListener('load', () => {
        if (import.meta.dev) {
            // Dev self-heal: any worker left on this origin by an earlier
            // production build keeps its cache-first fetch handler through
            // every hard refresh, serving stale code for the paths it cached.
            // Dev never wants a worker here, so each load removes every
            // registration and its caches outright.
            navigator.serviceWorker.getRegistrations()
                .then(async (registrations) => {
                    await Promise.all(registrations.map(registration => registration.unregister()))
                    if (typeof caches !== 'undefined' && caches.keys) {
                        const keys = await caches.keys()
                        await Promise.all(keys.map(key => caches.delete(key)))
                    }
                })
                .catch(() => null)
            return
        }
        navigator.serviceWorker.register('/sw.js').catch((error) => {
            console.warn('service worker registration failed', error)
        })
    })
})
