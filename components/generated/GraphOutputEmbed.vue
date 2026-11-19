<template>
  <div class="my-2 rounded border border-surface p-3">
    <div v-if="view.phase === 'loading'" class="text-supporting text-muted">{{ t('processDesigner.loadingCollectionOutput') }}</div>
    <div v-else-if="view.phase === 'unavailable'" class="text-supporting text-muted">{{ t('processDesigner.collectionOutputUnavailable') }}</div>
    <template v-else>
      <div class="mb-2 text-supporting"><strong>{{ view.result.label }} · {{ view.result.itemCount }}</strong></div>
      <div v-for="(item, index) in view.result.items" :key="index" class="py-1">
        <InstanceInlineRef v-if="item.kind === 'instance'" :type="item.typeId" :id="item.instanceId" :entity="item.instance" :fetch="false" />
        <span v-else-if="item.kind === 'unavailable'" class="text-supporting text-muted">{{ t('processDesigner.referencedItemUnavailable') }}</span>
        <span v-else class="text-supporting">{{ displayValue(item.value) }}</span>
      </div>
      <div v-if="!view.result.items.length" class="text-supporting text-muted">{{ t('processDesigner.noItems') }}</div>
      <div v-if="view.result.truncated" class="mt-2 text-supporting text-muted">{{ t('processDesigner.showingFirstItems', { count: view.result.items.length }) }}</div>
    </template>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import InstanceInlineRef from '~/components/shared/InstanceInlineRef.vue';
import { collectionEmbedView } from './graph-output-embed-contract.js';

const { t } = useI18n();
const props = defineProps({
  collection: { type: Object, required: true },
  // The page resolution entry for a parameterized embed (the pages
  // references seam answers parameterized collection blocks).
  resolution: { type: Object, default: null }
});
const live = ref(null);
const loading = ref(false);
const view = computed(() => collectionEmbedView({
  collection: props.collection,
  resolution: props.resolution,
  live: live.value,
  loading: loading.value
}));
watch(() => {
  const collection = props.collection || {};
  const source = collection.source || {};
  return [
    Array.isArray(collection.snapshot?.items) ? 'frozen' : '',
    Object.keys(collection.parameters || {}).length ? 'parameterized' : '',
    source.executionInstanceId, source.outputId, source.graphDocumentInstanceId, source.graphId, source.graphRevision
  ];
}, async ([frozen, parameterized, executionId, outputId, graphDocumentInstanceId, graphId, graphRevision]) => {
  if (frozen || parameterized) {
    live.value = null;
    return;
  }
  if (!executionId || !outputId) {
    live.value = null;
    return;
  }
  loading.value = true;
  try {
    live.value = await $fetch(`/api/graph-executions/collection-outputs/${encodeURIComponent(executionId)}/${encodeURIComponent(outputId)}`, { query: { graphDocumentInstanceId, graphId, graphRevision } });
  } catch {
    live.value = null;
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
