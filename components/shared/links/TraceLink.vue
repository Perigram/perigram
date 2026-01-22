<template>
    <NuxtLink 
        :to="route" 
        class="inline-flex items-center gap-2 px-2 py-1 rounded bg-[var(--p-content-background)] border border-[var(--p-content-border-color)] hover:border-[var(--p-primary-color)] transition-colors no-underline group shadow-sm"
    >
        <i :class="[config.icon, 'text-xs text-[var(--p-text-muted-color)] group-hover:text-primary']"></i>
        <span class="text-xs font-mono font-bold text-[var(--p-text-color)]">
            {{ label || id }}
        </span>
    </NuxtLink>
</template>

<script setup>
import { computed } from 'vue';
import { ENTITY_UI } from '~/utils/status-engine';

const props = defineProps({
    type: {
        type: String,
        required: true
    },
    id: {
        type: String,
        required: true
    },
    label: {
        type: String,
        default: ''
    },
    slug: {
        type: String,
        default: ''
    }
});

const config = computed(() => ENTITY_UI[props.type] || { icon: 'pi pi-link', route: () => '#' });

const route = computed(() => {
    if (typeof config.value.route === 'function') {
        return config.value.route(props.id, props.slug);
    }
    return '#';
});
</script>