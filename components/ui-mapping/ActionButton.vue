<template>
  <Button
    v-if="!resolved.hidden"
    :label="iconOnly ? undefined : label"
    :aria-label="label"
    :title="iconOnly ? label : undefined"
    :severity="resolved.severity || (resolved.tone === 'danger' ? 'danger' : resolved.tone === 'primary' ? undefined : 'secondary')"
    :outlined="!iconOnly && !menuItem && resolved.tone === 'secondary'"
    :text="iconOnly || menuItem || resolved.tone === 'text'"
    :rounded="iconOnly"
    :icon="resolved.icon || undefined"
    :class="menuItem ? 'w-full justify-start whitespace-normal text-left' : null"
    size="small"
    @click="$emit('run', action)"
  />
</template>

<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
import { resolveActionButton, actionLabelKey, localizedLabel } from '#shared/ui-mapping/index.js';

const props = defineProps({
  action: { type: Object, required: true },
  render: { type: Object, default: null },
  // Context-supplied caption: a host surface that already names the action's
  // target may shorten the button (a relation section's "Link"). Locale
  // overrides for the action key still win.
  label: { type: String, default: null },
  // The region's per-type state policy map: state-toned transition buttons
  // resolve their label/severity/icon from the compiled flat vocabulary.
  statePolicy: { type: Object, default: null },
  // Menu-row presentation: the same button rendered as a full-width
  // start-aligned row inside a popover menu.
  menuItem: { type: Boolean, default: false }
});

defineEmits(['run']);

const { te, t } = useI18n();
const resolved = computed(() => resolveActionButton(props.action, { render: props.render, statePolicy: props.statePolicy }));
const label = computed(() => localizedLabel(
  { te, t },
  // A synthesized action may pin its own key (the construct re-run's
  // `uiMapping.rederive`); authored actions resolve their stable
  // per-action key.
  props.action.labelKey || actionLabelKey(props.action.id),
  props.label ?? (resolved.value.label || props.action.label)
));
// The resolver's obvious-action channel: delete renders icon-only (the
// caption stays the tooltip and accessible name).
const iconOnly = computed(() => resolved.value.iconOnly === true);
</script>
