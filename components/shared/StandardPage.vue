<template>
    <div class="flex flex-col gap-6 w-full max-w-app mx-auto">
        <div v-if="title || $slots.header" class="flex flex-col gap-2">
            <slot v-if="$slots.header" name="header"></slot>
            <slot name="breadcrumbs"></slot>
            <ActionToolbar v-if="!$slots.header" :title="title" :subtitle="subtitle" :level="1">
                <template #title>
                    <div class="flex items-center gap-3">
                        <!-- <span v-if="title">{{ title }}</span> -->
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
import ActionToolbar from './ActionToolbar.vue';

defineProps({
    title: { type: String, default: null },
    subtitle: { type: String, default: null }
});
</script>
