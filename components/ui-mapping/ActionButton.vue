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
import { resolveActionButton, actionLabelKey } from '#shared/ui-mapping/index.js';
import { isCreateAction } from '~/utils/action-visibility.js';
import { generatedCreateLabel } from '~/utils/generated-labels.js';

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
// Locale keys win (a synthesized action may pin its own — the construct
// re-run's `uiMapping.rederive`; authored actions their per-action key),
// then a host context label, then the localized create caption, then the
// resolver/authored label.
const label = computed(() => {
  const key = props.action.labelKey || actionLabelKey(props.action.id);
  if (te(key)) return t(key);
  if (props.label) return props.label;
  if (isCreateAction(props.action)) {
    const caption = generatedCreateLabel(props.action, { t, te });
    if (caption) return caption;
  }
  return resolved.value.label || props.action.label;
});
// The resolver's obvious-action channel: delete renders icon-only (the
// caption stays the tooltip and accessible name).
const iconOnly = computed(() => resolved.value.iconOnly === true);
</script>
