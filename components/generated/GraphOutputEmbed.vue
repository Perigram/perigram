<template>
  <div class="my-2 rounded border border-surface p-3">
    <div v-if="loading" class="text-supporting text-muted">{{ t('processDesigner.loadingCollectionOutput') }}</div>
    <div v-else-if="error || !result" class="text-supporting text-muted">{{ t('processDesigner.collectionOutputUnavailable') }}</div>
    <template v-else>
      <div class="mb-2 text-supporting text-title">{{ result.label }} · {{ result.itemCount }}</div>
      <div v-for="(item, index) in result.items" :key="index" class="py-1">
        <InstanceInlineRef v-if="item.kind === 'instance'" :type="item.typeId" :id="item.instanceId" :entity="item.instance" :fetch="false" />
        <span v-else-if="item.kind === 'unavailable'" class="text-supporting text-muted">{{ t('processDesigner.referencedItemUnavailable') }}</span>
        <span v-else class="text-supporting">{{ displayValue(item.value) }}</span>
      </div>
      <div v-if="!result.items.length" class="text-supporting text-muted">{{ t('processDesigner.noItems') }}</div>
      <div v-if="result.truncated" class="mt-2 text-supporting text-muted">{{ t('processDesigner.showingFirstItems', { count: result.items.length }) }}</div>
    </template>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import InstanceInlineRef from '~/components/shared/InstanceInlineRef.vue';

const { t } = useI18n();
const props = defineProps({ collection: { type: Object, required: true } });
const result = ref(null);
const loading = ref(false);
const error = ref(false);
watch(() => [props.collection?.source?.executionInstanceId, props.collection?.source?.outputId, props.collection?.source?.graphDocumentInstanceId, props.collection?.source?.graphId, props.collection?.source?.graphRevision], async ([executionId, outputId, graphDocumentInstanceId, graphId, graphRevision]) => {
  if (!executionId || !outputId) { result.value = null; error.value = true; return; }
  loading.value = true;
  error.value = false;
  try {
    result.value = await $fetch(`/api/graph-executions/collection-outputs/${encodeURIComponent(executionId)}/${encodeURIComponent(outputId)}`, { query: { graphDocumentInstanceId, graphId, graphRevision } });
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
