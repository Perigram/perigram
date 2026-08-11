import { onMounted, onUnmounted, readonly, ref } from 'vue'

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

/**
 * Returns the active operating-system motion preference for design-system
 * primitives. CSS uses the same query in assets/css/main.css.
 */
export function useReducedMotion() {
    const reducedMotion = ref(false)
    let mediaQuery = null

    const syncPreference = () => {
        reducedMotion.value = Boolean(mediaQuery?.matches)
    }

    onMounted(() => {
        if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return

        mediaQuery = window.matchMedia(REDUCED_MOTION_QUERY)
        syncPreference()
        mediaQuery.addEventListener('change', syncPreference)
    })

    onUnmounted(() => {
        mediaQuery?.removeEventListener('change', syncPreference)
    })

    return readonly(reducedMotion)
}
