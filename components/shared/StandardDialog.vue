<template>
    <Dialog
        v-bind="$attrs"
        :modal="true"
        :class="['w-full flex flex-col', sizeClass, fill ? 'max-h-dvh md:max-h-[calc(100dvh-2rem)]' : '']"
        :pt="fill ? { content: { class: 'flex min-h-0 flex-1 flex-col overflow-hidden' } } : undefined"
    >
        <template #header v-if="$slots.header || hasHeader">
            <slot name="header">
                <div class="flex min-w-0 flex-1 items-center gap-2">
                    <div v-if="title || subtitle" class="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span v-if="title" class="min-w-0 truncate text-label">{{ title }}</span>
                        <small v-if="subtitle" class="min-w-0 truncate text-muted text-supporting">{{ subtitle }}</small>
                    </div>
                    <div v-if="$slots['header-actions']" class="ml-auto flex shrink-0 items-center gap-1">
                        <slot name="header-actions" />
                    </div>
                </div>
            </slot>
        </template>

        <slot></slot>

        <template #footer v-if="$slots.footer || showDefaultFooter">
            <slot name="footer">
                <Button :label="resolvedCancelLabel" text severity="secondary" @click="$emit('cancel')" />
                <Button :label="resolvedSaveLabel" :loading="loading" :disabled="saveDisabled" @click="$emit('save')" />
            </slot>
        </template>
    </Dialog>
</template>

<script setup>
import { computed, useSlots } from 'vue';
import Dialog from 'primevue/dialog';
import Button from 'primevue/button';
import { useI18n } from 'vue-i18n';

const props = defineProps({
    size: { type: String, default: 'md' }, // sm, md, lg, xl, full
    // Viewport-bounded dialog whose content owns the layout (no dialog
    // scrolling): the root is capped to the viewport and the content area
    // becomes a flex column. Used by media viewers and call surfaces.
    fill: { type: Boolean, default: false },
    // The popup header row for dynamic titles: a truncating title, an
    // optional muted subtitle, and trailing #header-actions before the
    // dialog's close button. Static-label dialogs keep PrimeVue's own
    // `header` attr.
    title: { type: String, default: '' },
    subtitle: { type: String, default: '' },
    showDefaultFooter: { type: Boolean, default: false },
    // Default footer labels resolve through i18n (`common.cancel`,
    // `common.save`); the props override for domain-specific verbs.
    cancelLabel: { type: String, default: null },
    saveLabel: { type: String, default: null },
    loading: { type: Boolean, default: false },
    saveDisabled: { type: Boolean, default: false }
});

defineEmits(['cancel', 'save']);

const { t } = useI18n();
const resolvedCancelLabel = computed(() => props.cancelLabel ?? t('common.cancel'));
const resolvedSaveLabel = computed(() => props.saveLabel ?? t('common.save'));

const slots = useSlots();
const hasHeader = computed(() => Boolean(props.title || props.subtitle || slots['header-actions']));
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
