<script setup>
/**
 * StatusBadge - v24 Standardized
 * Atomic component for mapping status strings to PrimeVue severities and icons.
 */
import Tag from 'primevue/tag';
import { computed } from 'vue';
import { STATUS_MAPPINGS } from '~/utils/status-engine';

const props = defineProps({
  state: { type: String, required: true },
  iconOnly: { type: Boolean, default: false },
  display: { type: Object, default: null }
});

const config = computed(() => {
    const s = props.state?.toUpperCase() || 'UNKNOWN';
    const mapped = STATUS_MAPPINGS[s] || STATUS_MAPPINGS[s.toLowerCase()] || {
        label: s, 
        severity: 'secondary', 
        icon: 'pi pi-question-circle' 
    };
    const display = props.display && typeof props.display === 'object' ? props.display : {};
    return {
        ...mapped,
        label: display.label || mapped.label,
        severity: display.severity || display.color || mapped.severity,
        icon: display.icon || mapped.icon
    };
});
</script>

<template>
  <Tag 
    :severity="config.severity" 
    class="status-badge max-w-full min-w-0"
    :icon="config.icon"
  >
    <template v-if="!iconOnly">
        <span class="min-w-0 truncate">{{ $t(config.label) || config.label }}</span>
    </template>
  </Tag>
</template>

<style scoped>
.status-badge {
    text-transform: uppercase;
    font-size: 0.7rem;
    font-weight: 700;
}
</style>
