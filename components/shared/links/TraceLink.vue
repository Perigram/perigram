<template>
    <NuxtLink
        :to="route"
        class="inline-flex min-w-0 items-center gap-1.5 rounded-ui p-1"
        data-entity-card-interactive="true"
        @click.stop
    >
        <i :class="config.icon" class="shrink-0"></i>
        <span class="truncate">
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
        type: [String, Number, Object],
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
