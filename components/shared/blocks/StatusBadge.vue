<script setup>
/**
 * StatusBadge - v24 Standardized
 * Atomic component for mapping status strings to PrimeVue severities and icons.
 */
import Tag from 'primevue/tag';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { STATUS_MAPPINGS } from '~/utils/status-engine';

const props = defineProps({
  state: { type: String, required: true },
  iconOnly: { type: Boolean, default: false },
  display: { type: Object, default: null }
});

const { t, te } = useI18n();

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

const label = computed(() => {
    const value = config.value.label;
    return te(value) ? t(value) : value;
});
const dotClass = computed(() => ({
    success: 'bg-status-success',
    info: 'bg-status-info',
    warn: 'bg-status-warning',
    warning: 'bg-status-warning',
    danger: 'bg-status-danger',
    primary: 'bg-primary',
    secondary: 'bg-status-neutral'
}[config.value.severity] || 'bg-status-neutral'));
</script>

<template>
  <span
    v-if="iconOnly"
    class="status-badge-glyph inline-flex h-5 w-5 shrink-0 items-center justify-center"
    role="img"
    :aria-label="label"
    :title="label"
  >
    <span class="h-1.5 w-1.5 rounded-full" :class="dotClass" aria-hidden="true" />
  </span>
  <Tag
    v-else
    :severity="config.severity" 
    class="status-badge max-w-full min-w-0"
    :icon="config.icon"
  >
    <span class="min-w-0 truncate">{{ label }}</span>
  </Tag>
</template>

<style scoped>
.status-badge {
    text-transform: uppercase;
    font-size: 0.7rem;
    font-weight: 700;
}

</style>
