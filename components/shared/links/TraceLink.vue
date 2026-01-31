<template>
    <NuxtLink 
        :to="route" 
        class="inline-flex items-center gap-2 border rounded p-1 card-interactive no-underline"
    >
        <i :class="config.icon"></i>
        <span>
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