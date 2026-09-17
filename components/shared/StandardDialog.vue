<template>
    <Dialog 
        v-bind="$attrs" 
        :modal="true" 
        :class="['w-full', sizeClass]"
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
    size: { type: String, default: 'md' }, // sm, md, lg, xl, full, fullscreen
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
        case 'full': return 'max-w-full m-4';
        case 'fullscreen': return '';
        case 'md':
        default: return 'max-w-dialog-md';
    }
});
</script>
