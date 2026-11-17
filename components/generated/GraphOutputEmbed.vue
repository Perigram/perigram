<template>
  <div class="my-2 rounded-lg border border-surface p-3">
    <div v-if="loading" class="text-sm text-muted">Loading collection…</div>
    <div v-else-if="error || !result" class="text-sm text-muted">Collection output is unavailable</div>
    <template v-else>
      <div class="mb-2 text-sm font-medium">{{ result.label }}</div>
      <div v-for="(item, index) in result.items" :key="index" class="py-1">
        <InstanceInlineRef v-if="item.kind === 'instance'" :type="item.typeId" :id="item.instanceId" :entity="item.instance" :fetch="false" />
        <span v-else-if="item.kind === 'unavailable'" class="text-sm text-muted">Referenced item is unavailable</span>
        <span v-else class="text-sm">{{ displayValue(item.value) }}</span>
      </div>
      <div v-if="!result.items.length" class="text-sm text-muted">No items</div>
    </template>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue';
import InstanceInlineRef from '~/components/shared/InstanceInlineRef.vue';

const props = defineProps({ collection: { type: Object, required: true } });
const result = ref(null);
const loading = ref(false);
const error = ref(false);
watch(() => [props.collection?.source?.executionInstanceId, props.collection?.source?.outputId], async ([executionId, outputId]) => {
  if (!executionId || !outputId) { result.value = null; error.value = true; return; }
  loading.value = true;
  error.value = false;
  try {
    result.value = await $fetch(`/api/graph-executions/collection-outputs/${encodeURIComponent(executionId)}/${encodeURIComponent(outputId)}`, { query: { graphDocumentInstanceId: props.collection.source.graphDocumentInstanceId, graphId: props.collection.source.graphId, graphRevision: props.collection.source.graphRevision } });
  } catch {
    result.value = null;
    error.value = true;
  } finally {
    loading.value = false;
  }
}, { immediate: true });
function displayValue(value) {
  if (value == null) return '—';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}
</script>
