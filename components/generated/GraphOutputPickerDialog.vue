<template>
  <StandardDialog :visible="visible" size="sm"  :title="t('processDesigner.insertGraphOutput')" @update:visible="shown => { if (!shown) emit('close'); }">
    <div class="flex max-h-[70vh] min-w-72 flex-col gap-1 overflow-y-auto">
      <div v-for="output in outputs" :key="output.executionInstanceId + ':' + output.outputId" class="flex items-center gap-1">
        <Button :label="output.label + ' · ' + output.count" icon="pi pi-sitemap" text class="min-w-0 flex-1 justify-start" @click="emit('pick', liveCollectionEmbed(output))" />
        <Button
          icon="pi pi-bookmark"
          text
          size="small"
          severity="secondary"
          :aria-label="t('processDesigner.freezeCollectionOutput')"
          :title="t('processDesigner.freezeCollectionOutput')"
          :loading="capturingKey === output.executionInstanceId + ':' + output.outputId"
          @click="pickFrozen(output)"
        />
      </div>
      <div v-if="!loading && !outputs.length" class="py-3 text-supporting text-muted">{{ t('processDesigner.noSavedCollectionOutputs') }}</div>
      <div v-if="loading" class="py-3 text-supporting text-muted">{{ t('processDesigner.loading') }}</div>
      <div v-if="captureFailed" class="py-1 text-supporting text-muted">{{ t('processDesigner.collectionOutputUnavailable') }}</div>
    </div>
  </StandardDialog>
</template>

<script setup>
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
import StandardDialog from '~/components/shared/StandardDialog.vue';
import { frozenCollectionEmbed, liveCollectionEmbed } from './graph-output-embed-contract.js';

const { t } = useI18n();
const props = defineProps({ visible: { type: Boolean, default: false } });
const emit = defineEmits(['close', 'pick']);
const outputs = ref([]);
const loading = ref(false);
const capturingKey = ref('');
const captureFailed = ref(false);
watch(() => props.visible, async visible => {
  if (!visible) return;
  loading.value = true;
  try {
    outputs.value = await $fetch('/api/graph-executions/collection-outputs');
  } catch {
    outputs.value = [];
  } finally {
    loading.value = false;
  }
}, { immediate: true });
async function pickFrozen(output) {
  capturingKey.value = output.executionInstanceId + ':' + output.outputId;
  captureFailed.value = false;
  try {
    const resolved = await $fetch(`/api/graph-executions/collection-outputs/${encodeURIComponent(output.executionInstanceId)}/${encodeURIComponent(output.outputId)}`, { query: { graphDocumentInstanceId: output.graphDocumentInstanceId, graphId: output.graphId, graphRevision: output.graphRevision } });
    emit('pick', frozenCollectionEmbed(output, resolved));
  } catch {
    captureFailed.value = true;
  } finally {
    capturingKey.value = '';
  }
}
</script>
