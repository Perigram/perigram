import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useReducedMotion } from './useReducedMotion.js'

let gsapLoader = null

/**
 * Lazily loads the GSAP engine. GSAP never belongs to the SSR critical path:
 * every pattern below only requests it from client lifecycle hooks, so the
 * engine chunk loads once per session on first animated interaction.
 */
export const loadGsap = () => {
    if (!gsapLoader) {
        gsapLoader = import('gsap').then(module => module.gsap ?? module.default)
    }
    return gsapLoader
}

/**
 * Enter/exit presence for a single element (tooltips, drawers, message rows).
 * The element stays mounted; visibility animates opacity plus a vertical
 * offset. Reduced motion resolves to an immediate show/hide with no spatial
 * movement. Callers own the element's initial hidden style.
 */
export function useEnterExit(elRef, active, { y = 6, duration = 0.16 } = {}) {
    const reducedMotion = useReducedMotion()
    let engine = null

    onMounted(async () => { engine = await loadGsap() })

    watch(active, async visible => {
        const el = elRef.value
        if (!el) return
        if (!engine) {
            el.style.opacity = visible ? '1' : '0'
            return
        }
        if (reducedMotion.value) {
            engine.set(el, { opacity: visible ? 1 : 0, y: 0 })
            return
        }
        engine.to(el, {
            opacity: visible ? 1 : 0,
            y: visible ? -y : 0,
            duration,
            ease: 'power2.out',
            overwrite: true
        })
    })
}

/**
 * One-shot enter for freshly appended rows (streamed chat messages, live list
 * items). Fire-and-forget: animates the element from transparent/offset to
 * its natural state and leaves it mounted. Reduced motion is a no-op.
 */
export function enterOnce(element, { y = 8, duration = 0.2 } = {}) {
    if (!element || !import.meta.client) return
    loadGsap().then(engine => {
        if (reducedMotionActive(element)) return
        engine.fromTo(
            element,
            { opacity: 0, y },
            { opacity: 1, y: 0, duration, ease: 'power2.out', clearProps: 'opacity,transform' }
        )
    })
}

const reducedMotionActive = () => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Transient badge motion (floating reactions): the element rises and fades
 * out once, then the caller removes it. Returns a promise that settles when
 * the animation completes; reduced motion resolves immediately so cleanup
 * paths behave identically.
 */
export function riseAndFade(element, { y = -120, duration = 1.6 } = {}) {
    if (!element || !import.meta.client) return Promise.resolve()
    if (reducedMotionActive()) return Promise.resolve()
    return loadGsap().then(engine => {
        const tween = engine.to(element, { y, opacity: 0, duration, ease: 'power1.out' })
        return tween.then ? tween.then(() => {}) : Promise.resolve()
    })
}

/**
 * Parameter-to-state transition. When an input parameter drives a re-render
 * (cassette dimensions, geometry parameters), call `capture()` while the
 * previous rendered state is still in the DOM, then let the reactive update
 * replace it and call `play()`: the cloned previous state crossfades out over
 * the new one. The animation always starts from the real previous state, never
 * from defaults. Reduced motion skips the overlay entirely. The container must
 * own `position: relative` and clip overflow.
 */
export function useStateTransition(containerRef, { duration = 0.4, scale = 0.985 } = {}) {
    const reducedMotion = useReducedMotion()
    let overlay = null
    let engine = null

    onMounted(async () => { engine = await loadGsap() })

    const capture = () => {
        const container = containerRef.value
        if (!container || reducedMotion.value) return
        const live = container.firstElementChild
        if (!live || container.contains(overlay)) return
        overlay = live.cloneNode(true)
        overlay.setAttribute('aria-hidden', 'true')
        Object.assign(overlay.style, {
            position: 'absolute',
            inset: '0',
            pointerEvents: 'none',
            transformOrigin: 'center'
        })
        container.appendChild(overlay)
    }

    const play = async () => {
        const node = overlay
        overlay = null
        if (!node) return
        await nextTick()
        await new Promise(resolve => requestAnimationFrame(resolve))
        if (!engine) {
            node.remove()
            return
        }
        engine.to(node, {
            opacity: 0,
            scale,
            duration,
            ease: 'power2.out',
            onComplete: () => node.remove()
        })
    }

    const cancel = () => {
        overlay?.remove()
        overlay = null
    }

    onUnmounted(cancel)

    return { capture, play, cancel }
}
