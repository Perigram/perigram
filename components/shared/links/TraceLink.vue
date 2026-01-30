<template>
    <NuxtLink 
        :to="route" 
        class="inline-flex items-center gap-2 px-2 py-1 rounded bg-surface-0 dark:bg-surface-900 border border-surface-200 dark:border-surface-800 hover:border-primary transition-colors no-underline group shadow-sm"
    >
        <i :class="[config.icon, 'text-xs text-surface-400 group-hover:text-primary']"></i>
        <span class="text-xs font-mono font-bold text-surface-900 dark:text-surface-0">
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