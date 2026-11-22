<template>
  <div class="rounded border border-surface p-3">
    <div v-if="view.phase === 'loading'" class="text-supporting text-muted">{{ t('editors.loadingGraphResult') }}</div>
    <div v-else-if="view.phase === 'unavailable'" class="text-supporting text-muted">{{ t('editors.graphResultUnavailable') }}</div>
    <template v-else>
      <div class="mb-2 flex items-center gap-2 text-supporting">
        <strong>{{ view.result.label }} · {{ view.result.itemCount }}</strong>
        <span v-if="view.mode === 'live'" class="text-muted">{{ t('editors.liveEvaluationMark') }}</span>
      </div>
      <div v-for="(item, index) in view.result.items" :key="index" class="py-1">
        <InstanceInlineRef v-if="item.kind === 'instance' || item.kind === 'record'" :type="item.typeId" :id="item.instanceId" :entity="item.instance" :fetch="false" />
        <span v-else-if="item.kind === 'unavailable'" class="text-supporting text-muted">{{ t('editors.linkedRecordUnavailable') }}</span>
        <GraphOutputView v-else :value="item.value" :alt="item.label || view.result.label" />
      </div>
      <div v-if="!view.result.items.length" class="text-supporting text-muted">{{ t('editors.noItems') }}</div>
      <div v-if="view.result.truncated" class="mt-2 text-supporting text-muted">{{ t('editors.showingFirstItems', { count: view.result.items.length }) }}</div>
    </template>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import InstanceInlineRef from '~/components/shared/InstanceInlineRef.vue';
import GraphOutputView from '~/components/shared/GraphOutputView.vue';
import { collectionEmbedView } from './graph-output-embed-contract.js';

const { t } = useI18n();
const props = defineProps({
  collection: { type: Object, required: true },
  // The page resolution entry for a live or parameterized embed (the
  // pages references seam answers those blocks).
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
    collection.resultPolicy,
    Array.isArray(collection.snapshot?.items) ? 'frozen' : '',
    Object.keys(collection.parameters || {}).length ? 'parameterized' : '',
    source.executionInstanceId, source.outputId, source.graphDocumentInstanceId, source.graphId, source.graphRevision
  ];
}, async ([policy, frozen, parameterized, executionId, outputId, graphDocumentInstanceId, graphId, graphRevision]) => {
  if (policy === 'live' || policy === 'frozen' || frozen || parameterized) {
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

</script>
