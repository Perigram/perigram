<template>
    <div class="h-full">
        <Card class="h-full">
            <template #title v-if="title || $slots.title">
                <slot name="title">{{ title }}</slot>
            </template>
            <template #subtitle v-if="subtitle || $slots.subtitle">
                <slot name="subtitle">{{ subtitle }}</slot>
            </template>
            <template #content>
                <slot></slot>
            </template>
            <template #footer v-if="$slots.footer">
                <slot name="footer"></slot>
            </template>
        </Card>
    </div>
</template>

<script setup>
import Card from 'primevue/card';

defineProps({
    title: { type: String, default: null },
    subtitle: { type: String, default: null },
    variant: { type: String, default: 'default' } // default, outlined
});
</script>
