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
 * Smoothed numeric follow value. Replaces per-element spring graphs: callers
 * recompute a target from real state (for example pointer proximity) and call
 * `set(target)` as often as the input fires; GSAP's quickTo tweens toward the
 * latest target. `jump(target)` snaps without animation and cancels in-flight
 * smoothing — the reduced-motion switch.
 */
export function useFollowValue(initial, { duration = 0.3, ease = 'power3.out' } = {}) {
    const current = ref(initial)
    const proxy = { value: initial }
    let apply = null
    let engine = null

    onMounted(async () => {
        engine = await loadGsap()
        apply = engine.quickTo(proxy, 'value', {
            duration,
            ease,
            onUpdate: () => { current.value = proxy.value }
        })
    })

    onUnmounted(() => { engine?.killTweensOf(proxy) })

    const set = target => {
        if (!apply) {
            proxy.value = target
            current.value = target
            return
        }
        apply(target)
    }

    const jump = target => {
        engine?.killTweensOf(proxy)
        proxy.value = target
        current.value = target
    }

    return { current, set, jump }
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
