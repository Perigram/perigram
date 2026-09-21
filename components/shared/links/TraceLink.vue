<template>
    <NuxtLink
        v-if="!disabled"
        :to="route"
        class="inline-flex min-w-0 items-center gap-1.5 rounded-ui p-1"
        data-entity-card-interactive="true"
        @click.stop="requestCloseMobileTransientSurfaces"
    >
        <i :class="config.icon" class="shrink-0"></i>
        <span class="truncate">
            {{ label || fallbackLabel || id }}
        </span>
    </NuxtLink>
    <span
        v-else
        class="inline-flex min-w-0 items-center gap-1.5 rounded-ui p-1 text-muted"
        data-entity-card-interactive="true"
    >
        <i :class="config.icon" class="shrink-0"></i>
        <span class="truncate">
            {{ label || fallbackLabel || id }}
        </span>
    </span>
</template>

<script setup>
import { computed } from 'vue';
import { entityUiFor } from '~/utils/status-engine';
import { useRegistryStore } from '~/stores/registry';
import { requestCloseMobileTransientSurfaces } from '~/utils/mobile-transient-surfaces.js';

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
    fallbackLabel: {
        type: String,
        default: ''
    },
    to: {
        type: [String, Object],
        default: null
    },
    disabled: {
        type: Boolean,
        default: false
    },
    slug: {
        type: String,
        default: ''
    }
});

const registry = useRegistryStore();
const config = computed(() => ({ ...entityUiFor(props.type), icon: registry.iconFor(props.type) }));

const route = computed(() => {
    if (props.to) return props.to;
    if (typeof config.value.route === 'function') {
        return config.value.route(props.id, props.slug);
    }
    return '#';
});
</script>
