<template>
  <Button
    v-if="!resolved.hidden"
    :label="resolved.label || action.label"
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
import Button from 'primevue/button';
import { resolveActionButton } from '#shared/ui-mapping/index.js';

const props = defineProps({
  action: { type: Object, required: true },
  render: { type: Object, default: null }
});

defineEmits(['run']);

const resolved = computed(() => resolveActionButton(props.action, { render: props.render }));
</script>
