<template>
    <Dialog 
        v-bind="$attrs" 
        :modal="true" 
        :class="['w-full flex flex-col', sizeClass, fill ? 'max-h-dvh md:max-h-[calc(100dvh-2rem)]' : '']"
        :pt="fill ? { content: { class: 'flex min-h-0 flex-1 flex-col overflow-hidden' } } : undefined"
    >
        <template #header v-if="$slots.header">
            <slot name="header"></slot>
        </template>
        
        <slot></slot>
        
        <template #footer v-if="$slots.footer || showDefaultFooter">
            <slot name="footer">
                <Button :label="cancelLabel" text severity="secondary" @click="$emit('cancel')" />
                <Button :label="saveLabel" :loading="loading" @click="$emit('save')" />
            </slot>
        </template>
    </Dialog>
</template>

<script setup>
import { computed } from 'vue';
import Dialog from 'primevue/dialog';
import Button from 'primevue/button';

const props = defineProps({
    size: { type: String, default: 'md' }, // sm, md, lg, xl, full
    // Viewport-bounded dialog whose content owns the layout (no dialog
    // scrolling): the root is capped to the viewport and the content area
    // becomes a flex column. Used by media viewers and call surfaces.
    fill: { type: Boolean, default: false },
    showDefaultFooter: { type: Boolean, default: false },
    cancelLabel: { type: String, default: 'Cancel' },
    saveLabel: { type: String, default: 'Save' },
    loading: { type: Boolean, default: false }
});

defineEmits(['cancel', 'save']);

const sizeClass = computed(() => {
    switch (props.size) {
        case 'sm': return 'max-w-dialog-sm';
        case 'lg': return 'max-w-dialog-lg';
        case 'xl': return 'max-w-dialog-xl';
        case 'full': return 'max-w-full m-0 md:m-4';
        case 'md':
        default: return 'max-w-dialog-md';
    }
});
</script>
