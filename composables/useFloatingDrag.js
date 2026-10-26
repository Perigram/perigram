import { onBeforeUnmount, ref } from 'vue';

const clamp = (value, min, max) => Math.max(min, Math.min(value, max));

// Pointer drag for floating panels (the call window, the media card): the
// element follows the pointer clamped to the viewport and its resting
// position persists per browser under `storageKey`.
export function useFloatingDrag({ storageKey = '' } = {}) {
    let dragState = null;
    let last = null;
    const dragging = ref(false);

    const readPersisted = () => {
        try {
            const raw = JSON.parse(window.localStorage.getItem(storageKey) || 'null');
            if (!raw || !Number.isFinite(raw.left) || !Number.isFinite(raw.top)) return null;
            return raw;
        } catch {
            return null;
        }
    };

    // Applies a persisted position to a freshly mounted panel.
    const applyPersisted = (el) => {
        if (!el) return;
        const raw = readPersisted();
        if (!raw) return;
        el.style.right = 'auto';
        el.style.left = `${clamp(raw.left, 0, window.innerWidth - 80)}px`;
        el.style.top = `${clamp(raw.top, 0, window.innerHeight - 48)}px`;
    };

    const startDrag = (event, el) => {
        if (!el) return;
        if (event.button !== 0 && event.pointerType === 'mouse') return;
        const rect = el.getBoundingClientRect();
        dragState = { el, startX: event.clientX, startY: event.clientY, left: rect.left, top: rect.top };
        dragging.value = true;
        el.style.right = 'auto';
        el.style.bottom = 'auto';
        el.style.left = `${rect.left}px`;
        el.style.top = `${rect.top}px`;
        window.addEventListener('pointermove', moveDrag);
        window.addEventListener('pointerup', endDrag);
        event.preventDefault();
    };

    const moveDrag = (event) => {
        if (!dragState) return;
        const left = clamp(dragState.left + event.clientX - dragState.startX, 0, window.innerWidth - 80);
        const top = clamp(dragState.top + event.clientY - dragState.startY, 0, window.innerHeight - 48);
        dragState.el.style.left = `${left}px`;
        dragState.el.style.top = `${top}px`;
        last = { left, top };
    };

    const endDrag = () => {
        dragState = null;
        dragging.value = false;
        if (last) {
            try {
                window.localStorage.setItem(storageKey, JSON.stringify(last));
            } catch {
                // Storage is best-effort; the session keeps its position.
            }
        }
        window.removeEventListener('pointermove', moveDrag);
        window.removeEventListener('pointerup', endDrag);
    };

    onBeforeUnmount(() => {
        window.removeEventListener('pointermove', moveDrag);
        window.removeEventListener('pointerup', endDrag);
    });

    return { startDrag, applyPersisted, dragging };
}
