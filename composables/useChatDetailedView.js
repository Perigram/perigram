const STORAGE_PREFIX = 'perigram:chat-detailed-view:'
const STATE_KEY = 'chatDetailedView'
const HYDRATED_KEY = 'chatDetailedViewStorageKey'

// One persisted source for the chats "detailed" view: the inbox grouping
// toggle and the instance-thread children toggle read the SAME per-user
// boolean, inverted (see composables/README.md). Detailed ON lists every
// instance chat in the inbox and keeps threads on the instance's own
// messages; OFF groups the inbox to top-level nodes and composes threads
// into subtree views. The boolean lives in shared Nuxt state so every
// mounted chat surface (drawer, /chats rail, detail panels) agrees live,
// and mirrors to localStorage per user id so it survives reloads.
export function useChatDetailedView() {
    const authStore = useAuthStore()
    const detailed = useState(STATE_KEY, () => false)
    const hydratedKey = useState(HYDRATED_KEY, () => '')

    const storageKey = () => STORAGE_PREFIX + String(authStore.user?.userId || '')

    if (import.meta.client) {
        const key = storageKey()
        // Hydrate once per user-scoped key: login switches re-read, repeat
        // mounts of other chat surfaces keep the shared state.
        if (key && key !== hydratedKey.value) {
            hydratedKey.value = key
            try {
                detailed.value = window.localStorage.getItem(key) === '1'
            } catch {
                // Best-effort persistence: blocked storage keeps the default.
            }
        }
    }

    const setDetailed = (value) => {
        detailed.value = Boolean(value)
        if (import.meta.client) {
            try {
                window.localStorage.setItem(storageKey(), detailed.value ? '1' : '0')
            } catch {
                // Best-effort persistence: blocked storage never breaks the view.
            }
        }
    }

    return { detailed: computed({ get: () => detailed.value, set: setDetailed }) }
}
