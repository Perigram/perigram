<template>
    <div class="flex flex-col gap-6 p-4 md:p-6 w-full max-w-app mx-auto">
        <!-- Header -->
        <div class="flex flex-col md:flex-row gap-4 md:items-center justify-between" v-if="title || $slots.header">
            <div class="flex flex-col gap-2">
                <slot name="breadcrumbs"></slot>
                <div class="flex items-center gap-3">
                    <h1 class="text-2xl font-semibold m-0" v-if="title">{{ title }}</h1>
                    <slot name="title-append"></slot>
                </div>
                <p v-if="subtitle" class="text-muted-color m-0">{{ subtitle }}</p>
            </div>
            <div class="flex items-center gap-2" v-if="$slots.actions">
                <slot name="actions"></slot>
            </div>
        </div>

        <slot></slot>
    </div>
</template>

<script setup>
defineProps({
    title: { type: String, default: null },
    subtitle: { type: String, default: null }
});
</script>
