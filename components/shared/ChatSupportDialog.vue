<template>
    <!-- Shared chat popup (the one sanctioned raw-Dialog home for this
         pattern): PrimeVue owns stacking, the app tokens supply the surface,
         and the chat component supplies its own headers and controls, so the
         Dialog header stays hidden. Non-modal on purpose: desktop keeps
         working under the chat. -->
    <Dialog
        v-model:visible="visibleModel"
        :close-on-escape="false"
        :aria-label="label"
        position="bottomright"
        :style="{ width: 'min(94vw, 25rem)' }"
        :pt="chatDialogPt"
    >
        <!-- Height lives on this dedicated wrapper: the ChatSupport root
             already carries h-full, and merging a second height utility
             there resolves by CSS order — that produced the content-driven
             (growing) dialog. -->
        <div v-if="visibleModel" class="h-support-chat max-h-[calc(100dvh-6rem)]">
            <slot />
        </div>
    </Dialog>
</template>

<script setup>
import Dialog from 'primevue/dialog';

const props = defineProps({
    visible: { type: Boolean, default: false },
    label: { type: String, default: '' }
});

const emit = defineEmits(['update:visible']);

const visibleModel = computed({
    get: () => props.visible,
    set: value => emit('update:visible', value)
});

// Popup chrome pass-through: Dialog supplies structure and stacking, the
// app tokens supply the surface (Dialog's own background token is a lighter
// gray — the chat must match the content surface everywhere else).
const chatDialogPt = {
    root: { class: 'bg-content !rounded-ui' },
    header: { class: 'hidden' },
    content: { class: 'p-0 overflow-hidden' }
};
</script>
