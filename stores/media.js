import { defineStore } from 'pinia';
import { ref } from 'vue';

/**
 * The app's now-playing channel (see components/media/README.md): exactly
 * one media element plays at a time across every surface. Inline
 * audio/video elements claim playback when they start; a source surface
 * that unmounts mid-playback hands the dock a descriptor (url, kind,
 * title, position) and the dock resumes it in its own element — media
 * elements cannot survive their Vue-managed template parents, so the dock
 * re-creates them and seeks to the handed-over position.
 */
export const useMediaStore = defineStore('media', () => {
    // The docked item descriptor the app-shell dock renders, or null.
    const docked = ref(null);

    // The element currently holding playback (inline or dock-owned);
    // module-local because it is never render state.
    let currentEl = null;
    let dockEl = null;

    function pauseCurrent() {
        try {
            currentEl?.pause?.();
        } catch {
            /* the element may already be gone with its surface */
        }
    }

    /**
     * Single-play policy: a media element starting playback claims the
     * channel and pauses whatever played before it.
     */
    function claim(el) {
        if (!el || currentEl === el) return;
        pauseCurrent();
        currentEl = el;
    }

    /** The dock registers its own element so dismissal stops exactly it. */
    function setDockElement(el) {
        dockEl = el || null;
    }

    /** Hands a dying source's playback to the dock (idempotent replace). */
    function adopt(meta = null) {
        docked.value = meta ? { ...meta } : null;
    }

    /** Stops and clears the docked item. */
    function dismiss() {
        try {
            dockEl?.pause?.();
        } catch {
            /* best-effort */
        }
        if (currentEl === dockEl) currentEl = null;
        dockEl = null;
        docked.value = null;
    }

    return { docked, claim, adopt, dismiss, setDockElement };
});
