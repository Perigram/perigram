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
  iconOnly: { type: Boolean, default: false }
});

const config = computed(() => {
    const s = props.state?.toUpperCase() || 'UNKNOWN';
    return STATUS_MAPPINGS[s] || STATUS_MAPPINGS[s.toLowerCase()] || { 
        label: s, 
        severity: 'secondary', 
        icon: 'pi pi-question-circle' 
    };
});
</script>

<template>
  <Tag 
    :severity="config.severity" 
    class="status-badge"
    :icon="config.icon"
  >
    <template v-if="!iconOnly">
        {{ $t(config.label) || config.label }}
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
