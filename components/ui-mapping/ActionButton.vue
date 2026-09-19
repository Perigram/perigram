<template>
  <Button
    v-if="!resolved.hidden"
    :label="label"
    :aria-label="label"
    :severity="resolved.severity || (resolved.tone === 'danger' ? 'danger' : resolved.tone === 'primary' ? undefined : 'secondary')"
    :outlined="resolved.tone === 'secondary'"
    :text="resolved.tone === 'text'"
    :icon="resolved.icon || undefined"
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
  render: { type: Object, default: null }
});

defineEmits(['run']);

const { te, t } = useI18n();
const resolved = computed(() => resolveActionButton(props.action, { render: props.render }));
const label = computed(() => localizedLabel({ te, t }, actionLabelKey(props.action.id), resolved.value.label || props.action.label));
</script>
