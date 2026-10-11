<template>
    <div
        :class="[
            'flex w-full flex-col',
            workspace
                ? 'h-full min-h-0 max-w-none flex-1 gap-0 overflow-hidden'
                : 'mx-auto max-w-app gap-6'
        ]"
    >
        <div v-if="title || $slots.header" class="flex flex-col gap-2">
            <slot v-if="$slots.header" name="header"></slot>
            <slot name="breadcrumbs"></slot>
            <ActionToolbar v-if="!$slots.header" :title="title" :subtitle="subtitle" :level="1">
                <template #title>
                    <div class="flex items-center gap-3">
                        <Button
                            v-if="back"
                            :icon="back.icon || 'pi pi-arrow-left'"
                            :aria-label="back.label"
                            :title="back.label"
                            text
                            rounded
                            severity="secondary"
                            size="small"
                            class="shrink-0"
                            @click="back.command"
                        />
                        <span v-if="title">{{ title }}</span>
                        <slot name="title-append"></slot>
                    </div>
                </template>
                <template v-if="$slots.actions" #actions>
                    <slot name="actions"></slot>
                </template>
            </ActionToolbar>
        </div>

        <slot></slot>
    </div>
</template>

<script setup>
import Button from 'primevue/button';
import ActionToolbar from './ActionToolbar.vue';

defineProps({
    title: { type: String, default: null },
    subtitle: { type: String, default: null },
    workspace: { type: Boolean, default: false },
    // Routed-surface back control (`{ icon, label, command }` — the
    // shared usePageBack shape). Panes never pass it: their tab strip is
    // the navigation.
    back: { type: Object, default: null }
});
</script>

