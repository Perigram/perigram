<script setup>
/**
 * StatusBadge - v24 Standardized
 * Atomic status chip. Display policy resolves from the compiled contract:
 * process-authored DTO metadata (`status.metadata.display`) wins, then the
 * served type view's per-state display policy (`states.main.render` through
 * the registry bundle), then a neutral chip carrying the raw value — the
 * stop-line for genuinely undeclared types. No legacy domain status table.
 */
import Tag from 'primevue/tag';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRegistryStore } from '~/stores/registry';
import { kebabStateTypeId, resolveStateDisplay } from '~/utils/state-engine';

const props = defineProps({
  state: { type: String, required: true },
  typeId: { type: String, default: '' },
  iconOnly: { type: Boolean, default: false },
  display: { type: Object, default: null }
});

const registry = useRegistryStore();
const { t, te } = useI18n();

const config = computed(() => {
    const authored = props.display && typeof props.display === 'object' ? props.display : {};
    const policy = resolveStateDisplay(
        props.typeId ? registry.statesOf(kebabStateTypeId(props.typeId)) : null,
        props.state
    );
    return {
        label: authored.label || policy.label,
        severity: authored.severity || authored.color || policy.severity,
        icon: authored.icon || policy.icon
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
    class="max-w-full min-w-0 uppercase text-label"
    :icon="config.icon"
  >
    <span class="min-w-0 truncate">{{ label }}</span>
  </Tag>
</template>
