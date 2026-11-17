<template>
  <div class="my-2">
    <div v-if="!result" class="text-sm text-muted">Loading reference…</div>
    <div v-else-if="result.status !== 'resolved'" class="text-sm text-muted">Referenced item is unavailable</div>
    <InstanceInlineRef
      v-else
      :type="result.typeId"
      :id="result.instanceId"
      :entity="entity"
      :revision="result.mode === 'pinned' ? result.revisionId : null"
      :fetch="false"
      variant="compact"
      :interactive="true"
    />
  </div>
</template>

<script setup>
import { computed } from 'vue';
import InstanceInlineRef from '~/components/shared/InstanceInlineRef.vue';

const props = defineProps({ result: { type: Object, default: null } });
const entity = computed(() => {
  if (props.result?.mode !== 'pinned') return props.result?.instance || null;
  const snapshot = props.result?.revision?.data?.snapshot;
  if (!snapshot) return null;
  return {
    _id: props.result.instanceId,
    type: props.result.typeId,
    ...snapshot
  };
});
</script>
