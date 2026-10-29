<template>
    <NuxtLink
        v-if="!disabled"
        :to="route"
        class="inline-flex min-w-0 items-center gap-1.5 rounded-ui p-1"
        data-instance-card-interactive="true"
        @click.stop="requestCloseMobileTransientSurfaces"
    >
        <i :class="config.icon" class="shrink-0"></i>
        <span class="truncate">
            {{ text }}
        </span>
    </NuxtLink>
    <span
        v-else
        class="inline-flex min-w-0 items-center gap-1.5 rounded-ui p-1 text-muted"
        data-instance-card-interactive="true"
    >
        <i :class="config.icon" class="shrink-0"></i>
        <span class="truncate">
            {{ text }}
        </span>
    </span>
</template>

<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRegistryStore } from '~/stores/registry';
import { generatedEntityLabel } from '~/utils/generated-labels.js';
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
const { t, te } = useI18n();
const config = computed(() => ({ icon: registry.iconFor(props.type) }));
// An ancestor whose name never resolves (deleted parent, unreadable ref)
// reads as its entity type label — record ids never render in the UI.
const typeLabel = computed(() => generatedEntityLabel(props.type, { t, te }));
const text = computed(() => props.label || props.fallbackLabel || typeLabel.value);


const route = computed(() => {
    if (props.to) return props.to;
    if (typeof config.value.route === 'function') {
        return config.value.route(props.id, props.slug);
    }
    return '#';
});
</script>
